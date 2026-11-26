#include "host_session.h"

#include "larkx.h"
#include "larkx/json.hpp"

#include <cstdint>
#include <cstring>
#include <string_view>
#include <utility>
#include <vector>

namespace larkx::host {
namespace {

Status status_from(larkx_code code, const larkx_error& error) {
  Status status;
  status.code = static_cast<int>(code);
  switch (code) {
    case LARKX_OK:
      status.name = "OK";
      break;
    case LARKX_ERR_INVALID_ARGUMENT:
      status.name = "INVALID_ARGUMENT";
      break;
    case LARKX_ERR_STATE:
      status.name = "STATE";
      break;
    case LARKX_ERR_OWNERSHIP:
      status.name = "OWNERSHIP";
      break;
    case LARKX_ERR_STORAGE:
      status.name = "STORAGE";
      break;
    case LARKX_ERR_NOT_FOUND:
      status.name = "NOT_FOUND";
      break;
    case LARKX_ERR_SERIALIZATION:
      status.name = "SERIALIZATION";
      break;
    case LARKX_ERR_CAPACITY:
      status.name = "CAPACITY";
      break;
  }
  status.message = error.message;
  if (status.message.empty()) {
    status.message = status.name;
  }
  return status;
}

Status invalid(std::string message) {
  Status status;
  status.code = static_cast<int>(LARKX_ERR_INVALID_ARGUMENT);
  status.name = "INVALID_ARGUMENT";
  status.message = std::move(message);
  return status;
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

bool parse_i64(const std::string& text, int64_t& out) {
  if (text.empty()) {
    return false;
  }
  size_t index = 0;
  int64_t sign = 1;
  if (text[0] == '-') {
    sign = -1;
    index = 1;
  }
  if (index >= text.size()) {
    return false;
  }
  int64_t value = 0;
  for (; index < text.size(); index += 1) {
    if (text[index] < '0' || text[index] > '9') {
      return false;
    }
    const int64_t digit = text[index] - '0';
    if (value > (INT64_MAX - digit) / 10) {
      return false;
    }
    value = value * 10 + digit;
  }
  out = value * sign;
  return true;
}

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

std::string object_json(std::vector<std::pair<std::string, Json>> fields) {
  Json object;
  object.kind = Json::Kind::Object;
  object.object = std::move(fields);
  return canonical_json(object);
}

Status require_object(const std::string& text, Json& out) {
  std::string error;
  if (!parse_json(text, out, error) || out.kind != Json::Kind::Object) {
    return invalid(error.empty() ? "Host arguments must be a JSON object." : error);
  }
  return {};
}

std::string string_field(const Json& object, const char* key, const std::string& fallback = {}) {
  const Json* value = field(object, key);
  if (value == nullptr || value->kind != Json::Kind::String) {
    return fallback;
  }
  return value->text;
}

int64_t int_field(const Json& object, const char* key, int64_t fallback, Status& status) {
  const Json* value = field(object, key);
  if (value == nullptr) {
    return fallback;
  }
  if (value->kind != Json::Kind::Number) {
    status = invalid(std::string(key) + " must be an integer.");
    return fallback;
  }
  int64_t parsed = 0;
  if (!parse_i64(value->text, parsed)) {
    status = invalid(std::string(key) + " must be an integer.");
    return fallback;
  }
  return parsed;
}

bool bool_field(const Json& object, const char* key, bool fallback) {
  const Json* value = field(object, key);
  if (value == nullptr || value->kind != Json::Kind::Bool) {
    return fallback;
  }
  return value->boolean;
}

std::string run_json(const larkx_run_info& info) {
  return object_json({
      {"blockedReason", jstr(info.has_blocked_reason ? info.blocked_reason : "")},
      {"cancelRequested", jbool(info.cancel_requested != 0)},
      {"createdAt", jnum(info.created_at)},
      {"dataPolicy", jstr(info.data_policy)},
      {"hasBlockedReason", jbool(info.has_blocked_reason != 0)},
      {"hasOwner", jbool(info.has_owner != 0)},
      {"ownerId", jstr(info.has_owner ? info.owner_id : "")},
      {"ownershipEpoch", jnum(info.ownership_epoch)},
      {"protocolVersion", jnum(info.protocol_version)},
      {"runId", jstr(info.run_id)},
      {"status", jstr(info.status)},
      {"updatedAt", jnum(info.updated_at)},
      {"workflowName", jstr(info.workflow_name)},
      {"workflowVersion", jnum(info.workflow_version)},
  });
}

std::string request_json(const larkx_exec_request& request, const std::string& detail) {
  return object_json({
      {"attempt", jnum(request.attempt)},
      {"cancelRequested", jbool(request.cancel_requested != 0)},
      {"detailJson", jstr(detail)},
      {"effectType", jstr(request.effect_type)},
      {"hasWaitUntil", jbool(request.has_wait_until != 0)},
      {"kind", jnum(request.kind)},
      {"operationId", jstr(request.operation_id)},
      {"requestId", jstr(request.request_id)},
      {"stepKey", jstr(request.step_key)},
      {"toolName", jstr(request.tool_name)},
      {"waitUntilMs", jnum(request.wait_until_ms)},
  });
}

std::string step_json(const larkx_step_info& info) {
  return object_json({
      {"attemptCount", jnum(info.attempt_count)},
      {"effectType", jstr(info.effect_type)},
      {"executionTarget", jstr(info.execution_target)},
      {"operationId", jstr(info.operation_id)},
      {"selectedTarget", jstr(info.selected_target)},
      {"status", jstr(info.status)},
      {"stepKey", jstr(info.step_key)},
      {"stepOrder", jnum(info.step_order)},
  });
}

Status call_code(larkx_code code, larkx_error& error) {
  if (code == LARKX_OK) {
    return {};
  }
  return status_from(code, error);
}

}  // namespace

Session::~Session() { close(); }

void Session::close() {
  std::lock_guard<std::mutex> lock(mu_);
  close_unlocked();
}

void Session::close_unlocked() {
  if (runtime_ != nullptr) {
    larkx_runtime_close(runtime_);
    runtime_ = nullptr;
  }
}

Status Session::invoke(const std::string& method, const std::string& args_json, std::string& out) {
  std::lock_guard<std::mutex> lock(mu_);
  out.clear();
  if (method == "echo") {
    out = object_json({{"text", jstr(args_json)}});
    return {};
  }
  Json args;
  if (Status parsed = require_object(args_json, args); !parsed.ok()) {
    return parsed;
  }
  Status numbers;
  if (method == "versions") {
    out = object_json({
        {"abi", jnum(static_cast<int64_t>(larkx_abi_version()))},
        {"backend", jstr("native-cpp")},
        {"protocol", jnum(static_cast<int64_t>(LARKX_PROTOCOL_VERSION))},
        {"schema", jnum(static_cast<int64_t>(LARKX_STORAGE_SCHEMA_VERSION))},
    });
    return {};
  }
  if (method == "close") {
    close_unlocked();
    out = "{}";
    return {};
  }
  if (method == "open") {
    if (runtime_ != nullptr) {
      return invalid("Runtime is already open.");
    }
    const std::string path = string_field(args, "path");
    const std::string owner = string_field(args, "ownerId");
    const int64_t lease = int_field(args, "leaseMs", 0, numbers);
    if (!numbers.ok()) {
      return numbers;
    }
    uint32_t flags = 0;
    if (bool_field(args, "exclusive", false)) {
      flags |= LARKX_STORE_EXCLUSIVE_OWNERSHIP;
    }
    if (bool_field(args, "maySteal", false)) {
      flags |= LARKX_RUNTIME_MAY_STEAL;
    }
    larkx_error error{};
    const larkx_code code = larkx_runtime_open(path.c_str(), flags, owner.c_str(), lease, &runtime_, &error);
    if (code != LARKX_OK) {
      runtime_ = nullptr;
      return status_from(code, error);
    }
    out = "{}";
    return {};
  }
  if (runtime_ == nullptr) {
    return invalid("Runtime is closed.");
  }
  larkx_error error{};
  if (method == "registerAgent") {
    const Json* agent = field(args, "agent");
    if (agent == nullptr || agent->kind != Json::Kind::Object) {
      return invalid("Agent registration is missing.");
    }
    const std::string name = string_field(*agent, "name");
    const std::string instructions = string_field(*agent, "instructions");
    const std::string model_id = string_field(*agent, "modelId");
    const std::string model_name = string_field(*agent, "modelName");
    const std::string model_backoff = string_field(*agent, "modelBackoff");
    const int64_t version = int_field(*agent, "version", 0, numbers);
    if (!numbers.ok()) {
      return numbers;
    }
    struct StoredTool {
      std::string name;
      std::string description;
      std::string schema;
      std::string effects;
      std::string backoff;
      int32_t max_attempts = 0;
      int64_t initial = -1;
      int64_t max_interval = -1;
    };
    std::vector<StoredTool> stored;
    const Json* tools = field(*agent, "tools");
    if (tools != nullptr && tools->kind == Json::Kind::Array) {
      for (const Json& tool : tools->array) {
        if (tool.kind != Json::Kind::Object) {
          return invalid("Tool registration must be an object.");
        }
        StoredTool item;
        item.name = string_field(tool, "name");
        item.description = string_field(tool, "description");
        item.effects = string_field(tool, "effects");
        item.backoff = string_field(tool, "backoff");
        item.max_attempts = static_cast<int32_t>(int_field(tool, "maxAttempts", 0, numbers));
        item.initial = int_field(tool, "initialIntervalMs", -1, numbers);
        item.max_interval = int_field(tool, "maxIntervalMs", -1, numbers);
        if (!numbers.ok()) {
          return numbers;
        }
        const Json* schema = field(tool, "schema");
        if (schema == nullptr) {
          return invalid("Tool schema is missing.");
        }
        if (schema->kind == Json::Kind::String) {
          item.schema = schema->text;
        } else {
          item.schema = canonical_json(*schema);
        }
        stored.push_back(std::move(item));
      }
    }
    struct StoredRemote {
      std::string name;
      std::string description;
      std::string schema;
      std::string endpoint;
      int64_t poll_interval_ms = 0;
      bool dedupe = false;
      bool lookup = false;
      bool durable_task = false;
      bool poll = false;
      bool cancel = false;
      bool persistent = false;
      std::string transport = "http";
    };
    std::vector<StoredRemote> stored_remotes;
    const Json* remotes = field(*agent, "remoteAgents");
    if (remotes != nullptr && remotes->kind == Json::Kind::Array) {
      for (const Json& remote : remotes->array) {
        if (remote.kind != Json::Kind::Object) {
          return invalid("Remote agent registration must be an object.");
        }
        StoredRemote item;
        item.name = string_field(remote, "name");
        item.description = string_field(remote, "description");
        item.endpoint = string_field(remote, "endpoint");
        item.poll_interval_ms = int_field(remote, "pollIntervalMs", 0, numbers);
        item.dedupe = bool_field(remote, "dedupe", false);
        item.lookup = bool_field(remote, "lookup", false);
        item.durable_task = bool_field(remote, "durableTask", false);
        item.poll = bool_field(remote, "poll", false);
        item.cancel = bool_field(remote, "cancel", false);
        item.persistent = bool_field(remote, "persistent", false);
        item.transport = string_field(remote, "transport");
        if (item.transport.empty()) {
          item.transport = "http";
        }
        if (!numbers.ok()) {
          return numbers;
        }
        const Json* schema = field(remote, "schema");
        if (schema == nullptr) {
          item.schema = "{\"additionalProperties\":true,\"type\":\"object\"}";
        } else if (schema->kind == Json::Kind::String) {
          item.schema = schema->text;
        } else {
          item.schema = canonical_json(*schema);
        }
        stored_remotes.push_back(std::move(item));
      }
    }
    std::vector<larkx_tool_spec> specs(stored.size());
    for (size_t index = 0; index < stored.size(); index += 1) {
      specs[index].name = stored[index].name.c_str();
      specs[index].description = stored[index].description.c_str();
      specs[index].input_schema_json = stored[index].schema.c_str();
      specs[index].effects = stored[index].effects.c_str();
      specs[index].max_attempts = stored[index].max_attempts;
      specs[index].initial_interval_ms = stored[index].initial;
      specs[index].max_interval_ms = stored[index].max_interval;
      specs[index].backoff = stored[index].backoff.c_str();
    }
    larkx_agent_spec spec{};
    spec.name = name.c_str();
    spec.version = static_cast<int32_t>(version);
    spec.instructions = instructions.c_str();
    spec.model_id = model_id.c_str();
    spec.model_name = model_name.c_str();
    spec.tool_calling = bool_field(*agent, "toolCalling", true) ? 1 : 0;
    spec.tools = specs.empty() ? nullptr : specs.data();
    spec.tool_count = static_cast<int32_t>(specs.size());
    spec.max_iterations = static_cast<int32_t>(int_field(*agent, "maxIterations", 0, numbers));
    spec.max_tool_calls = static_cast<int32_t>(int_field(*agent, "maxToolCalls", 0, numbers));
    spec.max_invalid_tool_requests = static_cast<int32_t>(int_field(*agent, "maxInvalidToolRequests", 0, numbers));
    spec.max_context_chars = static_cast<int32_t>(int_field(*agent, "maxContextChars", 0, numbers));
    spec.model_max_attempts = static_cast<int32_t>(int_field(*agent, "modelMaxAttempts", 0, numbers));
    spec.model_initial_interval_ms = int_field(*agent, "modelInitialIntervalMs", -1, numbers);
    spec.model_max_interval_ms = int_field(*agent, "modelMaxIntervalMs", -1, numbers);
    spec.model_backoff = model_backoff.c_str();
    std::vector<larkx_remote_spec> remote_specs(stored_remotes.size());
    for (size_t index = 0; index < stored_remotes.size(); index += 1) {
      remote_specs[index].name = stored_remotes[index].name.c_str();
      remote_specs[index].description = stored_remotes[index].description.c_str();
      remote_specs[index].input_schema_json = stored_remotes[index].schema.c_str();
      remote_specs[index].endpoint = stored_remotes[index].endpoint.c_str();
      remote_specs[index].dedupe = stored_remotes[index].dedupe ? 1 : 0;
      remote_specs[index].lookup = stored_remotes[index].lookup ? 1 : 0;
      remote_specs[index].durable_task = stored_remotes[index].durable_task ? 1 : 0;
      remote_specs[index].poll = stored_remotes[index].poll ? 1 : 0;
      remote_specs[index].cancel = stored_remotes[index].cancel ? 1 : 0;
      remote_specs[index].persistent = stored_remotes[index].persistent ? 1 : 0;
      remote_specs[index].poll_interval_ms = stored_remotes[index].poll_interval_ms;
      remote_specs[index].transport = stored_remotes[index].transport.c_str();
    }
    spec.remote_agents = remote_specs.empty() ? nullptr : remote_specs.data();
    spec.remote_count = static_cast<int32_t>(remote_specs.size());
    spec.allow_remote = bool_field(*agent, "allowRemote", !stored_remotes.empty()) ? 1 : 0;
    if (!numbers.ok()) {
      return numbers;
    }
    out = "{}";
    return call_code(larkx_agent_register(runtime_, &spec, &error), error);
  }

  const std::string run_id = string_field(args, "runId");
  const int64_t now = int_field(args, "nowMs", 0, numbers);
  if (!numbers.ok()) {
    return numbers;
  }
  if (method == "start") {
    larkx_run_info info{};
    const std::string name = string_field(args, "name");
    const std::string input = string_field(args, "inputJson");
    const int64_t version = int_field(args, "version", 0, numbers);
    if (!numbers.ok()) {
      return numbers;
    }
    const larkx_code code =
        larkx_agent_start(runtime_, name.c_str(), static_cast<int32_t>(version), run_id.c_str(), input.c_str(), now, &info, &error);
    if (code != LARKX_OK && info.run_id[0] == '\0') {
      return status_from(code, error);
    }
    out = run_json(info);
    return code == LARKX_OK ? Status{} : status_from(code, error);
  }
  if (method == "drive") {
    larkx_exec_request request{};
    std::string detail(65536, '\0');
    size_t needed = 0;
    larkx_code code = larkx_run_drive(runtime_, run_id.c_str(), now, &request, detail.data(), detail.size(), &needed, &error);
    if (code == LARKX_ERR_CAPACITY && needed > detail.size()) {
      detail.assign(needed, '\0');
      code = larkx_run_drive(runtime_, run_id.c_str(), now, &request, detail.data(), detail.size(), &needed, &error);
    }
    if (code != LARKX_OK) {
      return status_from(code, error);
    }
    out = request_json(request, detail.c_str());
    return {};
  }
  if (method == "submitModel" || method == "submitTool") {
    const std::string request_id = string_field(args, "requestId");
    const std::string body = string_field(args, "bodyJson");
    const std::string error_code = string_field(args, "errorCode");
    const std::string error_message = string_field(args, "errorMessage");
    const int retryable = bool_field(args, "retryable", false) ? 1 : 0;
    const larkx_code code =
        method == "submitModel"
            ? larkx_run_submit_model(runtime_, run_id.c_str(), request_id.c_str(), body.c_str(), error_code.c_str(), error_message.c_str(),
                                    retryable, now, &error)
            : larkx_run_submit_tool(runtime_, run_id.c_str(), request_id.c_str(), body.c_str(), error_code.c_str(), error_message.c_str(),
                                   retryable, now, &error);
    out = "{}";
    return call_code(code, error);
  }
  if (method == "provideInput") {
    const larkx_code code = larkx_run_provide_input(runtime_, run_id.c_str(), string_field(args, "stepKey").c_str(),
                                                   string_field(args, "text").c_str(), now, &error);
    out = "{}";
    return call_code(code, error);
  }
  if (method == "submitDelegation") {
    const larkx_code code = larkx_run_submit_delegation(runtime_, run_id.c_str(), string_field(args, "requestId").c_str(),
                                                       string_field(args, "bodyJson").c_str(), now, &error);
    out = "{}";
    return call_code(code, error);
  }
  if (method == "delegations") {
    std::string buffer(65536, '\0');
    size_t needed = 0;
    auto read = [&](char* data, size_t capacity) {
      return larkx_run_delegations(runtime_, run_id.c_str(), data, capacity, &needed, &error);
    };
    larkx_code code = read(buffer.data(), buffer.size());
    if (code == LARKX_ERR_CAPACITY && needed > buffer.size()) {
      buffer.assign(needed, '\0');
      code = read(buffer.data(), buffer.size());
    }
    if (code != LARKX_OK) {
      return status_from(code, error);
    }
    out = buffer.c_str();
    return {};
  }
  if (method == "submitReconcile") {
    const larkx_code code = larkx_run_submit_reconcile(runtime_, run_id.c_str(), string_field(args, "requestId").c_str(),
                                                      string_field(args, "resolution").c_str(), string_field(args, "bodyJson", "null").c_str(),
                                                      string_field(args, "message").c_str(), now, &error);
    out = "{}";
    return call_code(code, error);
  }
  if (method == "pause" || method == "resume" || method == "cancel") {
    const larkx_code code = method == "pause"   ? larkx_run_pause(runtime_, run_id.c_str(), now, &error)
                            : method == "resume" ? larkx_run_resume(runtime_, run_id.c_str(), now, &error)
                                                 : larkx_run_cancel(runtime_, run_id.c_str(), now, &error);
    out = "{}";
    return call_code(code, error);
  }
  if (method == "inspect") {
    larkx_run_info info{};
    const larkx_code code = larkx_run_inspect(runtime_, run_id.c_str(), &info, &error);
    if (code != LARKX_OK) {
      return status_from(code, error);
    }
    out = run_json(info);
    return {};
  }
  if (method == "listRuns") {
    int32_t count = 0;
    const larkx_code counted = larkx_run_count(runtime_, &count, &error);
    if (counted != LARKX_OK) {
      return status_from(counted, error);
    }
    Json runs;
    runs.kind = Json::Kind::Array;
    for (int32_t index = 0; index < count; index += 1) {
      larkx_run_info info{};
      const larkx_code code = larkx_run_at(runtime_, index, &info, &error);
      if (code == LARKX_ERR_NOT_FOUND) {
        break;
      }
      if (code != LARKX_OK) {
        return status_from(code, error);
      }
      Json item;
      std::string parse_error;
      if (!parse_json(run_json(info), item, parse_error)) {
        return invalid(parse_error.empty() ? "Run list item was not JSON." : parse_error);
      }
      runs.array.push_back(std::move(item));
    }
    Json body;
    body.kind = Json::Kind::Object;
    body.object = {{"runs", std::move(runs)}};
    out = canonical_json(body);
    return {};
  }
  if (method == "result" || method == "stepOutput" || method == "eventPayload") {
    std::string buffer(4096, '\0');
    size_t needed = 0;
    auto read = [&](char* data, size_t capacity) {
      if (method == "result") {
        return larkx_run_result(runtime_, run_id.c_str(), data, capacity, &needed, &error);
      }
      if (method == "stepOutput") {
        return larkx_run_step_output(runtime_, run_id.c_str(), string_field(args, "stepKey").c_str(), data, capacity, &needed, &error);
      }
      const int64_t index = int_field(args, "index", -1, numbers);
      return larkx_run_event_payload(runtime_, run_id.c_str(), static_cast<int32_t>(index), data, capacity, &needed, &error);
    };
    larkx_code code = read(buffer.data(), buffer.size());
    if (!numbers.ok()) {
      return numbers;
    }
    if (code == LARKX_ERR_CAPACITY && needed > buffer.size()) {
      buffer.assign(needed, '\0');
      code = read(buffer.data(), buffer.size());
    }
    if (code != LARKX_OK) {
      return status_from(code, error);
    }
    out = buffer.c_str();
    return {};
  }
  if (method == "stepCount" || method == "eventCount") {
    int32_t count = 0;
    const larkx_code code = method == "stepCount" ? larkx_run_step_count(runtime_, run_id.c_str(), &count, &error)
                                                  : larkx_run_event_count(runtime_, run_id.c_str(), &count, &error);
    if (code != LARKX_OK) {
      return status_from(code, error);
    }
    out = std::to_string(count);
    return {};
  }
  if (method == "stepAt") {
    const int64_t index = int_field(args, "index", -1, numbers);
    if (!numbers.ok()) {
      return numbers;
    }
    larkx_step_info info{};
    const larkx_code code = larkx_run_step_at(runtime_, run_id.c_str(), static_cast<int32_t>(index), &info, &error);
    if (code != LARKX_OK) {
      return status_from(code, error);
    }
    out = step_json(info);
    return {};
  }
  return invalid("Unknown host method.");
}

}  // namespace larkx::host
