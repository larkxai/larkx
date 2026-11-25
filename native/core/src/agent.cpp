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

struct AgentRecord {
  std::string name;
  int32_t version = 1;
  std::string instructions;
  std::string model_id;
  std::string model_name;
  bool tool_calling = true;
  std::vector<ToolDef> tools;
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

}  // namespace

struct Runtime::Impl {
  std::unique_ptr<Store> store;
  bool may_steal = false;
  std::string owner_id;
  int64_t lease_ms = 0;
  std::mutex mutex;
  std::unordered_map<std::string, AgentRecord> agents;
  std::unordered_map<std::string, std::string> issued;

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
                        EffectType effect, const std::string& operation, std::string& attempt_id) {
    const Step* existing = find_key(state, key);
    const int32_t number = existing == nullptr ? 1 : existing->attempt_count + 1;
    attempt_id = scoped_id("at-", state.run.run_id, key + "-" + std::to_string(number));
    BeginStepInput input;
    input.fence = fence;
    input.now_ms = now_ms;
    input.step_key = key;
    input.step_order = order;
    input.effect_type = effect;
    input.operation_id = operation;
    input.descriptor_json = obj({{"effects", jstr(to_string(effect))}, {"execution", jstr("local")}});
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
    if (auto status = begin_frontier(state, fence, now_ms, key, order, EffectType::Idempotent, operation, attempt); !status.ok()) {
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
    if (auto status = begin_frontier(state, fence, now_ms, key, order, effect, operation, attempt); !status.ok()) {
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

  Status plan(State state, const AgentRecord& agent, const Fence& fence, int64_t now_ms, ExecRequest& out, bool& again) {
    again = false;
    const std::string run_id = state.run.run_id;
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
          if (auto status = begin_frontier(state, fence, now_ms, tool_key, tool_order, tool->effect, operation, attempt); !status.ok()) {
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
          if (auto status = begin_frontier(state, fence, now_ms, tool_key, tool_order, tool->effect, recorded->operation_id, attempt);
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
  create.data_policy = "device-only";
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
  for (const auto& candidate : state.steps) {
    if (candidate.operation_id == request_id && candidate.status == StepStatus::UnknownOutcome) {
      step = &candidate;
    }
  }
  if (step == nullptr) {
    return state_error("Stale or duplicate host result.");
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
  if (auto status = impl_->store->reconcile(input, run_id); !status.ok()) {
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
  if (is_terminal(state.run.status) || state.run.status == WorkflowStatus::Blocked) {
    return Status::success();
  }
  if (!state.steps.empty() && state.steps.back().status == StepStatus::Running) {
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
