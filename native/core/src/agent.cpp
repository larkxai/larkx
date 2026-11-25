#include "larkx/agent.hpp"

#include "larkx.h"
#include "larkx/json.hpp"
#include "larkx/store.hpp"

#include <cstdint>
#include <cstdio>
#include <mutex>
#include <unordered_map>
#include <utility>

namespace larkx {
namespace {

struct Retry {
  int32_t max_attempts = 1;
  int64_t initial_ms = 0;
  int64_t max_interval_ms = 0;
  bool exponential = false;
};

struct ToolDef {
  std::string name;
  std::string description;
  Json schema;
  EffectType effect = EffectType::Pure;
  Retry retry;
};

struct Limits {
  int32_t max_iterations = 8;
  int32_t max_tool_calls = 16;
  int32_t max_invalid = 3;
  int32_t max_context_chars = 12000;
  Retry model;
};

struct RemoteDef {
  std::string name;
  std::string description;
  Json schema;
  std::string endpoint;
  DelegationCapabilities capabilities;
  int64_t poll_interval_ms = 1000;
};

struct AgentRecord {
  std::string name;
  int32_t version = 1;
  std::string instructions;
  std::string model_id;
  std::string model_name;
  bool tool_calling = true;
  bool allow_remote = false;
  std::vector<ToolDef> tools;
  std::vector<RemoteDef> remotes;
  Limits limits;
};

struct Call {
  std::string id;
  std::string name;
  Json arguments;
};

struct Decision {
  std::string message;
  bool message_null = true;
  std::string finish;
  std::vector<Call> calls;
};

struct ToolResult {
  bool ok = false;
  std::string name;
  std::string call_id;
  Json output;
  std::string error;
};

Json jstr(std::string text) {
  Json value;
  value.kind = Json::Kind::String;
  value.text = std::move(text);
  return value;
}

Json jnum(int64_t number) {
  Json value;
  value.kind = Json::Kind::Number;
  value.text = std::to_string(number);
  return value;
}

Json jbool(bool value) {
  Json json;
  json.kind = Json::Kind::Bool;
  json.boolean = value;
  return json;
}

Json jnull() { return {}; }

std::string obj(std::vector<std::pair<std::string, Json>> fields) {
  Json object;
  object.kind = Json::Kind::Object;
  object.object = std::move(fields);
  return canonical_json(object);
}

const Json* field(const Json& object, std::string_view key) {
  if (object.kind != Json::Kind::Object) {
    return nullptr;
  }
  for (const auto& entry : object.object) {
    if (entry.first == key) {
      return &entry.second;
    }
  }
  return nullptr;
}

Status parse_any(std::string_view text, Json& out) {
  std::string error;
  if (!parse_json(text, out, error)) {
    return Status::fail(Code::Serialization, error.empty() ? "JSON is invalid." : error);
  }
  return Status::success();
}

Status state_error(std::string message) { return Status::fail(Code::State, std::move(message)); }

std::string error_json(const std::string& code, const std::string& message, bool retryable) {
  return obj({{"code", jstr(code)}, {"message", jstr(message)}, {"retryable", jbool(retryable)}});
}

std::string fingerprint(const std::string& text) {
  auto mix = [](uint64_t seed, const std::string& value) {
    uint64_t hash = seed;
    for (unsigned char character : value) {
      hash ^= character;
      hash *= 1099511628211ull;
    }
    return hash;
  };
  const uint64_t left = mix(14695981039346656037ull, text);
  const uint64_t right = mix(1099511628211ull, text);
  char hex[33];
  std::snprintf(hex, sizeof(hex), "%016llx%016llx", static_cast<unsigned long long>(left),
                static_cast<unsigned long long>(right));
  return hex;
}

std::string scoped_id(const char* prefix, const std::string& run_id, const std::string& rest) {
  const std::string direct = std::string(prefix) + run_id + "-" + rest;
  if (direct.size() <= 200) {
    return direct;
  }
  return std::string(prefix) + fingerprint(run_id) + "-" + rest;
}

std::string event_id(const State& state, int extra) {
  return scoped_id("ev-", state.run.run_id, std::to_string(state.events.size() + 1 + static_cast<size_t>(extra)));
}

std::string trim_copy(std::string_view text) {
  size_t begin = 0;
  while (begin < text.size() && (text[begin] == ' ' || text[begin] == '\t' || text[begin] == '\n' || text[begin] == '\r')) {
    begin += 1;
  }
  size_t end = text.size();
  while (end > begin && (text[end - 1] == ' ' || text[end - 1] == '\t' || text[end - 1] == '\n' || text[end - 1] == '\r')) {
    end -= 1;
  }
  return std::string(text.substr(begin, end - begin));
}

bool tool_name_ok(std::string_view name) {
  if (name.empty() || name.size() > 64) {
    return false;
  }
  const auto head = static_cast<unsigned char>(name.front());
  if (head < 'a' || head > 'z') {
    return false;
  }
  for (unsigned char c : name) {
    if (!((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_')) {
      return false;
    }
  }
  return true;
}

bool integer_lexeme(const std::string& text) {
  if (text.empty()) {
    return false;
  }
  size_t index = text[0] == '-' ? 1 : 0;
  if (index >= text.size()) {
    return false;
  }
  if (text[index] == '0') {
    return text.size() == index + 1;
  }
  for (; index < text.size(); index += 1) {
    if (text[index] < '0' || text[index] > '9') {
      return false;
    }
  }
  return true;
}

int64_t positive_or(int32_t value, int32_t fallback, const char* label, Status& status) {
  const int32_t resolved = value == 0 ? fallback : value;
  if (resolved < 1) {
    status = Status::fail(Code::InvalidArgument, std::string(label) + " must be an integer >= 1.");
    return 0;
  }
  return resolved;
}

Status resolve_retry(int32_t max_attempts, int64_t initial, int64_t max_interval, const std::string& backoff, int32_t default_attempts,
                     int64_t default_initial, int64_t default_max, bool default_exponential, Retry& out) {
  out.max_attempts = max_attempts == 0 ? default_attempts : max_attempts;
  out.initial_ms = initial < 0 ? default_initial : initial;
  out.max_interval_ms = max_interval < 0 ? default_max : max_interval;
  if (backoff.empty()) {
    out.exponential = default_exponential;
  } else if (backoff == "fixed") {
    out.exponential = false;
  } else if (backoff == "exponential") {
    out.exponential = true;
  } else {
    return Status::fail(Code::InvalidArgument, "Retry backoff must be fixed or exponential.");
  }
  if (out.max_attempts < 1 || out.initial_ms < 0 || out.max_interval_ms < out.initial_ms) {
    return Status::fail(Code::InvalidArgument, "Retry policy is invalid.");
  }
  return Status::success();
}

int64_t retry_delay(const Retry& policy, int32_t failed_attempt) {
  if (!policy.exponential || failed_attempt <= 1) {
    return policy.initial_ms;
  }
  int64_t factor = 1;
  for (int32_t i = 1; i < failed_attempt; i += 1) {
    if (factor > (INT64_C(1) << 62) / 2) {
      return policy.max_interval_ms;
    }
    factor *= 2;
  }
  if (policy.initial_ms > 0 && factor > INT64_MAX / policy.initial_ms) {
    return policy.max_interval_ms;
  }
  const int64_t raw = policy.initial_ms * factor;
  return raw > policy.max_interval_ms ? policy.max_interval_ms : raw;
}

std::string schema_error(const Json& schema, const Json& value, const std::string& path, int depth);

bool same_json(const Json& left, const Json& right) { return canonical_json(left) == canonical_json(right); }

std::string schema_error(const Json& schema, const Json& value, const std::string& path, int depth) {
  if (depth > 32) {
    return path + " is too deep.";
  }
  const auto* type_field = field(schema, "type");
  if (type_field == nullptr || type_field->kind != Json::Kind::String) {
    return path + " has an unsupported schema.";
  }
  if (const auto* choices = field(schema, "enum"); choices != nullptr && choices->kind == Json::Kind::Array) {
    bool found = false;
    for (const auto& choice : choices->array) {
      if (same_json(choice, value)) {
        found = true;
      }
    }
    if (!found) {
      return path + " is not an allowed value.";
    }
  }
  const std::string& type = type_field->text;
  if (type == "null") {
    return value.kind == Json::Kind::Null ? "" : path + " must be null.";
  }
  if (type == "string") {
    return value.kind == Json::Kind::String ? "" : path + " must be a string.";
  }
  if (type == "boolean") {
    return value.kind == Json::Kind::Bool ? "" : path + " must be a boolean.";
  }
  if (type == "number") {
    return value.kind == Json::Kind::Number ? "" : path + " must be a number.";
  }
  if (type == "integer") {
    return value.kind == Json::Kind::Number && integer_lexeme(value.text) ? "" : path + " must be an integer.";
  }
  if (type == "array") {
    if (value.kind != Json::Kind::Array) {
      return path + " must be an array.";
    }
    const auto* items = field(schema, "items");
    if (items == nullptr) {
      return path + " is missing an item schema.";
    }
    for (size_t index = 0; index < value.array.size(); index += 1) {
      const std::string item = schema_error(*items, value.array[index], path + "[" + std::to_string(index) + "]", depth + 1);
      if (!item.empty()) {
        return item;
      }
    }
    return "";
  }
  if (type != "object") {
    return path + " has an unsupported schema.";
  }
  if (value.kind != Json::Kind::Object) {
    return path + " must be an object.";
  }
  const Json* properties = field(schema, "properties");
  const Json* required = field(schema, "required");
  if (required != nullptr && required->kind == Json::Kind::Array) {
    for (const auto& item : required->array) {
      if (item.kind == Json::Kind::String && field(value, item.text) == nullptr) {
        return path + "." + item.text + " is required.";
      }
    }
  }
  const bool allow_additional = field(schema, "additionalProperties") != nullptr &&
                                field(schema, "additionalProperties")->kind == Json::Kind::Bool &&
                                field(schema, "additionalProperties")->boolean;
  for (const auto& entry : value.object) {
    if (entry.first == "__proto__" || entry.first == "prototype" || entry.first == "constructor") {
      return path + "." + entry.first + " is not allowed.";
    }
    const Json* property = properties == nullptr ? nullptr : field(*properties, entry.first);
    if (property == nullptr) {
      if (!allow_additional) {
        return path + "." + entry.first + " is not a property of this tool.";
      }
      continue;
    }
    const std::string nested = schema_error(*property, entry.second, path + "." + entry.first, depth + 1);
    if (!nested.empty()) {
      return nested;
    }
  }
  return "";
}

const RemoteDef* find_remote(const AgentRecord& agent, const std::string& name) {
  for (const auto& remote : agent.remotes) {
    if (remote.name == name) {
      return &remote;
    }
  }
  return nullptr;
}

const Delegation* find_delegation(const State& state, const std::string& step_key) {
  for (const auto& row : state.delegations) {
    if (row.step_key == step_key) {
      return &row;
    }
  }
  return nullptr;
}

bool task_id_ok(const std::string& id) {
  if (id.empty() || id.size() > 128) {
    return false;
  }
  for (unsigned char character : id) {
    const bool digit = character >= '0' && character <= '9';
    const bool upper = character >= 'A' && character <= 'Z';
    const bool lower = character >= 'a' && character <= 'z';
    const bool mark = character == '-' || character == '_' || character == '.' || character == ':';
    if (!digit && !upper && !lower && !mark) {
      return false;
    }
  }
  return true;
}

Status normalize_endpoint(std::string& endpoint) {
  endpoint = trim_copy(endpoint);
  if (endpoint.rfind("https://", 0) != 0 && endpoint.rfind("http://", 0) != 0) {
    return Status::fail(Code::InvalidArgument, "Remote endpoint must be an http or https URL.");
  }
  if (endpoint.find(' ') != std::string::npos || endpoint.find('#') != std::string::npos ||
      endpoint.find('?') != std::string::npos) {
    return Status::fail(Code::InvalidArgument, "Remote endpoint cannot include whitespace, a query, or a fragment.");
  }
  const auto scheme = endpoint.find("://");
  const std::string rest = endpoint.substr(scheme + 3);
  if (rest.empty() || rest.find('@') != std::string::npos) {
    return Status::fail(Code::InvalidArgument, "Remote endpoint cannot include URL credentials.");
  }
  const auto slash = rest.find('/');
  const std::string host = slash == std::string::npos ? rest : rest.substr(0, slash);
  if (host.empty() || host.front() == ':') {
    return Status::fail(Code::InvalidArgument, "Remote endpoint is missing a host.");
  }
  if (endpoint.size() > 200) {
    return Status::fail(Code::InvalidArgument, "Remote endpoint is too long.");
  }
  if (slash != std::string::npos && slash + 1 == rest.size()) {
    endpoint.pop_back();
  }
  return Status::success();
}

std::string transport_id_for(const std::string& endpoint) { return "http:" + endpoint; }

bool delegation_terminal(DelegationState state) {
  return state == DelegationState::Completed || state == DelegationState::Failed || state == DelegationState::Cancelled ||
         state == DelegationState::UnknownOutcome;
}

const ToolDef* find_tool(const AgentRecord& agent, const std::string& name) {
  for (const auto& tool : agent.tools) {
    if (tool.name == name) {
      return &tool;
    }
  }
  return nullptr;
}

const Step* find_key(const State& state, const std::string& key) { return find_step(state, key); }

const Attempt* open_attempt(const State& state, const std::string& step_key) {
  for (auto it = state.attempts.rbegin(); it != state.attempts.rend(); ++it) {
    if (it->step_key == step_key && it->status == AttemptStatus::Started) {
      return &*it;
    }
  }
  return nullptr;
}

const Attempt* attempt_by_id(const State& state, const std::string& attempt_id) {
  for (const auto& attempt : state.attempts) {
    if (attempt.attempt_id == attempt_id) {
      return &attempt;
    }
  }
  return nullptr;
}

Json call_json(const Call& call) {
  Json value;
  value.kind = Json::Kind::Object;
  value.object = {{"arguments", call.arguments}, {"id", jstr(call.id)}, {"name", jstr(call.name)}};
  return value;
}

Status require_registered_model(const State& state, const AgentRecord& agent) {
  for (auto it = state.steps.rbegin(); it != state.steps.rend(); ++it) {
    if (it->step_key.rfind("model-", 0) != 0 || it->status != StepStatus::Completed || !it->output_json.has_value()) {
      continue;
    }
    Json output;
    if (auto status = parse_any(*it->output_json, output); !status.ok()) {
      return status;
    }
    const auto* provider = field(output, "provider");
    const auto* model = field(output, "model");
    if (provider == nullptr || model == nullptr || provider->kind != Json::Kind::String ||
        model->kind != Json::Kind::String) {
      return Status::success();
    }
    if (provider->text != agent.model_id || model->text != agent.model_name) {
      return state_error("Registered model \"" + agent.model_id + "/" + agent.model_name +
                          "\" does not match the committed model \"" + provider->text + "/" + model->text + "\".");
    }
    return Status::success();
  }
  return Status::success();
}

Json decision_json(const AgentRecord& agent, const Decision& decision) {
  Json calls;
  calls.kind = Json::Kind::Array;
  for (const auto& call : decision.calls) {
    calls.array.push_back(call_json(call));
  }
  Json object;
  object.kind = Json::Kind::Object;
  object.object = {{"calls", std::move(calls)},
                   {"finish", jstr(decision.finish)},
                   {"message", decision.message_null ? jnull() : jstr(decision.message)},
                   {"model", jstr(agent.model_name)},
                   {"provider", jstr(agent.model_id)}};
  return object;
}

Json tool_result_json(const ToolResult& result) {
  Json object;
  object.kind = Json::Kind::Object;
  Json error = jnull();
  if (!result.ok && !result.error.empty()) {
    error = jstr(result.error);
  }
  Json output = jnull();
  if (result.ok) {
    output = result.output;
  }
  object.object = {{"callId", jstr(result.call_id)}, {"error", std::move(error)}, {"name", jstr(result.name)},
                   {"ok", jbool(result.ok)}, {"output", std::move(output)}};
  return object;
}

Status read_decision(const Json& value, Decision& out) {
  if (value.kind != Json::Kind::Object) {
    return state_error("Stored model decision is invalid.");
  }
  const auto* finish = field(value, "finish");
  const auto* message = field(value, "message");
  const auto* calls = field(value, "calls");
  if (finish == nullptr || finish->kind != Json::Kind::String || message == nullptr || calls == nullptr ||
      calls->kind != Json::Kind::Array) {
    return state_error("Stored model decision is invalid.");
  }
  if (finish->text != "stop" && finish->text != "tool_calls" && finish->text != "length" && finish->text != "error") {
    return state_error("Stored model decision is invalid.");
  }
  if (message->kind != Json::Kind::Null && message->kind != Json::Kind::String) {
    return state_error("Stored model decision is invalid.");
  }
  out.finish = finish->text;
  out.message_null = message->kind == Json::Kind::Null;
  out.message = out.message_null ? "" : message->text;
  out.calls.clear();
  for (const auto& call : calls->array) {
    const auto* id = field(call, "id");
    const auto* name = field(call, "name");
    const auto* arguments = field(call, "arguments");
    if (id == nullptr || name == nullptr || arguments == nullptr || id->kind != Json::Kind::String ||
        name->kind != Json::Kind::String || arguments->kind != Json::Kind::Object) {
      return state_error("Stored tool call is invalid.");
    }
    out.calls.push_back(Call{id->text, name->text, *arguments});
  }
  return Status::success();
}

Status read_tool_result(const Json& value, ToolResult& out) {
  const auto* ok = field(value, "ok");
  const auto* name = field(value, "name");
  const auto* call_id = field(value, "callId");
  const auto* error = field(value, "error");
  const auto* output = field(value, "output");
  if (ok == nullptr || name == nullptr || call_id == nullptr || error == nullptr || ok->kind != Json::Kind::Bool ||
      name->kind != Json::Kind::String || call_id->kind != Json::Kind::String ||
      (error->kind != Json::Kind::Null && error->kind != Json::Kind::String)) {
    return state_error("Stored tool result is invalid.");
  }
  out.ok = ok->boolean;
  out.name = name->text;
  out.call_id = call_id->text;
  out.error = error->kind == Json::Kind::String ? error->text : "";
  out.output = output == nullptr || !out.ok ? Json{} : *output;
  return Status::success();
}

Json message_json(const std::string& role, const std::string& content) {
  Json value;
  value.kind = Json::Kind::Object;
  value.object = {{"content", jstr(content)}, {"role", jstr(role)}};
  return value;
}

Status append_transcript(const State& state, Json& messages, int& tool_calls, int& invalid_streak) {
  for (const auto& step : state.steps) {
    if (step.status != StepStatus::Completed || !step.output_json.has_value()) {
      break;
    }
    Json output;
    if (auto status = parse_any(*step.output_json, output); !status.ok()) {
      return status;
    }
    if (step.step_key.rfind("model-", 0) == 0) {
      Decision decision;
      if (auto status = read_decision(output, decision); !status.ok()) {
        return status;
      }
      if (decision.finish == "stop" || decision.finish == "length") {
        break;
      }
      Json calls;
      calls.kind = Json::Kind::Array;
      for (const auto& call : decision.calls) {
        calls.array.push_back(call_json(call));
      }
      Json assistant;
      assistant.kind = Json::Kind::Object;
      assistant.object = {{"calls", std::move(calls)},
                          {"content", decision.message_null ? jnull() : jstr(decision.message)},
                          {"role", jstr("assistant")}};
      messages.array.push_back(std::move(assistant));
    } else {
      ToolResult result;
      if (auto status = read_tool_result(output, result); !status.ok()) {
        return status;
      }
      const std::string content = result.ok ? "Untrusted tool output: " + canonical_json(result.output)
                                           : "Tool error: " + (result.error.empty() ? "The tool rejected the call." : result.error);
      Json tool;
      tool.kind = Json::Kind::Object;
      tool.object = {{"callId", jstr(result.call_id)}, {"content", jstr(content)}, {"name", jstr(result.name)}, {"role", jstr("tool")}};
      messages.array.push_back(std::move(tool));
      tool_calls += 1;
      if (result.ok) {
        invalid_streak = 0;
      } else {
        invalid_streak += 1;
      }
    }
  }
  return Status::success();
}

Status messages_for(const AgentRecord& agent, const std::string& user, const State& state, Json& messages, int& tool_calls,
                     int& invalid_streak) {
  messages = Json{};
  messages.kind = Json::Kind::Array;
  messages.array.push_back(message_json("system", agent.instructions));
  messages.array.push_back(message_json("user", user));
  tool_calls = 0;
  invalid_streak = 0;
  return append_transcript(state, messages, tool_calls, invalid_streak);
}

int tool_index(const std::string& step_key) {
  const auto dash = step_key.rfind('-');
  if (dash == std::string::npos || dash + 1 >= step_key.size()) {
    return -1;
  }
  int value = 0;
  for (size_t index = dash + 1; index < step_key.size(); index += 1) {
    if (step_key[index] < '0' || step_key[index] > '9') {
      return -1;
    }
    value = value * 10 + (step_key[index] - '0');
  }
  return value;
}

struct RemoteAction {
  std::string name;
  std::string reason;
};

RemoteAction remote_recovery_action(const Delegation& row) {
  RemoteAction action;
  if (row.task_id.has_value()) {
    if (row.cancel_intent && row.capabilities.cancel) {
      action.name = "cancel";
      return action;
    }
    if (row.cancel_intent) {
      action.name = "local-cancel";
      action.reason =
          "The remote adapter cannot cancel this task. The local run is cancelled. The remote task may still be active.";
      return action;
    }
    if (!row.capabilities.poll) {
      action.name = "unknown";
      action.reason = "The remote task id is known, but the adapter cannot poll it.";
      return action;
    }
    action.name = "poll";
    return action;
  }
  if (row.cancel_intent) {
    if (row.state == DelegationState::Queued) {
      action.name = "local-cancel";
      action.reason = "The queued remote request was cancelled before it was sent.";
      return action;
    }
    if (row.capabilities.lookup) {
      action.name = "lookup";
      return action;
    }
    action.name = "unknown";
    action.reason = "Cancellation cannot prove whether the remote task was created.";
    return action;
  }
  if (row.state == DelegationState::Queued) {
    action.name = "submit";
    return action;
  }
  if (row.capabilities.lookup) {
    action.name = "lookup";
    return action;
  }
  if (row.capabilities.dedupe) {
    action.name = "submit";
    return action;
  }
  action.name = "unknown";
  action.reason =
      "The remote acknowledgement was lost and the adapter cannot look the operation up or dedupe it.";
  return action;
}

Status model_call_for(const State& state, const std::string& step_key, Call& out) {
  const int index = tool_index(step_key);
  if (index < 0) {
    return state_error("Remote step does not match a model call.");
  }
  for (auto it = state.steps.rbegin(); it != state.steps.rend(); ++it) {
    if (it->step_key.rfind("model-", 0) != 0 || it->status != StepStatus::Completed || !it->output_json.has_value()) {
      continue;
    }
    Json output;
    if (auto status = parse_any(*it->output_json, output); !status.ok()) {
      return status;
    }
    Decision decision;
    if (auto status = read_decision(output, decision); !status.ok()) {
      return status;
    }
    if (static_cast<size_t>(index) >= decision.calls.size()) {
      return state_error("Remote step does not match a model call.");
    }
    out = decision.calls[static_cast<size_t>(index)];
    return Status::success();
  }
  return state_error("Remote step does not match a model call.");
}

}  // namespace

struct Runtime::Impl {
  std::unique_ptr<Store> store;
  bool may_steal = false;
  std::string owner_id;
  int64_t lease_ms = 0;
  std::mutex mutex;
  std::unordered_map<std::string, AgentRecord> agents;
  std::unordered_map<std::string, std::string> issued;
  std::unordered_map<std::string, std::string> remote_issued;

  Status load(const std::string& run_id, State& state) {
    std::optional<State> loaded;
    if (auto status = store->load_state(run_id, loaded); !status.ok()) {
      return status;
    }
    if (!loaded.has_value()) {
      return Status::fail(Code::NotFound, "Run " + run_id + " does not exist.");
    }
    state = std::move(*loaded);
    return Status::success();
  }

  Status own(const std::string& run_id, int64_t now_ms, Fence& fence) {
    ClaimInput input;
    input.owner_id = owner_id;
    input.now_ms = now_ms;
    input.lease_ms = lease_ms;
    input.may_steal = may_steal;
    input.exclusive = store->exclusive();
    ClaimOutcome outcome;
    if (auto status = store->claim(run_id, input, outcome); !status.ok()) {
      return status;
    }
    if (!outcome.acquired) {
      return Status::fail(Code::Ownership, outcome.reason.empty() ? "Run is owned by another execution." : outcome.reason);
    }
    fence = Fence{owner_id, outcome.epoch};
    return Status::success();
  }

  const AgentRecord* agent_for(const Run& run) const {
    const auto found = agents.find(run.workflow_name + "\n" + std::to_string(run.workflow_version));
    return found == agents.end() ? nullptr : &found->second;
  }

  Status user_text(const Run& run, std::string& message) const {
    Json input;
    if (auto status = parse_any(run.input_json, input); !status.ok()) {
      return status;
    }
    const auto* text = field(input, "message");
    if (text == nullptr || text->kind != Json::Kind::String || trim_copy(text->text).empty()) {
      return state_error("Agent input message must be a non-empty string.");
    }
    message = text->text;
    return Status::success();
  }

  Status fail_run(State& state, const Fence& fence, int64_t now_ms, const std::string& code, const std::string& message) {
    TransitionInput input;
    input.fence = fence;
    input.now_ms = now_ms;
    input.to = WorkflowStatus::Failed;
    input.event_type = "WORKFLOW_FAILED";
    input.event_id = event_id(state, 0);
    input.payload_json = obj({{"code", jstr(code)}});
    input.error_json = error_json(code, message, false);
    input.set_error = true;
    return store->transition_run(input, state.run.run_id);
  }

  Status begin_frontier(State& state, const Fence& fence, int64_t now_ms, const std::string& key, int32_t order,
                        EffectType effect, ExecutionTarget target, const std::string& operation, std::string& attempt_id) {
    const Step* existing = find_key(state, key);
    const int32_t number = existing == nullptr ? 1 : existing->attempt_count + 1;
    attempt_id = scoped_id("at-", state.run.run_id, key + "-" + std::to_string(number));
    BeginStepInput input;
    input.fence = fence;
    input.now_ms = now_ms;
    input.step_key = key;
    input.step_order = order;
    input.effect_type = effect;
    input.execution_target = target;
    input.operation_id = operation;
    input.descriptor_json = obj({{"effects", jstr(to_string(effect))}, {"execution", jstr(to_string(target))}});
    input.attempt_id = attempt_id;
    input.event_id = event_id(state, 0);
    return store->begin_step(input, state.run.run_id);
  }

  Status finish_request(const State& state, const Step& step, const Attempt& attempt, const std::string& tool_name,
                        ExecRequest& out, std::string detail) {
    out.kind = step.step_key.rfind("model-", 0) == 0 ? LARKX_REQUEST_INVOKE_MODEL : LARKX_REQUEST_INVOKE_TOOL;
    out.request_id = attempt.attempt_id;
    out.step_key = step.step_key;
    out.operation_id = step.operation_id;
    out.tool_name = tool_name;
    out.attempt = attempt.attempt_number;
    out.effect_type = to_string(step.effect_type);
    out.cancel_requested = state.run.cancel_requested;
    out.has_wait_until = false;
    out.detail_json = std::move(detail);
    issued[state.run.run_id] = attempt.attempt_id;
    return Status::success();
  }

  Status fill_model_detail(const AgentRecord& agent, const State& state, const std::string& user, std::string& detail,
                           int& tool_calls, int& invalid_streak) {
    Json messages;
    if (auto status = messages_for(agent, user, state, messages, tool_calls, invalid_streak); !status.ok()) {
      return status;
    }
    if (canonical_json(messages).size() > static_cast<size_t>(agent.limits.max_context_chars)) {
      return state_error("Context limit exceeded.");
    }
    (void)tool_calls;
    (void)invalid_streak;
    Json tools;
    tools.kind = Json::Kind::Array;
    for (const auto& tool : agent.tools) {
      Json item;
      item.kind = Json::Kind::Object;
      item.object = {{"description", jstr(tool.description)}, {"inputSchema", tool.schema}, {"name", jstr(tool.name)}};
      tools.array.push_back(std::move(item));
    }
    for (const auto& remote : agent.remotes) {
      Json item;
      item.kind = Json::Kind::Object;
      item.object = {{"description", jstr(remote.description)}, {"inputSchema", remote.schema}, {"name", jstr(remote.name)}};
      tools.array.push_back(std::move(item));
    }
    Json request;
    request.kind = Json::Kind::Object;
    request.object = {{"messages", std::move(messages)}, {"tools", std::move(tools)}};
    detail = canonical_json(request);
    return Status::success();
  }

  Status model_request(State state, const AgentRecord& agent, const Fence& fence, int64_t now_ms, const std::string& key,
                       int32_t order, const std::string& user, ExecRequest& out) {
    const std::string operation = scoped_id("op-", state.run.run_id, key);
    std::string attempt;
    if (auto status = begin_frontier(state, fence, now_ms, key, order, EffectType::Idempotent, ExecutionTarget::Local, operation,
                                   attempt);
        !status.ok()) {
      return status;
    }
    if (auto status = load(state.run.run_id, state); !status.ok()) {
      return status;
    }
    int tool_calls = 0;
    int invalid_streak = 0;
    std::string detail;
    auto ready = fill_model_detail(agent, state, user, detail, tool_calls, invalid_streak);
    if (!agent.tool_calling && !agent.tools.empty()) {
      ready = state_error("Model \"" + agent.model_name + "\" does not support tool calls.");
    }
    if (!ready.ok()) {
      const std::string code = ready.message.find("does not support") != std::string::npos ? "unsupported_capability"
                                                                                           : "permanent_execution_failure";
      ResolveStepInput failed;
      failed.fence = fence;
      failed.now_ms = now_ms;
      failed.step_key = key;
      failed.attempt_id = attempt;
      failed.step_to = StepStatus::Failed;
      failed.attempt_status = AttemptStatus::Failed;
      failed.error_json = error_json(code, ready.message, false);
      failed.reason = "rejected";
      failed.event_id = event_id(state, 0);
      failed.run_to = WorkflowStatus::Failed;
      failed.run_event_id = event_id(state, 1);
      if (auto status = store->resolve_step(failed, state.run.run_id); !status.ok()) {
        return status;
      }
      out.kind = LARKX_REQUEST_FAILED;
      out.detail_json = *failed.error_json;
      out.cancel_requested = state.run.cancel_requested;
      issued.erase(state.run.run_id);
      return Status::success();
    }
    const Step* step = find_key(state, key);
    const Attempt* open = open_attempt(state, key);
    if (step == nullptr || open == nullptr) {
      return state_error("Model step was not recorded.");
    }
    return finish_request(state, *step, *open, "", out, std::move(detail));
  }

  Status tool_detail(const State& state, const Call& call, const Step& step, const Attempt& attempt, std::string& detail) {
    Json request;
    request.kind = Json::Kind::Object;
    request.object = {{"arguments", call.arguments},
                      {"attempt", jnum(attempt.attempt_number)},
                      {"callId", jstr(call.id)},
                      {"effects", jstr(to_string(step.effect_type))},
                      {"name", jstr(call.name)},
                      {"operationId", jstr(step.operation_id)},
                      {"runId", jstr(state.run.run_id)},
                      {"stepKey", jstr(step.step_key)}};
    detail = canonical_json(request);
    return Status::success();
  }

  Status reject_tool(State state, const Fence& fence, int64_t now_ms, const std::string& key, int32_t order, const Call& call,
                     const std::string& message, const ToolDef* tool) {
    const std::string operation = scoped_id("op-", state.run.run_id, key);
    std::string attempt;
    const EffectType effect = tool == nullptr ? EffectType::Pure : tool->effect;
    if (auto status = begin_frontier(state, fence, now_ms, key, order, effect, ExecutionTarget::Local, operation, attempt);
        !status.ok()) {
      return status;
    }
    if (auto status = load(state.run.run_id, state); !status.ok()) {
      return status;
    }
    ToolResult result;
    result.ok = false;
    result.name = call.name;
    result.call_id = call.id;
    result.error = message;
    CommitStepInput commit;
    commit.fence = fence;
    commit.now_ms = now_ms;
    commit.step_key = key;
    commit.attempt_id = attempt;
    commit.output_json = canonical_json(tool_result_json(result));
    commit.event_id = event_id(state, 0);
    return store->commit_step(commit, state.run.run_id);
  }

  Status handle_error(State state, const Fence& fence, int64_t now_ms, const Step& step, const Attempt& attempt, const Retry& policy,
                      const std::string& code, const std::string& message, bool retryable) {
    if (step.effect_type == EffectType::NonIdempotent && retryable) {
      MarkUnknownInput unknown;
      unknown.fence = fence;
      unknown.now_ms = now_ms;
      unknown.step_key = step.step_key;
      unknown.attempt_id = attempt.attempt_id;
      unknown.reason = "uncommitted";
      unknown.message = message.empty() ? "Non-idempotent step ended without a committed result." : message;
      unknown.step_event_id = event_id(state, 0);
      unknown.run_event_id = event_id(state, 1);
      if (auto status = store->mark_unknown(unknown, state.run.run_id); !status.ok()) {
        return status;
      }
      issued.erase(state.run.run_id);
      return Status::success();
    }
    if (code == "cancelled_execution") {
      ResolveStepInput resolve;
      resolve.fence = fence;
      resolve.now_ms = now_ms;
      resolve.step_key = step.step_key;
      resolve.attempt_id = attempt.attempt_id;
      resolve.step_to = StepStatus::Cancelled;
      resolve.attempt_status = AttemptStatus::Cancelled;
      resolve.error_json = error_json("cancelled_execution", message.empty() ? "Step cancelled." : message, false);
      resolve.reason = "cancelled";
      resolve.event_id = event_id(state, 0);
      if (auto status = store->resolve_step(resolve, state.run.run_id); !status.ok()) {
        return status;
      }
      if (auto status = load(state.run.run_id, state); !status.ok()) {
        return status;
      }
      TransitionInput transition;
      transition.fence = fence;
      transition.now_ms = now_ms;
      transition.to = WorkflowStatus::Cancelled;
      transition.event_type = "WORKFLOW_CANCELLED";
      transition.event_id = event_id(state, 0);
      transition.payload_json = obj({{"reason", jstr("cancelled")}});
      if (auto status = store->transition_run(transition, state.run.run_id); !status.ok()) {
        return status;
      }
      issued.erase(state.run.run_id);
      return Status::success();
    }
    if (retryable && attempt.attempt_number < policy.max_attempts) {
      ResolveStepInput resolve;
      resolve.fence = fence;
      resolve.now_ms = now_ms;
      resolve.step_key = step.step_key;
      resolve.attempt_id = attempt.attempt_id;
      resolve.step_to = StepStatus::RetryScheduled;
      resolve.attempt_status = AttemptStatus::Failed;
      resolve.error_json = error_json(code.empty() ? "transient_execution_failure" : code, message, true);
      resolve.next_attempt_at = now_ms + retry_delay(policy, attempt.attempt_number);
      resolve.reason = "retry";
      resolve.event_id = event_id(state, 0);
      if (auto status = store->resolve_step(resolve, state.run.run_id); !status.ok()) {
        return status;
      }
      issued.erase(state.run.run_id);
      return Status::success();
    }
    ResolveStepInput resolve;
    resolve.fence = fence;
    resolve.now_ms = now_ms;
    resolve.step_key = step.step_key;
    resolve.attempt_id = attempt.attempt_id;
    resolve.step_to = StepStatus::Failed;
    resolve.attempt_status = AttemptStatus::Failed;
    const std::string failure = code.empty() ? "permanent_execution_failure" : code;
    resolve.error_json = error_json(retryable ? "transient_execution_failure" : failure, message, false);
    resolve.reason = "failed";
    resolve.event_id = event_id(state, 0);
    resolve.run_to = WorkflowStatus::Failed;
    resolve.run_event_id = event_id(state, 1);
    if (auto status = store->resolve_step(resolve, state.run.run_id); !status.ok()) {
      return status;
    }
    issued.erase(state.run.run_id);
    return Status::success();
  }

  Status normalize_model(const AgentRecord& agent, const Json& response, std::string& stored) {
    const auto* finish = field(response, "finish");
    const auto* message = field(response, "message");
    const auto* calls = field(response, "calls");
    if (finish == nullptr || finish->kind != Json::Kind::String || message == nullptr || calls == nullptr ||
        calls->kind != Json::Kind::Array) {
      return state_error("Model response is invalid.");
    }
    if (finish->text != "stop" && finish->text != "tool_calls" && finish->text != "length" && finish->text != "error") {
      return state_error("Model finish reason is not supported.");
    }
    if (message->kind != Json::Kind::Null && message->kind != Json::Kind::String) {
      return state_error("Model message must be a string or null.");
    }
    if (finish->text == "error") {
      return state_error(message->kind == Json::Kind::String ? message->text : "Model returned an error.");
    }
    if (finish->text == "tool_calls" && calls->array.empty()) {
      return state_error("Model requested tool calls but did not name any.");
    }
    if (finish->text != "tool_calls" && !calls->array.empty()) {
      return state_error("Model returned tool calls without finish reason tool_calls.");
    }
    Decision decision;
    decision.finish = finish->text;
    decision.message_null = message->kind == Json::Kind::Null;
    decision.message = decision.message_null ? "" : message->text;
    int index = 0;
    for (const auto& call_value : calls->array) {
      const auto* name = field(call_value, "name");
      const auto* arguments = field(call_value, "arguments");
      const auto* id = field(call_value, "id");
      if (name == nullptr || name->kind != Json::Kind::String) {
        return state_error("A model tool call is missing a name.");
      }
      if (name->text.empty() || name->text.size() > 80) {
        return state_error("A model tool call name is empty or too long.");
      }
      if (arguments == nullptr || arguments->kind != Json::Kind::Object) {
        return state_error("Tool \"" + name->text + "\" arguments must be a JSON object.");
      }
      std::string call_id = id != nullptr && id->kind == Json::Kind::String && !id->text.empty()
                                ? id->text
                                : "call-" + std::to_string(index);
      if (call_id.size() > 200) {
        return state_error("A model tool call id is too long.");
      }
      decision.calls.push_back(Call{std::move(call_id), name->text, *arguments});
      index += 1;
    }
    stored = canonical_json(decision_json(agent, decision));
    return Status::success();
  }

  Status authorize_remote(const AgentRecord& agent, const Run& run, const Delegation& row) const {
    if (!agent.allow_remote || run.data_policy != DataPolicy::CloudAllowed ||
        !egress_allowed(run.data_policy, EgressDestination::RemoteAgent)) {
      return Status::fail(Code::InvalidArgument, "Remote delegation is not authorized for this run.");
    }
    const RemoteDef* remote = find_remote(agent, row.remote_agent);
    if (remote == nullptr || remote->endpoint != row.endpoint || transport_id_for(remote->endpoint) != row.transport_id) {
      return Status::fail(Code::InvalidArgument, "Remote destination is not registered.");
    }
    return Status::success();
  }

  Status finish_delegate(const State& state, const Delegation& row, const std::string& request_id, int32_t attempt,
                         ExecRequest& out) {
    Json input;
    if (auto status = parse_any(row.input_json, input); !status.ok()) {
      return status;
    }
    Json capabilities;
    capabilities.kind = Json::Kind::Object;
    capabilities.object = {{"cancel", jbool(row.capabilities.cancel)},
                            {"dedupe", jbool(row.capabilities.dedupe)},
                            {"durableTask", jbool(row.capabilities.durable_task)},
                            {"lookup", jbool(row.capabilities.lookup)},
                            {"persistent", jbool(row.capabilities.persistent)},
                            {"poll", jbool(row.capabilities.poll)}};
    out.kind = LARKX_REQUEST_DELEGATE;
    out.request_id = request_id;
    out.step_key = row.step_key;
    out.operation_id = row.operation_id;
    out.tool_name = row.remote_agent;
    out.attempt = attempt;
    out.effect_type = "non-idempotent";
    out.cancel_requested = state.run.cancel_requested;
    out.has_wait_until = false;
    out.detail_json = obj({{"action", jstr(row.inflight_action)},
                           {"capabilities", std::move(capabilities)},
                           {"endpoint", jstr(row.endpoint)},
                           {"input", std::move(input)},
                           {"operationId", jstr(row.operation_id)},
                           {"pollIntervalMs", jnum(row.poll_interval_ms)},
                           {"remoteAgent", jstr(row.remote_agent)},
                           {"taskId", row.task_id.has_value() ? jstr(*row.task_id) : jnull()},
                           {"transportId", jstr(row.transport_id)}});
    if (request_id.find(':') == std::string::npos) {
      issued[state.run.run_id] = request_id;
    } else {
      remote_issued[state.run.run_id] = request_id;
    }
    return Status::success();
  }

  Status fail_remote(State state, const Fence& fence, int64_t now_ms, const std::string& step_key, const std::string& code,
                     const std::string& message) {
    FailDelegationInput input;
    input.fence = fence;
    input.now_ms = now_ms;
    input.step_key = step_key;
    input.code = code;
    input.message = message;
    input.event_id = event_id(state, 0);
    input.run_event_id = event_id(state, 1);
    issued.erase(state.run.run_id);
    remote_issued.erase(state.run.run_id);
    return store->apply(state.run.run_id, [&](State& next) { return fail_delegation(next, input); });
  }

  Status unknown_remote(State state, const Fence& fence, int64_t now_ms, const std::string& step_key, const std::string& message) {
    MarkUnknownInput unknown;
    unknown.fence = fence;
    unknown.now_ms = now_ms;
    unknown.step_key = step_key;
    if (const Attempt* open = open_attempt(state, step_key); open != nullptr) {
      unknown.attempt_id = open->attempt_id;
    }
    unknown.reason = "remote_unknown";
    unknown.message = message;
    unknown.step_event_id = event_id(state, 0);
    unknown.run_event_id = event_id(state, 1);
    issued.erase(state.run.run_id);
    remote_issued.erase(state.run.run_id);
    return store->apply(state.run.run_id, [&](State& next) {
      if (auto status = mark_unknown(next, unknown); !status.ok()) {
        return status;
      }
      for (auto& row : next.delegations) {
        if (row.step_key == step_key) {
          row.state = DelegationState::UnknownOutcome;
          row.poll_inflight = false;
          row.inflight_action.clear();
          row.updated_at = now_ms;
        }
      }
      return Status::success();
    });
  }

  Status cancel_remote(State state, const Fence& fence, int64_t now_ms, const std::string& step_key, const std::string& message) {
    CancelDelegationInput input;
    input.fence = fence;
    input.now_ms = now_ms;
    input.step_key = step_key;
    input.message = message;
    input.event_id = event_id(state, 0);
    input.run_event_id = event_id(state, 1);
    issued.erase(state.run.run_id);
    remote_issued.erase(state.run.run_id);
    return store->apply(state.run.run_id, [&](State& next) { return cancel_delegation_step(next, input); });
  }

  int64_t remote_delay(const Delegation& row, int32_t failures) const {
    const int32_t shift = failures > 4 ? 4 : failures;
    int64_t delay = row.poll_interval_ms << shift;
    if (delay < row.poll_interval_ms) {
      delay = row.poll_interval_ms;
    }
    if (delay > 30000) {
      delay = 30000;
    }
    return delay;
  }

  Status schedule_remote_wait(const Fence& fence, int64_t now_ms, const std::string& run_id, const std::string& step_key,
                              DelegationState delegation_state, int32_t failures, bool queued) {
    return store->apply(run_id, [&](State& next) {
      if (!next.run.owner_id.has_value() || *next.run.owner_id != fence.owner_id || next.run.ownership_epoch != fence.epoch) {
        return Status::fail(Code::Ownership, "The execution owner fence does not match this run.");
      }
      Step* step = find_step(next, step_key);
      Delegation* row = nullptr;
      for (auto& candidate : next.delegations) {
        if (candidate.step_key == step_key) {
          row = &candidate;
        }
      }
      if (step == nullptr || row == nullptr) {
        return state_error("Remote delegation is missing.");
      }
      row->state = delegation_state;
      row->poll_failures = failures;
      row->poll_inflight = false;
      row->inflight_action.clear();
      row->updated_at = now_ms;
      const int64_t until = now_ms + remote_delay(*row, queued ? 0 : failures);
      step->next_attempt_at = until;
      step->updated_at = now_ms;
      next.run.updated_at = now_ms;
      return Status::success();
    });
  }

  Status issue_attempt(State state, const AgentRecord& agent, const Fence& fence, int64_t now_ms, const std::string& action,
                       ExecRequest& out, bool& again) {
    const Step& step = state.steps.back();
    const Attempt* open = open_attempt(state, step.step_key);
    if (open == nullptr) {
      return state_error("Running remote step has no open attempt.");
    }
    const std::string step_key = step.step_key;
    const std::string attempt_id = open->attempt_id;
    const int32_t number = open->attempt_number;
    if (auto status = store->apply(state.run.run_id, [&](State& next) {
          for (auto& row : next.delegations) {
            if (row.step_key == step_key) {
              row.inflight_action = action;
              if (action == "submit") {
                row.state = DelegationState::Submitting;
              }
              row.updated_at = now_ms;
            }
          }
          return Status::success();
        });
        !status.ok()) {
      return status;
    }
    if (auto status = load(state.run.run_id, state); !status.ok()) {
      return status;
    }
    const Delegation* row = find_delegation(state, step_key);
    if (row == nullptr) {
      return state_error("Remote delegation is missing.");
    }
    if (auto status = authorize_remote(agent, state.run, *row); !status.ok()) {
      again = true;
      return fail_remote(std::move(state), fence, now_ms, step_key, "unauthorized_destination", status.message);
    }
    return finish_delegate(state, *row, attempt_id, number, out);
  }

  Status issue_poll(State state, const AgentRecord& agent, const Fence& fence, int64_t now_ms, const std::string& step_key_ref,
                    const std::string& action_ref, ExecRequest& out, bool& again) {
    // step_key_ref aliases a step inside state. load() replaces state, so keep owned copies.
    const std::string step_key = step_key_ref;
    const std::string action = action_ref;
    const std::string run_id = state.run.run_id;
    const Delegation* existing = find_delegation(state, step_key);
    if (existing == nullptr) {
      return state_error("Remote delegation is missing.");
    }
    const std::string current_id = existing->operation_id + ":" + std::to_string(existing->poll_epoch);
    const auto inflight = remote_issued.find(run_id);
    if (existing->poll_inflight && inflight != remote_issued.end() && inflight->second == current_id &&
        existing->inflight_action == action) {
      return finish_delegate(state, *existing, current_id, existing->poll_epoch, out);
    }
    if (auto status = store->apply(run_id, [&](State& next) {
          for (auto& row : next.delegations) {
            if (row.step_key != step_key) {
              continue;
            }
            row.poll_epoch += 1;
            row.poll_inflight = true;
            row.inflight_action = action;
            row.updated_at = now_ms;
          }
          Step* step = find_step(next, step_key);
          if (step != nullptr) {
            step->next_attempt_at = std::nullopt;
            step->updated_at = now_ms;
          }
          return Status::success();
        });
        !status.ok()) {
      return status;
    }
    if (auto status = load(run_id, state); !status.ok()) {
      return status;
    }
    const Delegation* row = find_delegation(state, step_key);
    if (row == nullptr) {
      return state_error("Remote delegation is missing.");
    }
    if (auto status = authorize_remote(agent, state.run, *row); !status.ok()) {
      again = true;
      return fail_remote(std::move(state), fence, now_ms, step_key, "unauthorized_destination", status.message);
    }
    return finish_delegate(state, *row, row->operation_id + ":" + std::to_string(row->poll_epoch), row->poll_epoch, out);
  }

  Status resume_running_remote(State state, const AgentRecord& agent, const Fence& fence, int64_t now_ms, ExecRequest& out,
                               bool& again) {
    again = false;
    const Step& step = state.steps.back();
    const Attempt* open = open_attempt(state, step.step_key);
    const Delegation* row = find_delegation(state, step.step_key);
    if (open == nullptr || row == nullptr) {
      return state_error("Running remote step has no delegation.");
    }
    const auto issued_attempt = issued.find(state.run.run_id);
    if (issued_attempt != issued.end() && issued_attempt->second == open->attempt_id && !row->inflight_action.empty()) {
      if (auto status = authorize_remote(agent, state.run, *row); !status.ok()) {
        again = true;
        return fail_remote(std::move(state), fence, now_ms, step.step_key, "unauthorized_destination", status.message);
      }
      return finish_delegate(state, *row, open->attempt_id, open->attempt_number, out);
    }
    const RemoteAction action = remote_recovery_action(*row);
    if (action.name == "unknown") {
      again = true;
      return unknown_remote(std::move(state), fence, now_ms, step.step_key, action.reason);
    }
    if (action.name == "local-cancel") {
      again = true;
      return cancel_remote(std::move(state), fence, now_ms, step.step_key, action.reason);
    }
    if (action.name == "poll" && row->task_id.has_value()) {
      ParkDelegationInput park;
      park.fence = fence;
      park.now_ms = now_ms;
      park.step_key = step.step_key;
      park.attempt_id = open->attempt_id;
      park.event_id = event_id(state, 0);
      park.delegation_state = DelegationState::Accepted;
      park.task_id = row->task_id;
      park.next_attempt_at = now_ms;
      issued.erase(state.run.run_id);
      if (auto status = store->apply(state.run.run_id, [&](State& next) { return park_delegation(next, park); }); !status.ok()) {
        return status;
      }
      again = true;
      return Status::success();
    }
    return issue_attempt(std::move(state), agent, fence, now_ms, action.name, out, again);
  }

  Status continue_remote(State state, const AgentRecord& agent, const Fence& fence, int64_t now_ms, const Step& recorded,
                         ExecRequest& out, bool& again) {
    again = false;
    const Delegation* row = find_delegation(state, recorded.step_key);
    if (row == nullptr) {
      return state_error("Remote delegation is missing.");
    }
    if (auto status = authorize_remote(agent, state.run, *row); !status.ok()) {
      again = true;
      return fail_remote(std::move(state), fence, now_ms, recorded.step_key, "unauthorized_destination", status.message);
    }
    if (!row->cancel_intent && recorded.next_attempt_at.has_value() && *recorded.next_attempt_at > now_ms) {
      out.kind = LARKX_REQUEST_WAIT;
      out.step_key = recorded.step_key;
      out.operation_id = recorded.operation_id;
      out.tool_name = row->remote_agent;
      out.has_wait_until = true;
      out.wait_until_ms = *recorded.next_attempt_at;
      out.effect_type = "non-idempotent";
      out.cancel_requested = state.run.cancel_requested;
      const char* waiting_for = row->state == DelegationState::Queued ? "network" : "remote";
      out.detail_json = obj({{"until", jnum(*recorded.next_attempt_at)}, {"waitingFor", jstr(waiting_for)}});
      return Status::success();
    }
    const RemoteAction action = remote_recovery_action(*row);
    if (action.name == "unknown") {
      again = true;
      return unknown_remote(std::move(state), fence, now_ms, recorded.step_key, action.reason);
    }
    if (action.name == "local-cancel") {
      again = true;
      return cancel_remote(std::move(state), fence, now_ms, recorded.step_key, action.reason);
    }
    if (recorded.status == StepStatus::WaitingRemote) {
      return issue_poll(std::move(state), agent, fence, now_ms, recorded.step_key, action.name, out, again);
    }
    if (recorded.status != StepStatus::RetryScheduled) {
      return state_error("Cannot continue remote step \"" + recorded.step_key + "\" from " + std::string(to_string(recorded.status)) +
                         ".");
    }
    std::string attempt;
    if (auto status = begin_frontier(state, fence, now_ms, recorded.step_key, recorded.step_order, EffectType::NonIdempotent,
                                   ExecutionTarget::Hybrid, recorded.operation_id, attempt);
        !status.ok()) {
      return status;
    }
    if (auto status = load(state.run.run_id, state); !status.ok()) {
      return status;
    }
    return issue_attempt(std::move(state), agent, fence, now_ms, action.name, out, again);
  }

  Status start_remote(State state, const AgentRecord& agent, const Fence& fence, int64_t now_ms, const std::string& key,
                      int32_t order, const Call& call, const RemoteDef& remote, ExecRequest& out, bool& again) {
    if (!agent.allow_remote || state.run.data_policy != DataPolicy::CloudAllowed ||
        !egress_allowed(state.run.data_policy, EgressDestination::RemoteAgent)) {
      again = true;
      return fail_run(state, fence, now_ms, "unauthorized_destination", "Remote delegation is not authorized for this run.");
    }
    const std::string invalid = schema_error(remote.schema, call.arguments, "$", 0);
    if (!invalid.empty()) {
      again = true;
      return reject_tool(std::move(state), fence, now_ms, key, order, call,
                        "Invalid arguments for \"" + remote.name + "\": " + invalid.substr(0, 300), nullptr);
    }
    const std::string input_json = canonical_json(call.arguments);
    if (input_json.size() > 32768) {
      again = true;
      return reject_tool(std::move(state), fence, now_ms, key, order, call, "Remote request is larger than 32768 bytes.", nullptr);
    }
    const std::string operation = scoped_id("op-", state.run.run_id, key);
    const std::string attempt_id = scoped_id("at-", state.run.run_id, key + "-1");
    BeginStepInput step;
    step.fence = fence;
    step.now_ms = now_ms;
    step.step_key = key;
    step.step_order = order;
    step.execution_target = ExecutionTarget::Hybrid;
    step.effect_type = EffectType::NonIdempotent;
    step.operation_id = operation;
    step.input_json = input_json;
    step.attempt_id = attempt_id;
    step.event_id = event_id(state, 0);
    step.descriptor_json = obj({{"effects", jstr("non-idempotent")},
                               {"execution", jstr("hybrid")},
                               {"remoteAgent", jstr(remote.name)}});
    Delegation row;
    row.run_id = state.run.run_id;
    row.step_key = key;
    row.operation_id = operation;
    row.remote_agent = remote.name;
    row.endpoint = remote.endpoint;
    row.transport_id = transport_id_for(remote.endpoint);
    row.input_json = input_json;
    row.capabilities = remote.capabilities;
    row.state = DelegationState::Submitting;
    row.poll_interval_ms = remote.poll_interval_ms;
    row.inflight_action = "submit";
    row.created_at = now_ms;
    row.updated_at = now_ms;
    Json arguments;
    if (auto status = parse_any(input_json, arguments); !status.ok()) {
      return status;
    }
    const std::string outbox_payload = obj({{"endpoint", jstr(remote.endpoint)},
                                            {"input", std::move(arguments)},
                                            {"operationId", jstr(operation)},
                                            {"remoteAgent", jstr(remote.name)}});
    if (auto status = store->apply(state.run.run_id, [&](State& next) {
          if (auto begun = begin_step(next, step); !begun.ok()) {
            return begun;
          }
          next.delegations.push_back(row);
          OutboxInput box;
          box.fence = fence;
          box.now_ms = now_ms;
          box.message.message_id = scoped_id("ob-", next.run.run_id, key);
          box.message.run_id = next.run.run_id;
          box.message.step_key = key;
          box.message.operation_id = operation;
          box.message.payload_json = outbox_payload;
          box.message.status = OutboxStatus::Pending;
          box.message.attempt_count = 1;
          box.message.created_at = now_ms;
          box.message.updated_at = now_ms;
          if (auto queued = insert_outbox(next, box); !queued.status.ok()) {
            return queued.status;
          }
          const std::string payload = obj({{"endpoint", jstr(remote.endpoint)},
                                           {"operationId", jstr(operation)},
                                           {"remoteAgent", jstr(remote.name)},
                                           {"stepKey", jstr(key)}});
          return append_protocol_event(next, event_id(next, 0), "REMOTE_DISPATCH_QUEUED", payload, now_ms);
        });
        !status.ok()) {
      return status;
    }
    if (auto status = load(state.run.run_id, state); !status.ok()) {
      return status;
    }
    const Delegation* stored = find_delegation(state, key);
    if (stored == nullptr) {
      return state_error("Remote delegation was not recorded.");
    }
    return finish_delegate(state, *stored, attempt_id, 1, out);
  }

  Status prepare_remote_cancel(State state, const AgentRecord& agent, const Fence& fence, int64_t now_ms, ExecRequest& out, bool& again) {
    const Step& step = state.steps.back();
    const std::string step_key = step.step_key;
    if (auto status = store->apply(state.run.run_id, [&](State& next) {
          for (auto& row : next.delegations) {
            if (row.step_key == step_key) {
              row.cancel_intent = true;
              row.updated_at = now_ms;
            }
          }
          return Status::success();
        });
        !status.ok()) {
      return status;
    }
    if (auto status = load(state.run.run_id, state); !status.ok()) {
      return status;
    }
    if (state.steps.back().status == StepStatus::Running) {
      return resume_running_remote(std::move(state), agent, fence, now_ms, out, again);
    }
    // Copy before the move. Argument order may evaluate back() on the moved-from vector.
    const Step recorded = state.steps.back();
    return continue_remote(std::move(state), agent, fence, now_ms, recorded, out, again);
  }


  Status plan(State state, const AgentRecord& agent, const Fence& fence, int64_t now_ms, ExecRequest& out, bool& again) {
    again = false;
    if (!is_terminal(state.run.status)) {
      if (auto status = require_registered_model(state, agent); !status.ok()) {
        return status;
      }
    }
    const std::string run_id = state.run.run_id;
    if (state.run.cancel_requested && !is_terminal(state.run.status) && state.run.status != WorkflowStatus::Blocked &&
        !state.steps.empty() && state.steps.back().execution_target == ExecutionTarget::Hybrid &&
        state.steps.back().status != StepStatus::Completed && state.steps.back().status != StepStatus::Failed &&
        state.steps.back().status != StepStatus::Cancelled && state.steps.back().status != StepStatus::UnknownOutcome) {
      return prepare_remote_cancel(std::move(state), agent, fence, now_ms, out, again);
    }
    if (state.run.cancel_requested && (state.steps.empty() || state.steps.back().status != StepStatus::Running) &&
        !is_terminal(state.run.status) && state.run.status != WorkflowStatus::Blocked) {
      TransitionInput transition;
      transition.fence = fence;
      transition.now_ms = now_ms;
      transition.to = WorkflowStatus::Cancelled;
      transition.event_type = "WORKFLOW_CANCELLED";
      transition.event_id = event_id(state, 0);
      transition.payload_json = obj({{"reason", jstr("cancelled")}});
      if (auto status = store->transition_run(transition, run_id); !status.ok()) {
        return status;
      }
      again = true;
      return Status::success();
    }
    if (is_terminal(state.run.status)) {
      out.kind = state.run.status == WorkflowStatus::Completed ? LARKX_REQUEST_COMPLETE
                 : state.run.status == WorkflowStatus::Cancelled ? LARKX_REQUEST_CANCELLED
                                                                 : LARKX_REQUEST_FAILED;
      out.detail_json = state.run.status == WorkflowStatus::Completed ? state.run.output_json.value_or("{}")
                                                                      : state.run.error_json.value_or("{}");
      out.cancel_requested = state.run.cancel_requested;
      return Status::success();
    }
    if (state.run.status == WorkflowStatus::Waiting) {
      out.kind = LARKX_REQUEST_PAUSED;
      out.detail_json = "{}";
      return Status::success();
    }
    if (state.run.status == WorkflowStatus::Created) {
      TransitionInput transition;
      transition.fence = fence;
      transition.now_ms = now_ms;
      transition.to = WorkflowStatus::Running;
      transition.event_type = "WORKFLOW_STARTED";
      transition.event_id = event_id(state, 0);
      transition.payload_json = obj({{"workflowName", jstr(agent.name)}, {"workflowVersion", jnum(agent.version)}});
      if (auto status = store->transition_run(transition, run_id); !status.ok()) {
        return status;
      }
      again = true;
      return Status::success();
    }
    if (!state.steps.empty() && state.steps.back().status == StepStatus::Running) {
      if (state.steps.back().execution_target == ExecutionTarget::Hybrid) {
        return resume_running_remote(std::move(state), agent, fence, now_ms, out, again);
      }
      const Step& step = state.steps.back();
      const Attempt* open = open_attempt(state, step.step_key);
      if (open == nullptr) {
        return state_error("Running step has no open attempt.");
      }
      const auto issued_attempt = issued.find(run_id);
      if (issued_attempt != issued.end() && issued_attempt->second == open->attempt_id) {
        std::string user;
        if (auto status = user_text(state.run, user); !status.ok()) {
          return status;
        }
        std::string detail;
        if (step.step_key.rfind("model-", 0) == 0) {
          int ignored_tools = 0;
          int ignored_invalid = 0;
          if (auto status = fill_model_detail(agent, state, user, detail, ignored_tools, ignored_invalid); !status.ok()) {
            return status;
          }
        } else {
          Decision decision;
          bool found = false;
          for (auto it = state.steps.rbegin(); it != state.steps.rend(); ++it) {
            if (it->step_key.rfind("model-", 0) == 0 && it->output_json.has_value()) {
              Json output;
              if (auto status = parse_any(*it->output_json, output); !status.ok()) {
                return status;
              }
              if (auto status = read_decision(output, decision); !status.ok()) {
                return status;
              }
              found = true;
              break;
            }
          }
          if (!found) {
            return state_error("Tool step has no model decision.");
          }
          const int index = tool_index(step.step_key);
          if (index < 0 || static_cast<size_t>(index) >= decision.calls.size()) {
            return state_error("Tool step does not match the model decision.");
          }
          if (auto status = tool_detail(state, decision.calls[static_cast<size_t>(index)], step, *open, detail); !status.ok()) {
            return status;
          }
          return finish_request(state, step, *open, decision.calls[static_cast<size_t>(index)].name, out, std::move(detail));
        }
        return finish_request(state, step, *open, "", out, std::move(detail));
      }
      if (step.effect_type == EffectType::NonIdempotent) {
        MarkUnknownInput unknown;
        unknown.fence = fence;
        unknown.now_ms = now_ms;
        unknown.step_key = step.step_key;
        unknown.attempt_id = open->attempt_id;
        unknown.reason = "interrupted";
        unknown.message = "Interrupted before the step result was committed.";
        unknown.step_event_id = event_id(state, 0);
        unknown.run_event_id = event_id(state, 1);
        if (auto status = store->mark_unknown(unknown, run_id); !status.ok()) {
          return status;
        }
        again = true;
        return Status::success();
      }
      ResolveStepInput resolve;
      resolve.fence = fence;
      resolve.now_ms = now_ms;
      resolve.step_key = step.step_key;
      resolve.attempt_id = open->attempt_id;
      resolve.step_to = StepStatus::RetryScheduled;
      resolve.attempt_status = AttemptStatus::Interrupted;
      resolve.next_attempt_at = now_ms;
      resolve.reason = "interrupted";
      resolve.error_json = error_json("transient_execution_failure", "Step was interrupted before its result was committed.", true);
      resolve.event_id = event_id(state, 0);
      if (auto status = store->resolve_step(resolve, run_id); !status.ok()) {
        return status;
      }
      again = true;
      return Status::success();
    }
    if (state.run.status == WorkflowStatus::Blocked) {
      const Step* unknown = nullptr;
      for (const auto& step : state.steps) {
        if (step.status == StepStatus::UnknownOutcome) {
          unknown = &step;
        }
      }
      if (unknown == nullptr) {
        const Delegation* waiting_input = nullptr;
        for (const auto& row : state.delegations) {
          if (row.state == DelegationState::InputRequired) {
            waiting_input = &row;
          }
        }
        if (waiting_input != nullptr) {
          out.kind = LARKX_REQUEST_RECONCILE;
          out.request_id = waiting_input->operation_id;
          out.step_key = waiting_input->step_key;
          out.operation_id = waiting_input->operation_id;
          out.tool_name = waiting_input->remote_agent;
          out.effect_type = "non-idempotent";
          out.detail_json = obj({{"operationId", jstr(waiting_input->operation_id)},
                                 {"reason", jstr("remote_input_required")},
                                 {"remoteAgent", jstr(waiting_input->remote_agent)},
                                 {"stepKey", jstr(waiting_input->step_key)},
                                 {"taskId", waiting_input->task_id.has_value() ? jstr(*waiting_input->task_id) : jnull()}});
          return Status::success();
        }
        out.kind = LARKX_REQUEST_BLOCKED;
        out.detail_json = state.run.blocked_reason.value_or("{}");
        return Status::success();
      }
      out.kind = LARKX_REQUEST_RECONCILE;
      out.request_id = unknown->operation_id;
      out.step_key = unknown->step_key;
      out.operation_id = unknown->operation_id;
      out.effect_type = to_string(unknown->effect_type);
      out.detail_json = obj({{"effects", jstr(out.effect_type)},
                             {"operationId", jstr(unknown->operation_id)},
                             {"stepKey", jstr(unknown->step_key)}});
      return Status::success();
    }

    std::string user;
    if (auto status = user_text(state.run, user); !status.ok()) {
      if (auto failed = fail_run(state, fence, now_ms, "permanent_execution_failure", status.message); !failed.ok()) {
        return failed;
      }
      again = true;
      return Status::success();
    }
    int tool_calls = 0;
    int invalid_streak = 0;
    for (int32_t iteration = 0; iteration < agent.limits.max_iterations; iteration += 1) {
      const std::string model_key = "model-" + std::to_string(iteration);
      const Step* model = find_key(state, model_key);
      const int32_t model_order = tool_calls + iteration;
      if (model == nullptr) {
        if (static_cast<int32_t>(state.steps.size()) != model_order) {
          return state_error("Replay diverged before " + model_key + ".");
        }
        return model_request(state, agent, fence, now_ms, model_key, model_order, user, out);
      }
      if (model->step_order != model_order) {
        return state_error("Replay diverged at " + model_key + ".");
      }
      if (model->effect_type != EffectType::Idempotent) {
        return state_error("Step \"" + model_key + "\" changed its effect class.");
      }
      if (model->status == StepStatus::RetryScheduled) {
        if (model->next_attempt_at.has_value() && *model->next_attempt_at > now_ms) {
          out.kind = LARKX_REQUEST_WAIT;
          out.step_key = model_key;
          out.operation_id = model->operation_id;
          out.has_wait_until = true;
          out.wait_until_ms = *model->next_attempt_at;
          out.detail_json = obj({{"until", jnum(*model->next_attempt_at)}});
          return Status::success();
        }
        return model_request(state, agent, fence, now_ms, model_key, model_order, user, out);
      }
      if (model->status != StepStatus::Completed || !model->output_json.has_value()) {
        return state_error("Cannot continue step \"" + model_key + "\" from " + std::string(to_string(model->status)) + ".");
      }
      Json output;
      if (auto status = parse_any(*model->output_json, output); !status.ok()) {
        return status;
      }
      Decision decision;
      if (auto status = read_decision(output, decision); !status.ok()) {
        return status;
      }
      if (decision.finish == "stop" || decision.finish == "length") {
        TransitionInput transition;
        transition.fence = fence;
        transition.now_ms = now_ms;
        transition.to = WorkflowStatus::Completed;
        transition.event_type = "WORKFLOW_COMPLETED";
        transition.event_id = event_id(state, 0);
        transition.payload_json = "{}";
        transition.honor_cancel = true;
        transition.set_output = true;
        transition.output_json = obj({{"finish", jstr(decision.finish)},
                                      {"iterations", jnum(iteration + 1)},
                                      {"message", decision.message_null ? jstr("") : jstr(decision.message)},
                                      {"toolCalls", jnum(tool_calls)}});
        if (auto status = store->transition_run(transition, run_id); !status.ok()) {
          return status;
        }
        again = true;
        return Status::success();
      }
      for (size_t index = 0; index < decision.calls.size(); index += 1) {
        if (tool_calls >= agent.limits.max_tool_calls) {
          if (auto status = fail_run(state, fence, now_ms, "permanent_execution_failure", "Tool call limit reached."); !status.ok()) {
            return status;
          }
          again = true;
          return Status::success();
        }
        const Call& call = decision.calls[index];
        const std::string tool_key = "tool-" + std::to_string(iteration) + "-" + std::to_string(index);
        const int32_t tool_order = model_order + 1 + static_cast<int32_t>(index);
        const ToolDef* tool = find_tool(agent, call.name);
        const Step* recorded = find_key(state, tool_key);
        if (recorded == nullptr) {
          if (static_cast<int32_t>(state.steps.size()) != tool_order) {
            return state_error("Replay diverged before " + tool_key + ".");
          }
          if (const RemoteDef* remote = find_remote(agent, call.name); remote != nullptr) {
            return start_remote(std::move(state), agent, fence, now_ms, tool_key, tool_order, call, *remote, out, again);
          }
          if (tool == nullptr || !schema_error(tool->schema, call.arguments, "$", 0).empty()) {
            const std::string message = tool == nullptr
                                            ? "Unknown tool \"" + call.name.substr(0, 80) + "\"."
                                            : "Invalid arguments for \"" + tool->name + "\": " +
                                                  schema_error(tool->schema, call.arguments, "$", 0).substr(0, 300);
            if (auto status = reject_tool(state, fence, now_ms, tool_key, tool_order, call, message, tool); !status.ok()) {
              return status;
            }
            again = true;
            return Status::success();
          }
          const std::string operation = scoped_id("op-", state.run.run_id, tool_key);
          std::string attempt;
          if (auto status = begin_frontier(state, fence, now_ms, tool_key, tool_order, tool->effect, ExecutionTarget::Local,
                                         operation, attempt);
              !status.ok()) {
            return status;
          }
          if (auto status = load(state.run.run_id, state); !status.ok()) {
            return status;
          }
          const Step* begun = find_key(state, tool_key);
          const Attempt* open = open_attempt(state, tool_key);
          if (begun == nullptr || open == nullptr) {
            return state_error("Tool step was not recorded.");
          }
          std::string detail;
          if (auto status = tool_detail(state, call, *begun, *open, detail); !status.ok()) {
            return status;
          }
          return finish_request(state, *begun, *open, call.name, out, std::move(detail));
        }
        if (recorded->step_order != tool_order) {
          return state_error("Replay diverged at " + tool_key + ".");
        }
        if (recorded->execution_target == ExecutionTarget::Hybrid && recorded->status != StepStatus::Completed) {
          const Step remote_step = *recorded;
          return continue_remote(std::move(state), agent, fence, now_ms, remote_step, out, again);
        }
        if (tool != nullptr && recorded->effect_type != tool->effect) {
          return state_error("Step \"" + tool_key + "\" changed its effect class.");
        }
        if (recorded->status == StepStatus::RetryScheduled) {
          if (recorded->next_attempt_at.has_value() && *recorded->next_attempt_at > now_ms) {
            out.kind = LARKX_REQUEST_WAIT;
            out.step_key = tool_key;
            out.operation_id = recorded->operation_id;
            out.has_wait_until = true;
            out.wait_until_ms = *recorded->next_attempt_at;
            out.effect_type = to_string(recorded->effect_type);
            out.detail_json = obj({{"until", jnum(*recorded->next_attempt_at)}});
            return Status::success();
          }
          if (tool == nullptr) {
            return state_error("Retry of \"" + tool_key + "\" has no registered tool.");
          }
          std::string attempt;
          if (auto status = begin_frontier(state, fence, now_ms, tool_key, tool_order, tool->effect, ExecutionTarget::Local,
                                         recorded->operation_id, attempt);
              !status.ok()) {
            return status;
          }
          if (auto status = load(state.run.run_id, state); !status.ok()) {
            return status;
          }
          const Step* begun = find_key(state, tool_key);
          const Attempt* open = open_attempt(state, tool_key);
          if (begun == nullptr || open == nullptr) {
            return state_error("Tool retry was not recorded.");
          }
          std::string detail;
          if (auto status = tool_detail(state, call, *begun, *open, detail); !status.ok()) {
            return status;
          }
          return finish_request(state, *begun, *open, call.name, out, std::move(detail));
        }
        if (recorded->status != StepStatus::Completed || !recorded->output_json.has_value()) {
          return state_error("Cannot continue step \"" + tool_key + "\" from " + std::string(to_string(recorded->status)) + ".");
        }
        Json tool_output;
        if (auto status = parse_any(*recorded->output_json, tool_output); !status.ok()) {
          return status;
        }
        ToolResult result;
        if (auto status = read_tool_result(tool_output, result); !status.ok()) {
          return status;
        }
        tool_calls += 1;
        if (result.ok) {
          invalid_streak = 0;
        } else {
          invalid_streak += 1;
          if (invalid_streak >= agent.limits.max_invalid) {
            if (auto status = fail_run(state, fence, now_ms, "permanent_execution_failure", "Invalid tool request limit reached.");
                !status.ok()) {
              return status;
            }
            again = true;
            return Status::success();
          }
        }
      }
    }
    if (auto status = fail_run(state, fence, now_ms, "permanent_execution_failure", "Agent iteration limit reached."); !status.ok()) {
      return status;
    }
    again = true;
    return Status::success();
  }

  const Attempt* require_open(const State& state, const std::string& request_id, Status& status) const {
    const Attempt* attempt = attempt_by_id(state, request_id);
    if (attempt == nullptr || attempt->status != AttemptStatus::Started) {
      status = state_error("Stale or duplicate host result.");
      return nullptr;
    }
    const Step* step = find_key(state, attempt->step_key);
    if (step == nullptr || step->status != StepStatus::Running) {
      status = state_error("Stale or duplicate host result.");
      return nullptr;
    }
    const auto issued_attempt = issued.find(state.run.run_id);
    if (issued_attempt != issued.end() && issued_attempt->second != request_id) {
      status = state_error("Stale or duplicate host result.");
      return nullptr;
    }
    status = Status::success();
    return attempt;
  }
};

Runtime::Runtime(std::unique_ptr<Impl> impl) : impl_(std::move(impl)) {}
Runtime::~Runtime() = default;

Status Runtime::open(const std::string& path, bool exclusive, bool may_steal, const std::string& owner_id, int64_t lease_ms,
                     std::unique_ptr<Runtime>& out) {
  if (auto status = validate_identity(owner_id, "Owner id", 200); !status.ok()) {
    return status;
  }
  auto impl = std::make_unique<Impl>();
  if (auto status = Store::open(path, exclusive, impl->store); !status.ok()) {
    return status;
  }
  impl->may_steal = may_steal;
  impl->owner_id = owner_id;
  impl->lease_ms = lease_ms;
  out = std::unique_ptr<Runtime>(new Runtime(std::move(impl)));
  return Status::success();
}

Status Runtime::register_agent(const AgentRegistration& spec) {
  std::lock_guard<std::mutex> lock(impl_->mutex);
  Status limits_status = Status::success();
  AgentRecord agent;
  agent.name = spec.name;
  agent.version = spec.version;
  agent.instructions = trim_copy(spec.instructions);
  agent.model_id = trim_copy(spec.model_id);
  agent.model_name = trim_copy(spec.model_name);
  agent.tool_calling = spec.tool_calling;
  if (auto status = validate_workflow_name(agent.name); !status.ok()) {
    return status;
  }
  if (agent.version < 1 || agent.instructions.empty() || agent.model_id.empty() || agent.model_name.empty()) {
    return Status::fail(Code::InvalidArgument, "Agent name, version, instructions, and model identity are required.");
  }
  agent.limits.max_iterations = static_cast<int32_t>(positive_or(spec.max_iterations, 8, "maxIterations", limits_status));
  agent.limits.max_tool_calls = static_cast<int32_t>(positive_or(spec.max_tool_calls, 16, "maxToolCalls", limits_status));
  agent.limits.max_invalid = static_cast<int32_t>(positive_or(spec.max_invalid_tool_requests, 3, "maxInvalidToolRequests", limits_status));
  agent.limits.max_context_chars = static_cast<int32_t>(positive_or(spec.max_context_chars, 12000, "maxContextChars", limits_status));
  if (!limits_status.ok()) {
    return limits_status;
  }
  if (auto status = resolve_retry(spec.model_max_attempts, spec.model_initial_interval_ms, spec.model_max_interval_ms, spec.model_backoff, 2,
                                 10, 10, false, agent.limits.model);
      !status.ok()) {
    return status;
  }
  for (const auto& tool : spec.tools) {
    if (!tool_name_ok(tool.name) || trim_copy(tool.description).empty()) {
      return Status::fail(Code::InvalidArgument, "Tool name or description is invalid.");
    }
    for (const auto& existing : agent.tools) {
      if (existing.name == tool.name) {
        return state_error("Tool \"" + tool.name + "\" is registered more than once.");
      }
    }
    ToolDef defined;
    defined.name = tool.name;
    defined.description = trim_copy(tool.description);
    if (auto status = parse_any(tool.schema_json, defined.schema); !status.ok()) {
      return status;
    }
    const auto* type = field(defined.schema, "type");
    if (defined.schema.kind != Json::Kind::Object || type == nullptr || type->text != "object") {
      return Status::fail(Code::InvalidArgument, "Tool \"" + tool.name + "\" input schema must be an object.");
    }
    if (!parse_effect(tool.effects, defined.effect)) {
      return Status::fail(Code::InvalidArgument, "Tool \"" + tool.name + "\" has an unknown effect class.");
    }
    if (auto status = resolve_retry(tool.max_attempts, tool.initial_interval_ms, tool.max_interval_ms, tool.backoff, 3, 50, 30000, true,
                                   defined.retry);
        !status.ok()) {
      return status;
    }
    agent.tools.push_back(std::move(defined));
  }
  agent.allow_remote = spec.allow_remote;
  if (agent.allow_remote != !spec.remote_agents.empty()) {
    return Status::fail(Code::InvalidArgument, "Remote delegation must be authorized exactly when a remote agent is registered.");
  }
  for (const auto& remote : spec.remote_agents) {
    if (auto status = validate_workflow_name(remote.name); !status.ok() || trim_copy(remote.description).empty()) {
      return Status::fail(Code::InvalidArgument, "Remote agent name or description is invalid.");
    }
    if (find_tool(agent, remote.name) != nullptr || find_remote(agent, remote.name) != nullptr) {
      return state_error("Remote agent \"" + remote.name + "\" collides with another capability.");
    }
    RemoteDef defined;
    defined.name = remote.name;
    defined.description = trim_copy(remote.description);
    const std::string schema_json = remote.schema_json.empty() ? "{\"additionalProperties\":true,\"type\":\"object\"}" : remote.schema_json;
    if (auto status = parse_any(schema_json, defined.schema); !status.ok()) {
      return status;
    }
    const auto* type = field(defined.schema, "type");
    if (defined.schema.kind != Json::Kind::Object || type == nullptr || type->text != "object") {
      return Status::fail(Code::InvalidArgument, "Remote agent \"" + remote.name + "\" input schema must be an object.");
    }
    defined.endpoint = remote.endpoint;
    if (auto status = normalize_endpoint(defined.endpoint); !status.ok()) {
      return status;
    }
    defined.capabilities = remote.capabilities;
    if (remote.poll_interval_ms == 0) {
      defined.poll_interval_ms = 1000;
    } else if (remote.poll_interval_ms < 50 || remote.poll_interval_ms > 60000) {
      return Status::fail(Code::InvalidArgument, "Remote poll interval must be from 50 to 60000 milliseconds.");
    } else {
      defined.poll_interval_ms = remote.poll_interval_ms;
    }
    agent.remotes.push_back(std::move(defined));
  }
  const std::string key = agent.name + "\n" + std::to_string(agent.version);
  if (impl_->agents.contains(key)) {
    return state_error("Agent " + agent.name + "@" + std::to_string(agent.version) + " is registered more than once.");
  }
  impl_->agents.emplace(key, std::move(agent));
  return Status::success();
}

Status Runtime::start(const std::string& name, int32_t version, const std::string& run_id, const std::string& input_json, int64_t now_ms,
                      Run& out) {
  std::lock_guard<std::mutex> lock(impl_->mutex);
  const AgentRecord* agent = nullptr;
  {
    const auto found = impl_->agents.find(name + "\n" + std::to_string(version));
    if (found == impl_->agents.end()) {
      return state_error("Unknown agent version.");
    }
    agent = &found->second;
  }
  if (auto status = validate_run_id(run_id); !status.ok()) {
    return status;
  }
  CreateRunInput create;
  create.run_id = run_id;
  create.workflow_name = agent->name;
  create.workflow_version = agent->version;
  create.input_json = input_json;
  create.data_policy = agent->allow_remote ? "cloud-allowed" : "device-only";
  create.event_id = scoped_id("ev-", run_id, "1");
  create.now_ms = now_ms;
  bool created = false;
  if (auto status = impl_->store->create_run(create, created); !status.ok()) {
    return status;
  }
  if (auto status = impl_->store->compatible(run_id, agent->name, agent->version, input_json); !status.ok()) {
    return status;
  }
  Fence fence;
  if (auto status = impl_->own(run_id, now_ms, fence); !status.ok()) {
    return status;
  }
  State state;
  if (auto status = impl_->load(run_id, state); !status.ok()) {
    return status;
  }
  if (state.run.status == WorkflowStatus::Created) {
    TransitionInput transition;
    transition.fence = fence;
    transition.now_ms = now_ms;
    transition.to = WorkflowStatus::Running;
    transition.event_type = "WORKFLOW_STARTED";
    transition.event_id = event_id(state, 0);
    transition.payload_json = obj({{"workflowName", jstr(agent->name)}, {"workflowVersion", jnum(agent->version)}});
    if (auto status = impl_->store->transition_run(transition, run_id); !status.ok()) {
      return status;
    }
    if (auto status = impl_->load(run_id, state); !status.ok()) {
      return status;
    }
  }
  std::string message;
  if (auto status = impl_->user_text(state.run, message); !status.ok() && !is_terminal(state.run.status)) {
    if (auto failed = impl_->fail_run(state, fence, now_ms, "permanent_execution_failure", status.message); !failed.ok()) {
      return failed;
    }
    if (auto loaded = impl_->load(run_id, state); !loaded.ok()) {
      return loaded;
    }
    out = state.run;
    return status;
  }
  out = state.run;
  return Status::success();
}

Status Runtime::drive(const std::string& run_id, int64_t now_ms, ExecRequest& out) {
  std::lock_guard<std::mutex> lock(impl_->mutex);
  for (int guard = 0; guard < 256; guard += 1) {
    State state;
    if (auto status = impl_->load(run_id, state); !status.ok()) {
      return status;
    }
    const AgentRecord* agent = impl_->agent_for(state.run);
    if (agent == nullptr) {
      return state_error("Unknown agent version.");
    }
    Fence fence;
    const bool terminal = is_terminal(state.run.status);
    if (!terminal) {
      if (auto status = impl_->own(run_id, now_ms, fence); !status.ok()) {
        return status;
      }
      if (auto status = impl_->load(run_id, state); !status.ok()) {
        return status;
      }
    }
    bool again = false;
    if (auto status = impl_->plan(std::move(state), *agent, fence, now_ms, out, again); !status.ok()) {
      return status;
    }
    if (!again) {
      return Status::success();
    }
  }
  return state_error("Agent drive did not reach a host request.");
}

Status Runtime::submit_model(const std::string& run_id, const std::string& request_id, const std::string& response_json,
                             const std::string& error_code, const std::string& error_message, bool retryable, int64_t now_ms) {
  std::lock_guard<std::mutex> lock(impl_->mutex);
  Fence fence;
  if (auto status = impl_->own(run_id, now_ms, fence); !status.ok()) {
    return status;
  }
  State state;
  if (auto status = impl_->load(run_id, state); !status.ok()) {
    return status;
  }
  const AgentRecord* agent = impl_->agent_for(state.run);
  if (agent == nullptr) {
    return state_error("Unknown agent version.");
  }
  Status open_status;
  const Attempt* attempt = impl_->require_open(state, request_id, open_status);
  if (attempt == nullptr) {
    return open_status;
  }
  const Step* step = find_key(state, attempt->step_key);
  if (step == nullptr || step->step_key.rfind("model-", 0) != 0) {
    return state_error("Stale or duplicate host result.");
  }
  const Step step_copy = *step;
  const Attempt attempt_copy = *attempt;
  if (!error_code.empty()) {
    return impl_->handle_error(std::move(state), fence, now_ms, step_copy, attempt_copy, agent->limits.model, error_code, error_message,
                              retryable);
  }
  Json response;
  if (auto status = parse_any(response_json, response); !status.ok()) {
    return status;
  }
  std::string stored;
  if (auto status = impl_->normalize_model(*agent, response, stored); !status.ok()) {
    return impl_->handle_error(std::move(state), fence, now_ms, step_copy, attempt_copy, agent->limits.model,
                              "permanent_execution_failure", status.message, false);
  }
  CommitStepInput commit;
  commit.fence = fence;
  commit.now_ms = now_ms;
  commit.step_key = step->step_key;
  commit.attempt_id = attempt->attempt_id;
  commit.output_json = std::move(stored);
  commit.event_id = event_id(state, 0);
  if (auto status = impl_->store->commit_step(commit, run_id); !status.ok()) {
    return status;
  }
  impl_->issued.erase(run_id);
  return Status::success();
}

Status Runtime::submit_tool(const std::string& run_id, const std::string& request_id, const std::string& output_json,
                            const std::string& error_code, const std::string& error_message, bool retryable, int64_t now_ms) {
  std::lock_guard<std::mutex> lock(impl_->mutex);
  Fence fence;
  if (auto status = impl_->own(run_id, now_ms, fence); !status.ok()) {
    return status;
  }
  State state;
  if (auto status = impl_->load(run_id, state); !status.ok()) {
    return status;
  }
  const AgentRecord* agent = impl_->agent_for(state.run);
  if (agent == nullptr) {
    return state_error("Unknown agent version.");
  }
  Status open_status;
  const Attempt* attempt = impl_->require_open(state, request_id, open_status);
  if (attempt == nullptr) {
    return open_status;
  }
  const Step* step = find_key(state, attempt->step_key);
  if (step == nullptr || step->step_key.rfind("tool-", 0) != 0) {
    return state_error("Stale or duplicate host result.");
  }
  const Step step_copy = *step;
  const Attempt attempt_copy = *attempt;
  Decision decision;
  bool found = false;
  const int index = tool_index(step_copy.step_key);
  if (index < 0) {
    return state_error("Tool result does not match a model call.");
  }
  for (auto it = state.steps.rbegin(); it != state.steps.rend(); ++it) {
    if (it->step_key.rfind("model-", 0) == 0 && it->status == StepStatus::Completed && it->output_json.has_value()) {
      Json model_output;
      if (auto status = parse_any(*it->output_json, model_output); !status.ok()) {
        return status;
      }
      if (auto status = read_decision(model_output, decision); !status.ok()) {
        return status;
      }
      found = true;
      break;
    }
  }
  if (!found || static_cast<size_t>(index) >= decision.calls.size()) {
    return state_error("Tool result does not match a model call.");
  }
  const Call& call = decision.calls[static_cast<size_t>(index)];
  const ToolDef* tool = find_tool(*agent, call.name);
  const Retry policy = tool == nullptr ? Retry{} : tool->retry;
  if (!error_code.empty()) {
    return impl_->handle_error(std::move(state), fence, now_ms, step_copy, attempt_copy, policy, error_code, error_message, retryable);
  }
  Json output;
  if (auto status = parse_any(output_json, output); !status.ok()) {
    return status;
  }
  ToolResult result;
  result.ok = true;
  result.name = call.name;
  result.call_id = call.id;
  result.output = std::move(output);
  CommitStepInput commit;
  commit.fence = fence;
  commit.now_ms = now_ms;
  commit.step_key = step_copy.step_key;
  commit.attempt_id = attempt_copy.attempt_id;
  commit.output_json = canonical_json(tool_result_json(result));
  commit.event_id = event_id(state, 0);
  if (auto status = impl_->store->commit_step(commit, run_id); !status.ok()) {
    return status;
  }
  impl_->issued.erase(run_id);
  return Status::success();
}

Status Runtime::submit_reconcile(const std::string& run_id, const std::string& request_id, const std::string& resolution,
                                 const std::string& output_json, const std::string& message, int64_t now_ms) {
  std::lock_guard<std::mutex> lock(impl_->mutex);
  Fence fence;
  if (auto status = impl_->own(run_id, now_ms, fence); !status.ok()) {
    return status;
  }
  State state;
  if (auto status = impl_->load(run_id, state); !status.ok()) {
    return status;
  }
  const Step* step = nullptr;
  const Delegation* delegation = nullptr;
  for (const auto& candidate : state.steps) {
    if (candidate.operation_id != request_id) {
      continue;
    }
    if (candidate.status == StepStatus::UnknownOutcome) {
      step = &candidate;
    }
    if (candidate.status == StepStatus::WaitingRemote) {
      const Delegation* row = find_delegation(state, candidate.step_key);
      if (row != nullptr && row->state == DelegationState::InputRequired) {
        step = &candidate;
        delegation = row;
      }
    }
  }
  if (step == nullptr) {
    return state_error("Stale or duplicate host result.");
  }
  if (delegation == nullptr) {
    delegation = find_delegation(state, step->step_key);
  }
  if (delegation != nullptr && resolution == "retry") {
    const bool safe = delegation->task_id.has_value() || delegation->capabilities.lookup || delegation->capabilities.dedupe;
    if (!safe || delegation->state == DelegationState::InputRequired) {
      return state_error("This remote delegation cannot be retried. Reconcile it as complete or failed.");
    }
  }
  if (delegation != nullptr && delegation->state == DelegationState::InputRequired && resolution == "retry") {
    return state_error("Remote input cannot start another task. Reconcile it as complete or failed.");
  }
  ReconcileInput input;
  input.fence = fence;
  input.now_ms = now_ms;
  input.step_key = step->step_key;
  input.resolution = resolution;
  input.message = message;
  input.event_id = event_id(state, 0);
  input.run_event_id = event_id(state, 1);
  if (resolution == "complete") {
    Json output;
    if (auto status = parse_any(output_json, output); !status.ok()) {
      return status;
    }
    ToolResult result;
    if (output.kind == Json::Kind::Object && field(output, "ok") != nullptr) {
      if (auto status = read_tool_result(output, result); !status.ok()) {
        return status;
      }
      input.output_json = canonical_json(output);
    } else {
      result.ok = true;
      result.name = "reconciled";
      result.call_id = request_id;
      result.output = output;
      input.output_json = canonical_json(tool_result_json(result));
    }
  }
  const std::string step_key = step->step_key;
  if (auto status = impl_->store->apply(run_id, [&](State& next) {
        if (auto reconciled = reconcile_step(next, input); !reconciled.ok()) {
          return reconciled;
        }
        for (auto& row : next.delegations) {
          if (row.step_key != step_key) {
            continue;
          }
          row.updated_at = now_ms;
          row.poll_inflight = false;
          row.inflight_action.clear();
          if (resolution == "complete") {
            row.state = DelegationState::Completed;
            if (input.output_json.has_value()) {
              row.result_json = input.output_json;
            }
          } else if (resolution == "fail") {
            row.state = DelegationState::Failed;
          } else if (row.task_id.has_value()) {
            row.state = DelegationState::Accepted;
          } else {
            row.state = DelegationState::Submitting;
          }
        }
        return Status::success();
      });
      !status.ok()) {
    return status;
  }
  impl_->issued.erase(run_id);
  return Status::success();
}

Status Runtime::pause(const std::string& run_id, int64_t now_ms) {
  std::lock_guard<std::mutex> lock(impl_->mutex);
  Fence fence;
  if (auto status = impl_->own(run_id, now_ms, fence); !status.ok()) {
    return status;
  }
  State state;
  if (auto status = impl_->load(run_id, state); !status.ok()) {
    return status;
  }
  if (state.run.status == WorkflowStatus::Waiting) {
    return Status::success();
  }
  if (!state.steps.empty() && state.steps.back().status == StepStatus::Running) {
    return state_error("A host request is in flight.");
  }
  if (state.run.status != WorkflowStatus::Running && state.run.status != WorkflowStatus::Recovering) {
    return state_error("Pause is only available while the run is executing.");
  }
  TransitionInput transition;
  transition.fence = fence;
  transition.now_ms = now_ms;
  transition.to = WorkflowStatus::Waiting;
  transition.event_type = "WORKFLOW_WAITING";
  transition.event_id = event_id(state, 0);
  transition.payload_json = "{}";
  return impl_->store->transition_run(transition, run_id);
}

Status Runtime::resume_run(const std::string& run_id, int64_t now_ms) {
  std::lock_guard<std::mutex> lock(impl_->mutex);
  Fence fence;
  if (auto status = impl_->own(run_id, now_ms, fence); !status.ok()) {
    return status;
  }
  State state;
  if (auto status = impl_->load(run_id, state); !status.ok()) {
    return status;
  }
  if (state.run.status == WorkflowStatus::Running) {
    return Status::success();
  }
  if (state.run.status != WorkflowStatus::Waiting) {
    return state_error("Resume requires a paused run.");
  }
  TransitionInput transition;
  transition.fence = fence;
  transition.now_ms = now_ms;
  transition.to = WorkflowStatus::Running;
  transition.event_type = "WORKFLOW_STARTED";
  transition.event_id = event_id(state, 0);
  transition.payload_json = obj({{"resumed", jbool(true)}});
  return impl_->store->transition_run(transition, run_id);
}

Status Runtime::cancel(const std::string& run_id, int64_t now_ms) {
  std::lock_guard<std::mutex> lock(impl_->mutex);
  State state;
  if (auto status = impl_->load(run_id, state); !status.ok()) {
    return status;
  }
  if (state.run.status == WorkflowStatus::Cancelled) {
    return Status::success();
  }
  if (state.run.status == WorkflowStatus::Completed || state.run.status == WorkflowStatus::Failed) {
    return state_error("Cannot cancel a " + std::string(to_string(state.run.status)) + " run.");
  }
  if (auto status = impl_->store->request_cancel(run_id, now_ms); !status.ok()) {
    return status;
  }
  if (!state.steps.empty() && state.steps.back().status == StepStatus::Running) {
    return Status::success();
  }
  Fence fence;
  if (auto status = impl_->own(run_id, now_ms, fence); !status.ok()) {
    return status;
  }
  if (auto status = impl_->load(run_id, state); !status.ok()) {
    return status;
  }
  if (is_terminal(state.run.status)) {
    return Status::success();
  }
  if (state.run.status == WorkflowStatus::Blocked) {
    std::string step_key;
    for (const auto& row : state.delegations) {
      if (!delegation_terminal(row.state)) {
        step_key = row.step_key;
      }
    }
    if (!step_key.empty()) {
      return impl_->cancel_remote(std::move(state), fence, now_ms, step_key,
                                 "The local run was cancelled. A remote task that was already accepted may still be active.");
    }
  }
  if (!state.steps.empty() && state.steps.back().status == StepStatus::Running) {
    return Status::success();
  }
  if (!state.steps.empty() && state.steps.back().execution_target == ExecutionTarget::Hybrid &&
      (state.steps.back().status == StepStatus::WaitingRemote || state.steps.back().status == StepStatus::RetryScheduled)) {
    return Status::success();
  }
  TransitionInput transition;
  transition.fence = fence;
  transition.now_ms = now_ms;
  transition.to = WorkflowStatus::Cancelled;
  transition.event_type = "WORKFLOW_CANCELLED";
  transition.event_id = event_id(state, 0);
  transition.payload_json = obj({{"reason", jstr("cancelled")}});
  return impl_->store->transition_run(transition, run_id);
}

Status Runtime::submit_delegation(const std::string& run_id, const std::string& request_id, const std::string& body_json, int64_t now_ms) {
  std::lock_guard<std::mutex> lock(impl_->mutex);
  Fence fence;
  if (auto status = impl_->own(run_id, now_ms, fence); !status.ok()) {
    return status;
  }
  State state;
  if (auto status = impl_->load(run_id, state); !status.ok()) {
    return status;
  }
  const Attempt* attempt = attempt_by_id(state, request_id);
  const Delegation* found = nullptr;
  if (attempt != nullptr && attempt->status == AttemptStatus::Started) {
    found = find_delegation(state, attempt->step_key);
  } else {
    for (const auto& candidate : state.delegations) {
      if (candidate.poll_inflight && request_id == candidate.operation_id + ":" + std::to_string(candidate.poll_epoch)) {
        found = &candidate;
      }
    }
  }
  if (found == nullptr || found->inflight_action.empty()) {
    return state_error("Stale or duplicate host result.");
  }
  const Delegation saved = *found;
  const bool open_attempt = attempt != nullptr && attempt->step_key == saved.step_key && attempt->status == AttemptStatus::Started;
  const std::string attempt_id = open_attempt ? attempt->attempt_id : "";
  Json body;
  if (auto status = parse_any(body_json, body); !status.ok()) {
    return status;
  }
  const Json* action = field(body, "action");
  const Json* outcome_value = field(body, "outcome");
  if (action == nullptr || outcome_value == nullptr || action->kind != Json::Kind::String || outcome_value->kind != Json::Kind::String ||
      action->text != saved.inflight_action) {
    return state_error("Stale or duplicate host result.");
  }
  std::string outcome = outcome_value->text;
  std::optional<std::string> task_id = saved.task_id;
  if (const Json* task = field(body, "taskId"); task != nullptr && task->kind != Json::Kind::Null) {
    if (task->kind != Json::Kind::String || !task_id_ok(task->text)) {
      return impl_->fail_remote(std::move(state), fence, now_ms, saved.step_key, "permanent_execution_failure",
                               "The remote task id is invalid.");
    }
    if (saved.task_id.has_value() && *saved.task_id != task->text) {
      return impl_->fail_remote(std::move(state), fence, now_ms, saved.step_key, "permanent_execution_failure",
                               "The remote task id changed for this operation.");
    }
    task_id = task->text;
  }
  std::string message = "The remote task failed.";
  if (const Json* text = field(body, "message"); text != nullptr && text->kind == Json::Kind::String && !text->text.empty()) {
    message = text->text.substr(0, 300);
  }
  const Json* result = field(body, "result");
  auto uncertain = [&](int add_failures) -> Status {
    if (!open_attempt) {
      return state_error("Stale or duplicate host result.");
    }
    ResolveStepInput resolve;
    resolve.fence = fence;
    resolve.now_ms = now_ms;
    resolve.step_key = saved.step_key;
    resolve.attempt_id = attempt_id;
    resolve.step_to = StepStatus::RetryScheduled;
    resolve.attempt_status = AttemptStatus::Interrupted;
    resolve.next_attempt_at = now_ms + saved.poll_interval_ms;
    resolve.reason = "remote_uncertain";
    resolve.error_json = error_json("transient_execution_failure", "The remote acknowledgement was not committed.", true);
    resolve.event_id = event_id(state, 0);
    impl_->issued.erase(run_id);
    impl_->remote_issued.erase(run_id);
    return impl_->store->apply(run_id, [&](State& next) {
      if (auto status = resolve_step(next, resolve); !status.ok()) {
        return status;
      }
      for (auto& row : next.delegations) {
        if (row.step_key == saved.step_key) {
          row.state = DelegationState::Submitting;
          row.inflight_action.clear();
          row.poll_inflight = false;
          row.poll_failures = saved.poll_failures + add_failures;
          row.updated_at = now_ms;
        }
      }
      return Status::success();
    });
  };
  auto queue_offline = [&]() -> Status {
    if (!open_attempt) {
      return impl_->schedule_remote_wait(fence, now_ms, run_id, saved.step_key, saved.state, saved.poll_failures, false);
    }
    ResolveStepInput resolve;
    resolve.fence = fence;
    resolve.now_ms = now_ms;
    resolve.step_key = saved.step_key;
    resolve.attempt_id = attempt_id;
    resolve.step_to = StepStatus::RetryScheduled;
    resolve.attempt_status = AttemptStatus::Interrupted;
    resolve.next_attempt_at = now_ms + saved.poll_interval_ms;
    resolve.reason = "network";
    resolve.error_json = error_json("transient_execution_failure", "Waiting for a network connection.", true);
    resolve.event_id = event_id(state, 0);
    impl_->issued.erase(run_id);
    impl_->remote_issued.erase(run_id);
    return impl_->store->apply(run_id, [&](State& next) {
      if (auto status = resolve_step(next, resolve); !status.ok()) {
        return status;
      }
      for (auto& row : next.delegations) {
        if (row.step_key == saved.step_key) {
          row.state = DelegationState::Queued;
          row.inflight_action.clear();
          row.poll_inflight = false;
          row.updated_at = now_ms;
        }
      }
      return Status::success();
    });
  };

  if (outcome == "not_sent") {
    return impl_->cancel_remote(std::move(state), fence, now_ms, saved.step_key,
                               "The remote request was cancelled before it was sent.");
  }
  if (outcome == "offline") {
    if (saved.task_id.has_value()) {
      outcome = "network";
    } else {
      return queue_offline();
    }
  }
  if (outcome == "invalid") {
    if (saved.poll_failures + 1 >= 3) {
      return impl_->fail_remote(std::move(state), fence, now_ms, saved.step_key, "permanent_execution_failure",
                               "The remote task response was invalid.");
    }
    if (!saved.task_id.has_value()) {
      return uncertain(1);
    }
    outcome = "temporary";
  }
  if (outcome == "network" || outcome == "timeout" || outcome == "temporary") {
    if (task_id.has_value() && open_attempt) {
      ParkDelegationInput park;
      park.fence = fence;
      park.now_ms = now_ms;
      park.step_key = saved.step_key;
      park.attempt_id = attempt_id;
      park.event_id = event_id(state, 0);
      park.delegation_state = saved.state == DelegationState::Working ? DelegationState::Working : DelegationState::Accepted;
      park.task_id = task_id;
      park.next_attempt_at = now_ms + impl_->remote_delay(saved, saved.poll_failures + 1);
      impl_->issued.erase(run_id);
      impl_->remote_issued.erase(run_id);
      return impl_->store->apply(run_id, [&](State& next) {
        if (auto status = park_delegation(next, park); !status.ok()) {
          return status;
        }
        for (auto& row : next.delegations) {
          if (row.step_key == saved.step_key) {
            row.poll_failures = saved.poll_failures + 1;
          }
        }
        return Status::success();
      });
    }
    if (saved.task_id.has_value()) {
      impl_->issued.erase(run_id);
      impl_->remote_issued.erase(run_id);
      return impl_->schedule_remote_wait(fence, now_ms, run_id, saved.step_key, saved.state, saved.poll_failures + 1, false);
    }
    return uncertain(0);
  }
  if (outcome == "unauthorized") {
    return impl_->fail_remote(std::move(state), fence, now_ms, saved.step_key, "unauthorized_destination",
                             message == "The remote task failed." ? "The remote destination rejected the request." : message);
  }
  if (outcome == "conflict") {
    return impl_->fail_remote(std::move(state), fence, now_ms, saved.step_key, "permanent_execution_failure",
                             "The remote operation id was already used with a different request.");
  }
  if (outcome == "permanent" || outcome == "failed") {
    return impl_->fail_remote(std::move(state), fence, now_ms, saved.step_key, "permanent_execution_failure", message);
  }
  if (outcome == "unsupported") {
    return impl_->cancel_remote(std::move(state), fence, now_ms, saved.step_key,
                               "The remote adapter cannot cancel this task. The local run is cancelled. The remote task may still be active.");
  }
  if (outcome == "not_found") {
    if (saved.task_id.has_value()) {
      return impl_->fail_remote(std::move(state), fence, now_ms, saved.step_key, "permanent_execution_failure",
                               "The known remote task is no longer available.");
    }
    if (saved.cancel_intent || state.run.cancel_requested) {
      return impl_->cancel_remote(std::move(state), fence, now_ms, saved.step_key, "The remote operation was not found.");
    }
    if (!saved.capabilities.dedupe) {
      return impl_->unknown_remote(std::move(state), fence, now_ms, saved.step_key,
                                  "The remote operation was not found and the adapter does not dedupe submissions.");
    }
    if (!open_attempt) {
      return state_error("Stale or duplicate host result.");
    }
    ResolveStepInput resolve;
    resolve.fence = fence;
    resolve.now_ms = now_ms;
    resolve.step_key = saved.step_key;
    resolve.attempt_id = attempt_id;
    resolve.step_to = StepStatus::RetryScheduled;
    resolve.attempt_status = AttemptStatus::Interrupted;
    resolve.next_attempt_at = now_ms;
    resolve.reason = "remote_not_found";
    resolve.error_json = error_json("transient_execution_failure", "The remote operation was not found.", true);
    resolve.event_id = event_id(state, 0);
    impl_->issued.erase(run_id);
    impl_->remote_issued.erase(run_id);
    return impl_->store->apply(run_id, [&](State& next) {
      if (auto status = resolve_step(next, resolve); !status.ok()) {
        return status;
      }
      for (auto& row : next.delegations) {
        if (row.step_key == saved.step_key) {
          row.state = DelegationState::Queued;
          row.inflight_action.clear();
          row.updated_at = now_ms;
        }
      }
      return Status::success();
    });
  }
  if (outcome == "cancelled") {
    return impl_->cancel_remote(std::move(state), fence, now_ms, saved.step_key, "The remote task was cancelled.");
  }
  if (outcome == "input_required") {
    if (!task_id.has_value()) {
      return uncertain(0);
    }
    BlockRemoteInput block;
    block.fence = fence;
    block.now_ms = now_ms;
    block.step_key = saved.step_key;
    block.attempt_id = attempt_id;
    block.task_id = task_id;
    block.message = "The remote task needs input. Multi-turn remote input is not available until the A2A milestone.";
    block.event_id = event_id(state, 0);
    block.accepted_event_id = event_id(state, 0);
    block.run_event_id = event_id(state, saved.task_id.has_value() ? 0 : 1);
    impl_->issued.erase(run_id);
    impl_->remote_issued.erase(run_id);
    return impl_->store->apply(run_id, [&](State& next) { return block_remote_input(next, block); });
  }
  if (outcome == "accepted" || outcome == "working") {
    if (!task_id.has_value()) {
      return uncertain(0);
    }
    const DelegationState next_state = outcome == "working" ? DelegationState::Working : DelegationState::Accepted;
    const bool cancel_after = state.run.cancel_requested || saved.cancel_intent;
    if (cancel_after && !saved.capabilities.cancel) {
      if (open_attempt) {
        ParkDelegationInput park;
        park.fence = fence;
        park.now_ms = now_ms;
        park.step_key = saved.step_key;
        park.attempt_id = attempt_id;
        park.event_id = event_id(state, 0);
        park.delegation_state = next_state;
        park.task_id = task_id;
        park.next_attempt_at = now_ms;
        if (auto status = impl_->store->apply(run_id, [&](State& next) { return park_delegation(next, park); }); !status.ok()) {
          return status;
        }
        if (auto status = impl_->load(run_id, state); !status.ok()) {
          return status;
        }
      } else if (auto status = impl_->store->apply(run_id, [&](State& next) {
                   for (auto& row : next.delegations) {
                     if (row.step_key == saved.step_key) {
                       row.task_id = task_id;
                       row.state = next_state;
                       row.updated_at = now_ms;
                     }
                   }
                   return Status::success();
                 });
                 !status.ok()) {
        return status;
      }
      if (auto status = impl_->load(run_id, state); !status.ok()) {
        return status;
      }
      return impl_->cancel_remote(std::move(state), fence, now_ms, saved.step_key,
                                 "The remote adapter cannot cancel this task. The local run is cancelled. The remote task may still be active.");
    }
    if (open_attempt) {
      ParkDelegationInput park;
      park.fence = fence;
      park.now_ms = now_ms;
      park.step_key = saved.step_key;
      park.attempt_id = attempt_id;
      park.event_id = event_id(state, 0);
      park.delegation_state = next_state;
      park.task_id = task_id;
      park.next_attempt_at = now_ms + saved.poll_interval_ms;
      impl_->issued.erase(run_id);
      impl_->remote_issued.erase(run_id);
      return impl_->store->apply(run_id, [&](State& next) {
        if (auto status = park_delegation(next, park); !status.ok()) {
          return status;
        }
        if (cancel_after) {
          for (auto& row : next.delegations) {
            if (row.step_key == saved.step_key) {
              row.cancel_intent = true;
              row.updated_at = now_ms;
            }
          }
        }
        return Status::success();
      });
    }
    impl_->issued.erase(run_id);
    impl_->remote_issued.erase(run_id);
    if (auto status = impl_->schedule_remote_wait(fence, now_ms, run_id, saved.step_key, next_state, 0, false); !status.ok()) {
      return status;
    }
    if (!cancel_after) {
      return Status::success();
    }
    return impl_->store->apply(run_id, [&](State& next) {
      for (auto& row : next.delegations) {
        if (row.step_key == saved.step_key) {
          row.cancel_intent = true;
          row.task_id = task_id;
          row.updated_at = now_ms;
        }
      }
      return Status::success();
    });
  }
  if (outcome == "completed") {
    if (result == nullptr) {
      return saved.task_id.has_value()
                 ? impl_->fail_remote(std::move(state), fence, now_ms, saved.step_key, "permanent_execution_failure",
                                     "The remote completion did not include a result.")
                 : uncertain(0);
    }
    const std::string result_json = canonical_json(*result);
    if (result_json.size() > 65536) {
      return impl_->fail_remote(std::move(state), fence, now_ms, saved.step_key, "permanent_execution_failure",
                               "The remote result is larger than 65536 bytes.");
    }
    Call call;
    if (auto status = model_call_for(state, saved.step_key, call); !status.ok()) {
      return status;
    }
    ToolResult tool_result;
    tool_result.ok = true;
    tool_result.name = call.name;
    tool_result.call_id = call.id;
    tool_result.output = *result;
    CompleteDelegationInput done;
    done.fence = fence;
    done.now_ms = now_ms;
    done.step_key = saved.step_key;
    done.attempt_id = attempt_id;
    done.output_json = canonical_json(tool_result_json(tool_result));
    done.result_json = result_json;
    done.event_id = event_id(state, 0);
    done.result_event_id = event_id(state, 1);
    const bool cancel_after = state.run.cancel_requested || saved.cancel_intent;
    impl_->issued.erase(run_id);
    impl_->remote_issued.erase(run_id);
    return impl_->store->apply(run_id, [&](State& next) {
      for (auto& row : next.delegations) {
        if (row.step_key == saved.step_key && task_id.has_value()) {
          row.task_id = task_id;
        }
      }
      if (auto status = complete_delegation(next, done); !status.ok()) {
        return status;
      }
      if (!cancel_after) {
        return Status::success();
      }
      if (!can_transition(next.run.status, WorkflowStatus::Cancelled)) {
        return state_error("Workflow transition is not legal.");
      }
      next.run.status = WorkflowStatus::Cancelled;
      next.run.error_json = error_json("cancelled_execution", "The local run was cancelled. The remote result was stored and was not used.", false);
      next.run.blocked_reason = std::nullopt;
      next.run.updated_at = now_ms;
      return append_protocol_event(next, event_id(next, 0), "WORKFLOW_CANCELLED",
                                  obj({{"reason", jstr("cancelled")}, {"stepKey", jstr(saved.step_key)}}), now_ms);
    });
  }
  return state_error("Remote outcome \"" + outcome.substr(0, 40) + "\" is not recognized.");
}

Status Runtime::delegations_json(const std::string& run_id, std::string& out) {
  std::lock_guard<std::mutex> lock(impl_->mutex);
  State state;
  if (auto status = impl_->load(run_id, state); !status.ok()) {
    return status;
  }
  Json rows;
  rows.kind = Json::Kind::Array;
  for (const auto& row : state.delegations) {
    Json item;
    item.kind = Json::Kind::Object;
    item.object = {{"cancelIntent", jbool(row.cancel_intent)},
                   {"endpoint", jstr(row.endpoint)},
                   {"operationId", jstr(row.operation_id)},
                   {"remoteAgent", jstr(row.remote_agent)},
                   {"state", jstr(to_string(row.state))},
                   {"stepKey", jstr(row.step_key)},
                   {"taskId", row.task_id.has_value() ? jstr(*row.task_id) : jnull()}};
    rows.array.push_back(std::move(item));
  }
  out = canonical_json(rows);
  return Status::success();
}

Status Runtime::list_runs(std::vector<Run>& out) {
  std::lock_guard<std::mutex> lock(impl_->mutex);
  return impl_->store->list_runs(out);
}

Status Runtime::inspect(const std::string& run_id, Run& out) {
  std::lock_guard<std::mutex> lock(impl_->mutex);
  State state;
  if (auto status = impl_->load(run_id, state); !status.ok()) {
    return status;
  }
  out = state.run;
  return Status::success();
}

Status Runtime::result_json(const std::string& run_id, std::string& out) {
  std::lock_guard<std::mutex> lock(impl_->mutex);
  State state;
  if (auto status = impl_->load(run_id, state); !status.ok()) {
    return status;
  }
  if (state.run.status != WorkflowStatus::Completed || !state.run.output_json.has_value()) {
    return state_error("Run result is not available until the run completes.");
  }
  out = *state.run.output_json;
  return Status::success();
}

Status Runtime::step_count(const std::string& run_id, int32_t& count) {
  std::lock_guard<std::mutex> lock(impl_->mutex);
  State state;
  if (auto status = impl_->load(run_id, state); !status.ok()) {
    return status;
  }
  count = static_cast<int32_t>(state.steps.size());
  return Status::success();
}

Status Runtime::step_at(const std::string& run_id, int32_t index, Step& out) {
  std::lock_guard<std::mutex> lock(impl_->mutex);
  State state;
  if (auto status = impl_->load(run_id, state); !status.ok()) {
    return status;
  }
  if (index < 0 || static_cast<size_t>(index) >= state.steps.size()) {
    return Status::fail(Code::NotFound, "Step index is out of range.");
  }
  out = state.steps[static_cast<size_t>(index)];
  return Status::success();
}

Status Runtime::step_output(const std::string& run_id, const std::string& step_key, std::string& out) {
  std::lock_guard<std::mutex> lock(impl_->mutex);
  State state;
  if (auto status = impl_->load(run_id, state); !status.ok()) {
    return status;
  }
  const Step* step = find_key(state, step_key);
  if (step == nullptr || !step->output_json.has_value()) {
    return Status::fail(Code::NotFound, "Step output is not stored.");
  }
  out = *step->output_json;
  return Status::success();
}

Status Runtime::event_count(const std::string& run_id, int32_t& count) {
  std::lock_guard<std::mutex> lock(impl_->mutex);
  State state;
  if (auto status = impl_->load(run_id, state); !status.ok()) {
    return status;
  }
  count = static_cast<int32_t>(state.events.size());
  return Status::success();
}

Status Runtime::event_payload(const std::string& run_id, int32_t index, std::string& out) {
  std::lock_guard<std::mutex> lock(impl_->mutex);
  State state;
  if (auto status = impl_->load(run_id, state); !status.ok()) {
    return status;
  }
  if (index < 0 || static_cast<size_t>(index) >= state.events.size()) {
    return Status::fail(Code::NotFound, "Event index is out of range.");
  }
  out = state.events[static_cast<size_t>(index)].payload_json;
  return Status::success();
}

}  // namespace larkx
