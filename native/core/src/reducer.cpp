#include "larkx/core.hpp"

#include "larkx/json.hpp"

#include <utility>

namespace larkx {
namespace {

Status state_error(std::string message) { return Status::fail(Code::State, std::move(message)); }

Status ownership_error() {
  return Status::fail(Code::Ownership, "The execution owner fence does not match this run.");
}

Status storage_error(std::string message) { return Status::fail(Code::Storage, std::move(message)); }

Status serialization_error(std::string message) {
  return Status::fail(Code::Serialization, std::move(message));
}

bool fence_matches(const Run& run, const Fence& fence) {
  return run.owner_id.has_value() && run.owner_id == fence.owner_id && run.ownership_epoch == fence.epoch;
}

Status require_fence(const Run& run, const Fence& fence) {
  if (!fence_matches(run, fence)) {
    return ownership_error();
  }
  return Status::success();
}

Status require_mutable(WorkflowStatus status) {
  if (is_terminal(status) || status == WorkflowStatus::Blocked) {
    return state_error(std::string("Cannot execute steps while the workflow is ") + to_string(status) + ".");
  }
  return Status::success();
}

bool lease_active(const Run& run, int64_t now_ms) {
  if (!run.owner_id.has_value()) {
    return false;
  }
  if (!run.lease_expires_at.has_value()) {
    return true;
  }
  return *run.lease_expires_at > now_ms;
}

std::optional<int64_t> expiry(int64_t now_ms, int64_t lease_ms) {
  if (lease_ms <= 0) {
    return std::nullopt;
  }
  return now_ms + lease_ms;
}

Status append_event(State& state, std::string event_id, std::string type, std::string payload, int64_t now_ms) {
  if (!parse_event_type(type)) {
    return state_error("Event type is not in protocol version 1.");
  }
  Json parsed;
  std::string error;
  if (!parse_json(payload, parsed, error) || !json_is_object(parsed)) {
    return serialization_error(error.empty() ? "Event payload must be a JSON object." : error);
  }
  std::string sensitive;
  if (top_level_sensitive_key(parsed, sensitive)) {
    return serialization_error("Event payload cannot include \"" + sensitive +
                               "\". Persist it on the step record instead.");
  }
  if (!state.events.empty() && state.events.back().sequence != static_cast<int64_t>(state.events.size())) {
    return storage_error("Event sequence is not contiguous.");
  }
  Event event;
  event.event_id = std::move(event_id);
  event.run_id = state.run.run_id;
  event.sequence = static_cast<int64_t>(state.events.size()) + 1;
  event.type = std::move(type);
  event.payload_json = canonical_json(parsed);
  event.created_at = now_ms;
  state.events.push_back(std::move(event));
  return Status::success();
}

const Attempt* find_attempt(const State& state, std::string_view attempt_id) {
  for (const auto& attempt : state.attempts) {
    if (attempt.attempt_id == attempt_id) {
      return &attempt;
    }
  }
  return nullptr;
}

const Attempt* latest_open_attempt(const State& state, std::string_view step_key) {
  for (auto it = state.attempts.rbegin(); it != state.attempts.rend(); ++it) {
    if (it->step_key == step_key && it->status == AttemptStatus::Started) {
      return &*it;
    }
  }
  return nullptr;
}

void close_attempt(State& state, std::string_view attempt_id, AttemptStatus status, int64_t now_ms,
                   const std::optional<std::string>& error_json) {
  for (auto& attempt : state.attempts) {
    if (attempt.attempt_id == attempt_id) {
      attempt.status = status;
      attempt.completed_at = now_ms;
      attempt.error_json = error_json;
      return;
    }
  }
}

Json jstring(std::string text) {
  Json value;
  value.kind = Json::Kind::String;
  value.text = std::move(text);
  return value;
}

Json jint(int64_t number) {
  Json value;
  value.kind = Json::Kind::Number;
  value.text = std::to_string(number);
  return value;
}

std::string object_payload(std::vector<std::pair<std::string, Json>> fields) {
  Json object;
  object.kind = Json::Kind::Object;
  object.object = std::move(fields);
  return canonical_json(object);
}

}  // namespace

Status validate_identity(std::string_view value, std::string_view label, size_t max_length) {
  if (value.empty() || value.size() > max_length) {
    return Status::fail(Code::InvalidArgument,
                        std::string(label) + " must be 1-" + std::to_string(max_length) + " characters.");
  }
  if (value.front() == ' ' || value.back() == ' ' || value.front() == '\t' || value.back() == '\t') {
    return Status::fail(Code::InvalidArgument, std::string(label) + " must not contain surrounding whitespace.");
  }
  for (unsigned char c : value) {
    if (c <= 0x1f || c == 0x7f) {
      return Status::fail(Code::InvalidArgument, std::string(label) + " must not contain control characters.");
    }
  }
  return Status::success();
}

Status validate_run_id(std::string_view value) { return validate_identity(value, "Run id", 200); }

Status validate_step_key(std::string_view value) {
  if (value.empty() || value.size() > 128) {
    return Status::fail(Code::InvalidArgument, "Step key must match /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.");
  }
  const auto head = static_cast<unsigned char>(value.front());
  const bool head_ok = (head >= 'A' && head <= 'Z') || (head >= 'a' && head <= 'z') || (head >= '0' && head <= '9');
  if (!head_ok) {
    return Status::fail(Code::InvalidArgument, "Step key must match /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.");
  }
  for (unsigned char c : value) {
    const bool ok = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '.' ||
                    c == '_' || c == ':' || c == '-';
    if (!ok) {
      return Status::fail(Code::InvalidArgument, "Step key must match /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.");
    }
  }
  return Status::success();
}

Status validate_workflow_name(std::string_view value) {
  if (value.empty() || value.size() > 64) {
    return Status::fail(Code::InvalidArgument, "Workflow name must match /^[a-z][a-z0-9-]{0,63}$/.");
  }
  const auto head = static_cast<unsigned char>(value.front());
  if (head < 'a' || head > 'z') {
    return Status::fail(Code::InvalidArgument, "Workflow name must match /^[a-z][a-z0-9-]{0,63}$/.");
  }
  for (unsigned char c : value) {
    const bool ok = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-';
    if (!ok) {
      return Status::fail(Code::InvalidArgument, "Workflow name must match /^[a-z][a-z0-9-]{0,63}$/.");
    }
  }
  return Status::success();
}

Status validate_json_text(std::string_view value, bool object, std::string& canonical) {
  Json parsed;
  std::string error;
  if (!parse_json(value, parsed, error)) {
    return serialization_error(error);
  }
  if (object && !json_is_object(parsed)) {
    return serialization_error("JSON value must be an object.");
  }
  canonical = canonical_json(parsed);
  return Status::success();
}

const Step* find_step(const State& state, std::string_view key) {
  for (const auto& step : state.steps) {
    if (step.step_key == key) {
      return &step;
    }
  }
  return nullptr;
}

Step* find_step(State& state, std::string_view key) {
  for (auto& step : state.steps) {
    if (step.step_key == key) {
      return &step;
    }
  }
  return nullptr;
}

CreateRunOutcome create_run(const State* existing, const CreateRunInput& input) {
  CreateRunOutcome outcome;
  if (auto status = validate_run_id(input.run_id); !status.ok()) {
    outcome.status = status;
    return outcome;
  }
  if (auto status = validate_workflow_name(input.workflow_name); !status.ok()) {
    outcome.status = status;
    return outcome;
  }
  if (input.workflow_version < 1) {
    outcome.status = Status::fail(Code::InvalidArgument, "Workflow version must be an integer greater than or equal to 1.");
    return outcome;
  }
  if (auto status = validate_identity(input.event_id, "Event id", 200); !status.ok()) {
    outcome.status = status;
    return outcome;
  }
  DataPolicy policy;
  if (!parse_data_policy(input.data_policy, policy)) {
    outcome.status = Status::fail(Code::InvalidArgument, "Data policy is invalid.");
    return outcome;
  }
  std::string input_json;
  if (auto status = validate_json_text(input.input_json, false, input_json); !status.ok()) {
    outcome.status = status;
    return outcome;
  }
  if (existing != nullptr) {
    outcome.created = false;
    outcome.state = *existing;
    outcome.status = Status::success();
    return outcome;
  }
  State state;
  state.run.run_id = input.run_id;
  state.run.workflow_name = input.workflow_name;
  state.run.workflow_version = input.workflow_version;
  state.run.input_json = input_json;
  state.run.status = WorkflowStatus::Created;
  state.run.created_at = input.now_ms;
  state.run.updated_at = input.now_ms;
  state.run.protocol_version = 1;
  state.run.data_policy = policy;
  const std::string payload = object_payload({
      {"workflowName", jstring(input.workflow_name)},
      {"workflowVersion", jint(input.workflow_version)},
      {"protocolVersion", jint(1)},
      {"dataPolicy", jstring(to_string(policy))},
  });
  if (auto status = append_event(state, input.event_id, "WORKFLOW_CREATED", payload, input.now_ms); !status.ok()) {
    outcome.status = status;
    return outcome;
  }
  outcome.created = true;
  outcome.state = std::move(state);
  outcome.status = Status::success();
  return outcome;
}

ClaimOutcome claim_ownership(const State& state, const ClaimInput& input) {
  ClaimOutcome outcome;
  outcome.state = state;
  if (auto status = validate_identity(input.owner_id, "Owner id", 200); !status.ok()) {
    outcome.status = status;
    return outcome;
  }
  const Run& run = state.run;
  if (is_terminal(run.status)) {
    outcome.acquired = false;
    outcome.epoch = run.ownership_epoch;
    outcome.owner_id = run.owner_id.value_or(input.owner_id);
    outcome.lease_expires_at = run.lease_expires_at;
    outcome.reason = "terminal";
    outcome.status = Status::success();
    return outcome;
  }
  const bool active = lease_active(run, input.now_ms);
  const bool same_owner = run.owner_id.has_value() && *run.owner_id == input.owner_id;
  if (same_owner && (active || input.exclusive)) {
    outcome.state.run.lease_expires_at = expiry(input.now_ms, input.lease_ms);
    outcome.state.run.updated_at = input.now_ms;
    outcome.acquired = true;
    outcome.epoch = run.ownership_epoch;
    outcome.owner_id = input.owner_id;
    outcome.lease_expires_at = outcome.state.run.lease_expires_at;
    outcome.status = Status::success();
    return outcome;
  }
  const bool other_owner = run.owner_id.has_value() && *run.owner_id != input.owner_id;
  if (other_owner && !input.may_steal && (active || input.exclusive)) {
    outcome.acquired = false;
    outcome.epoch = run.ownership_epoch;
    outcome.owner_id = *run.owner_id;
    outcome.lease_expires_at = run.lease_expires_at;
    outcome.reason = "owned_by_other";
    outcome.status = Status::success();
    return outcome;
  }
  const int64_t epoch = run.ownership_epoch + 1;
  outcome.state.run.owner_id = input.owner_id;
  outcome.state.run.ownership_epoch = epoch;
  outcome.state.run.lease_expires_at = expiry(input.now_ms, input.lease_ms);
  outcome.state.run.updated_at = input.now_ms;
  outcome.acquired = true;
  outcome.epoch = epoch;
  outcome.owner_id = input.owner_id;
  outcome.lease_expires_at = outcome.state.run.lease_expires_at;
  outcome.status = Status::success();
  return outcome;
}

Status renew_ownership(State& state, const Fence& fence, int64_t now_ms, int64_t lease_ms, bool& renewed) {
  renewed = false;
  if (!fence_matches(state.run, fence) || is_terminal(state.run.status)) {
    return Status::success();
  }
  state.run.lease_expires_at = expiry(now_ms, lease_ms);
  state.run.updated_at = now_ms;
  renewed = true;
  return Status::success();
}

Status release_ownership(State& state, const Fence& fence, int64_t now_ms, bool& released) {
  released = false;
  if (!fence_matches(state.run, fence)) {
    return Status::success();
  }
  state.run.owner_id = std::nullopt;
  state.run.ownership_epoch += 1;
  state.run.lease_expires_at = std::nullopt;
  state.run.updated_at = now_ms;
  released = true;
  return Status::success();
}

Status request_cancel(State& state, int64_t now_ms) {
  if (is_terminal(state.run.status) || state.run.cancel_requested) {
    return Status::success();
  }
  state.run.cancel_requested = true;
  state.run.updated_at = now_ms;
  return Status::success();
}

Status transition_run(State& state, const TransitionInput& input) {
  if (auto status = require_fence(state.run, input.fence); !status.ok()) {
    return status;
  }
  if (auto status = validate_identity(input.event_id, "Event id", 200); !status.ok()) {
    return status;
  }
  WorkflowStatus to = input.to;
  if (input.honor_cancel && to == WorkflowStatus::Completed && state.run.cancel_requested) {
    to = WorkflowStatus::Cancelled;
  }
  if (!can_transition(state.run.status, to)) {
    return state_error(std::string("Cannot transition workflow from ") + to_string(state.run.status) + " to " +
                       to_string(to) + ".");
  }
  std::string event_type = input.event_type;
  if (to == WorkflowStatus::Cancelled && event_type != "WORKFLOW_CANCELLED") {
    event_type = "WORKFLOW_CANCELLED";
  }
  state.run.status = to;
  state.run.updated_at = input.now_ms;
  if (input.set_output) {
    state.run.output_json = input.output_json;
  }
  if (input.set_error) {
    state.run.error_json = input.error_json;
  }
  if (input.set_blocked) {
    state.run.blocked_reason = input.blocked_reason;
  }
  return append_event(state, input.event_id, event_type, input.payload_json, input.now_ms);
}

Status begin_step(State& state, const BeginStepInput& input) {
  if (auto status = require_fence(state.run, input.fence); !status.ok()) {
    return status;
  }
  if (auto status = require_mutable(state.run.status); !status.ok()) {
    return status;
  }
  if (auto status = validate_step_key(input.step_key); !status.ok()) {
    return status;
  }
  if (auto status = validate_identity(input.operation_id, "Operation id", 200); !status.ok()) {
    return status;
  }
  if (auto status = validate_identity(input.attempt_id, "Attempt id", 200); !status.ok()) {
    return status;
  }
  if (auto status = validate_identity(input.event_id, "Event id", 200); !status.ok()) {
    return status;
  }
  Step* existing = find_step(state, input.step_key);
  if (existing == nullptr) {
    if (input.step_order != static_cast<int32_t>(state.steps.size())) {
      return state_error("Step \"" + input.step_key + "\" would be stored out of order.");
    }
    Step step;
    step.run_id = state.run.run_id;
    step.step_key = input.step_key;
    step.step_order = input.step_order;
    step.status = StepStatus::Running;
    step.execution_target = input.execution_target;
    step.selected_target = input.selected_target;
    step.effect_type = input.effect_type;
    step.attempt_count = 1;
    step.input_json = input.input_json;
    step.operation_id = input.operation_id;
    step.descriptor_json = input.descriptor_json;
    step.created_at = input.now_ms;
    step.updated_at = input.now_ms;
    Attempt attempt;
    attempt.attempt_id = input.attempt_id;
    attempt.run_id = state.run.run_id;
    attempt.step_key = input.step_key;
    attempt.attempt_number = 1;
    attempt.execution_target = input.selected_target;
    attempt.status = AttemptStatus::Started;
    attempt.started_at = input.now_ms;
    state.steps.push_back(std::move(step));
    state.attempts.push_back(std::move(attempt));
  } else {
    if (existing->step_order != input.step_order) {
      return state_error("Step \"" + input.step_key + "\" changed order.");
    }
    if (existing->operation_id != input.operation_id) {
      return state_error("Step \"" + input.step_key + "\" changed operation id.");
    }
    if (existing->effect_type != input.effect_type || existing->execution_target != input.execution_target) {
      return state_error("Step \"" + input.step_key + "\" changed its execution target or effect class.");
    }
    if (existing->status != StepStatus::Pending && existing->status != StepStatus::RetryScheduled) {
      return state_error(std::string("Cannot begin step \"") + input.step_key + "\" from " +
                         to_string(existing->status) + ".");
    }
    if (!can_transition(existing->status, StepStatus::Running)) {
      return state_error("Step transition is not legal.");
    }
    const int32_t attempt_number = existing->attempt_count + 1;
    existing->status = StepStatus::Running;
    existing->selected_target = input.selected_target;
    existing->attempt_count = attempt_number;
    existing->next_attempt_at = std::nullopt;
    existing->error_json = std::nullopt;
    existing->updated_at = input.now_ms;
    Attempt attempt;
    attempt.attempt_id = input.attempt_id;
    attempt.run_id = state.run.run_id;
    attempt.step_key = input.step_key;
    attempt.attempt_number = attempt_number;
    attempt.execution_target = input.selected_target;
    attempt.status = AttemptStatus::Started;
    attempt.started_at = input.now_ms;
    state.attempts.push_back(std::move(attempt));
  }
  state.run.updated_at = input.now_ms;
  const std::string payload = object_payload({
      {"stepKey", jstring(input.step_key)},
      {"effects", jstring(to_string(input.effect_type))},
      {"execution", jstring(to_string(input.execution_target))},
      {"operationId", jstring(input.operation_id)},
  });
  return append_event(state, input.event_id, "STEP_STARTED", payload, input.now_ms);
}

Status commit_step(State& state, const CommitStepInput& input) {
  if (auto status = require_fence(state.run, input.fence); !status.ok()) {
    return status;
  }
  if (auto status = validate_identity(input.event_id, "Event id", 200); !status.ok()) {
    return status;
  }
  Step* step = find_step(state, input.step_key);
  if (step == nullptr) {
    return Status::fail(Code::NotFound, "Step \"" + input.step_key + "\" does not exist.");
  }
  if (step->status != StepStatus::Running) {
    return state_error("Step \"" + input.step_key + "\" is " + std::string(to_string(step->status)) +
                       ", not RUNNING.");
  }
  const Attempt* attempt = find_attempt(state, input.attempt_id);
  if (attempt == nullptr || attempt->step_key != step->step_key || attempt->status != AttemptStatus::Started) {
    return state_error("Attempt " + input.attempt_id + " is not the open attempt for step \"" + input.step_key +
                       "\".");
  }
  if (!can_transition(step->status, StepStatus::Completed)) {
    return state_error("Step transition is not legal.");
  }
  const int32_t attempt_number = attempt->attempt_number;
  step->status = StepStatus::Completed;
  step->output_json = input.output_json;
  step->error_json = std::nullopt;
  step->next_attempt_at = std::nullopt;
  step->updated_at = input.now_ms;
  close_attempt(state, input.attempt_id, AttemptStatus::Completed, input.now_ms, std::nullopt);
  state.run.updated_at = input.now_ms;
  const std::string payload = object_payload({
      {"stepKey", jstring(input.step_key)},
      {"effects", jstring(to_string(step->effect_type))},
      {"execution", jstring(to_string(step->execution_target))},
      {"attempt", jint(attempt_number)},
  });
  return append_event(state, input.event_id, "STEP_COMPLETED", payload, input.now_ms);
}

Status resolve_step(State& state, const ResolveStepInput& input) {
  if (auto status = require_fence(state.run, input.fence); !status.ok()) {
    return status;
  }
  if (input.step_to != StepStatus::Failed && input.step_to != StepStatus::RetryScheduled &&
      input.step_to != StepStatus::Cancelled) {
    return state_error("Step resolution cannot target that status.");
  }
  Step* step = find_step(state, input.step_key);
  if (step == nullptr) {
    return Status::fail(Code::NotFound, "Step \"" + input.step_key + "\" does not exist.");
  }
  if (step->status != StepStatus::Running) {
    return state_error("Step \"" + input.step_key + "\" is " + std::string(to_string(step->status)) +
                       ", not RUNNING.");
  }
  const Attempt* attempt = find_attempt(state, input.attempt_id);
  if (attempt == nullptr || attempt->step_key != step->step_key || attempt->status != AttemptStatus::Started) {
    return state_error("Attempt is not the open attempt for step \"" + input.step_key + "\".");
  }
  if (!can_transition(step->status, input.step_to)) {
    return state_error("Step transition is not legal.");
  }
  step->status = input.step_to;
  if (input.error_json.has_value()) {
    step->error_json = input.error_json;
  }
  step->next_attempt_at = input.step_to == StepStatus::RetryScheduled ? input.next_attempt_at : std::nullopt;
  step->updated_at = input.now_ms;
  close_attempt(state, input.attempt_id, input.attempt_status, input.now_ms, input.error_json);
  state.run.updated_at = input.now_ms;
  const std::string event_type =
      input.step_to == StepStatus::RetryScheduled ? "STEP_RETRY_SCHEDULED" : "STEP_FAILED";
  const std::string payload = object_payload({
      {"stepKey", jstring(input.step_key)},
      {"effects", jstring(to_string(step->effect_type))},
      {"reason", jstring(input.reason)},
      {"attemptStatus", jstring(to_string(input.attempt_status))},
  });
  if (auto status = append_event(state, input.event_id, event_type, payload, input.now_ms); !status.ok()) {
    return status;
  }
  if (input.run_to.has_value()) {
    if (!can_transition(state.run.status, *input.run_to)) {
      return state_error("Workflow transition is not legal.");
    }
    state.run.status = *input.run_to;
    if (input.error_json.has_value()) {
      state.run.error_json = input.error_json;
    }
    state.run.updated_at = input.now_ms;
    const std::string run_payload = object_payload({
        {"stepKey", jstring(input.step_key)},
        {"code", jstring("transient_execution_failure")},
    });
    const char* run_type = *input.run_to == WorkflowStatus::Failed ? "WORKFLOW_FAILED" : "WORKFLOW_STARTED";
    return append_event(state, input.run_event_id, run_type, run_payload, input.now_ms);
  }
  return Status::success();
}

Status mark_unknown(State& state, const MarkUnknownInput& input) {
  if (auto status = require_fence(state.run, input.fence); !status.ok()) {
    return status;
  }
  Step* step = find_step(state, input.step_key);
  if (step == nullptr) {
    return Status::fail(Code::NotFound, "Step \"" + input.step_key + "\" does not exist.");
  }
  if (step->status != StepStatus::Running && step->status != StepStatus::WaitingRemote) {
    return state_error(std::string("Cannot mark step \"") + input.step_key + "\" unknown from " +
                       to_string(step->status) + ".");
  }
  if (!can_transition(step->status, StepStatus::UnknownOutcome)) {
    return state_error("Step transition is not legal.");
  }
  const Attempt* attempt = nullptr;
  if (input.attempt_id.has_value()) {
    attempt = find_attempt(state, *input.attempt_id);
    if (attempt == nullptr || attempt->step_key != step->step_key || attempt->status != AttemptStatus::Started) {
      return state_error("Attempt is not the open attempt for step \"" + input.step_key + "\".");
    }
  } else {
    attempt = latest_open_attempt(state, input.step_key);
  }
  const std::string error_json = object_payload({
      {"code", jstring("unknown_operation_outcome")},
      {"message", jstring(input.message)},
      {"retryable", [&] {
         Json value;
         value.kind = Json::Kind::Bool;
         value.boolean = false;
         return value;
       }()},
  });
  step->status = StepStatus::UnknownOutcome;
  step->error_json = error_json;
  step->updated_at = input.now_ms;
  if (attempt != nullptr) {
    close_attempt(state, attempt->attempt_id, AttemptStatus::Interrupted, input.now_ms, error_json);
  }
  state.run.updated_at = input.now_ms;
  const std::string step_payload = object_payload({
      {"stepKey", jstring(input.step_key)},
      {"effects", jstring(to_string(step->effect_type))},
      {"reason", jstring(input.reason)},
  });
  if (auto status = append_event(state, input.step_event_id, "STEP_OUTCOME_UNKNOWN", step_payload, input.now_ms);
      !status.ok()) {
    return status;
  }
  if (state.run.status != WorkflowStatus::Blocked) {
    if (!can_transition(state.run.status, WorkflowStatus::Blocked)) {
      return state_error("Workflow transition is not legal.");
    }
    state.run.status = WorkflowStatus::Blocked;
    state.run.blocked_reason = error_json;
    state.run.updated_at = input.now_ms;
    const std::string run_payload = object_payload({
        {"stepKey", jstring(input.step_key)},
        {"code", jstring("unknown_operation_outcome")},
    });
    return append_event(state, input.run_event_id, "WORKFLOW_BLOCKED", run_payload, input.now_ms);
  }
  return Status::success();
}

Status reconcile_step(State& state, const ReconcileInput& input) {
  if (auto status = require_fence(state.run, input.fence); !status.ok()) {
    return status;
  }
  Step* step = find_step(state, input.step_key);
  if (step == nullptr) {
    return Status::fail(Code::NotFound, "Step \"" + input.step_key + "\" does not exist.");
  }
  if (step->status != StepStatus::UnknownOutcome && step->status != StepStatus::WaitingRemote) {
    return state_error("Only UNKNOWN_OUTCOME steps can be reconciled. \"" + input.step_key + "\" is " +
                       to_string(step->status) + ".");
  }
  const std::string event_payload = object_payload({
      {"resolution", jstring(input.resolution)},
      {"stepKey", jstring(input.step_key)},
  });
  if (input.resolution == "retry") {
    if (!can_transition(step->status, StepStatus::RetryScheduled)) {
      return state_error("Step transition is not legal.");
    }
    step->status = StepStatus::RetryScheduled;
    step->next_attempt_at = input.now_ms;
    step->updated_at = input.now_ms;
    state.run.updated_at = input.now_ms;
    if (auto status = append_event(state, input.event_id, "STEP_RECONCILED", event_payload, input.now_ms);
        !status.ok()) {
      return status;
    }
    if (state.run.status == WorkflowStatus::Blocked) {
      state.run.status = WorkflowStatus::Running;
      state.run.blocked_reason = std::nullopt;
      state.run.updated_at = input.now_ms;
      return append_event(state, input.run_event_id, "WORKFLOW_STARTED", event_payload, input.now_ms);
    }
    return Status::success();
  }
  if (input.resolution == "complete") {
    if (!input.output_json.has_value()) {
      return storage_error("Storage command is missing outputJson.");
    }
    if (!can_transition(step->status, StepStatus::Completed)) {
      return state_error("Step transition is not legal.");
    }
    step->status = StepStatus::Completed;
    step->output_json = input.output_json;
    step->error_json = std::nullopt;
    step->updated_at = input.now_ms;
    state.run.updated_at = input.now_ms;
    if (auto status = append_event(state, input.event_id, "STEP_RECONCILED", event_payload, input.now_ms);
        !status.ok()) {
      return status;
    }
    if (state.run.status == WorkflowStatus::Blocked) {
      state.run.status = WorkflowStatus::Running;
      state.run.blocked_reason = std::nullopt;
      state.run.updated_at = input.now_ms;
      return append_event(state, input.run_event_id, "WORKFLOW_STARTED", event_payload, input.now_ms);
    }
    return Status::success();
  }
  if (input.resolution != "fail") {
    return Status::fail(Code::InvalidArgument, "Reconcile resolution must be retry, complete, or fail.");
  }
  if (!can_transition(step->status, StepStatus::Failed)) {
    return state_error("Step transition is not legal.");
  }
  const std::string error_json = object_payload({
      {"code", jstring("permanent_execution_failure")},
      {"message", jstring(input.message.empty() ? "Reconciled as failed." : input.message)},
      {"retryable", [&] {
         Json value;
         value.kind = Json::Kind::Bool;
         value.boolean = false;
         return value;
       }()},
  });
  step->status = StepStatus::Failed;
  step->error_json = error_json;
  step->updated_at = input.now_ms;
  state.run.updated_at = input.now_ms;
  if (auto status = append_event(state, input.event_id, "STEP_RECONCILED", event_payload, input.now_ms); !status.ok()) {
    return status;
  }
  if (!is_terminal(state.run.status)) {
    if (!can_transition(state.run.status, WorkflowStatus::Failed)) {
      return state_error("Workflow transition is not legal.");
    }
    state.run.status = WorkflowStatus::Failed;
    state.run.error_json = error_json;
    state.run.blocked_reason = std::nullopt;
    state.run.updated_at = input.now_ms;
    return append_event(state, input.run_event_id, "WORKFLOW_FAILED", event_payload, input.now_ms);
  }
  return Status::success();
}

OutboxOutcome insert_outbox(State& state, const OutboxInput& input) {
  OutboxOutcome outcome;
  if (auto status = require_fence(state.run, input.fence); !status.ok()) {
    outcome.status = status;
    return outcome;
  }
  if (input.message.run_id != state.run.run_id) {
    outcome.status = storage_error("Outbox message run id does not match the workflow run.");
    return outcome;
  }
  for (const auto& existing : state.outbox) {
    if (existing.operation_id == input.message.operation_id) {
      if (existing.payload_json != input.message.payload_json || existing.step_key != input.message.step_key) {
        outcome.status = state_error("Operation " + input.message.operation_id +
                                     " is already queued with a different payload.");
        return outcome;
      }
      outcome.deduplicated = true;
      outcome.status = Status::success();
      return outcome;
    }
  }
  state.outbox.push_back(input.message);
  outcome.deduplicated = false;
  outcome.status = Status::success();
  return outcome;
}

Status append_protocol_event(State& state, std::string event_id, std::string type, std::string payload, int64_t now_ms) {
  return append_event(state, std::move(event_id), std::move(type), std::move(payload), now_ms);
}

namespace {

Delegation* find_delegation(State& state, std::string_view step_key) {
  for (auto& row : state.delegations) {
    if (row.step_key == step_key) {
      return &row;
    }
  }
  return nullptr;
}

void set_outbox_status(State& state, std::string_view operation_id, OutboxStatus status, int64_t now_ms) {
  for (auto& message : state.outbox) {
    if (message.operation_id == operation_id) {
      message.status = status;
      message.updated_at = now_ms;
    }
  }
}

std::string delegation_error(const std::string& code, const std::string& message) {
  return object_payload({
      {"code", jstring(code)},
      {"message", jstring(message)},
      {"retryable", [&] {
         Json value;
         value.kind = Json::Kind::Bool;
         value.boolean = false;
         return value;
       }()},
  });
}

}  // namespace

Status park_delegation(State& state, const ParkDelegationInput& input) {
  if (auto status = require_fence(state.run, input.fence); !status.ok()) {
    return status;
  }
  if (auto status = require_mutable(state.run.status); !status.ok()) {
    return status;
  }
  Step* step = find_step(state, input.step_key);
  if (step == nullptr) {
    return Status::fail(Code::NotFound, "Step \"" + input.step_key + "\" does not exist.");
  }
  if (step->status != StepStatus::Running) {
    return state_error("Remote step \"" + input.step_key + "\" is not running.");
  }
  if (!can_transition(step->status, StepStatus::WaitingRemote)) {
    return state_error("Step transition is not legal.");
  }
  const Attempt* attempt = find_attempt(state, input.attempt_id);
  if (attempt == nullptr || attempt->step_key != step->step_key || attempt->status != AttemptStatus::Started) {
    return state_error("Attempt is not the open attempt for step \"" + input.step_key + "\".");
  }
  Delegation* row = find_delegation(state, input.step_key);
  if (row == nullptr) {
    return state_error("Remote delegation is missing.");
  }
  const bool first_task = input.task_id.has_value() && !row->task_id.has_value();
  step->status = StepStatus::WaitingRemote;
  step->next_attempt_at = input.next_attempt_at;
  step->updated_at = input.now_ms;
  close_attempt(state, input.attempt_id, AttemptStatus::Completed, input.now_ms, std::nullopt);
  row->state = input.delegation_state;
  if (input.task_id.has_value()) {
    row->task_id = input.task_id;
  }
  row->poll_inflight = false;
  row->inflight_action.clear();
  row->updated_at = input.now_ms;
  if (row->task_id.has_value()) {
    set_outbox_status(state, row->operation_id, OutboxStatus::Accepted, input.now_ms);
  }
  state.run.updated_at = input.now_ms;
  if (first_task) {
    const std::string payload = object_payload({
        {"operationId", jstring(row->operation_id)},
        {"remoteAgent", jstring(row->remote_agent)},
        {"stepKey", jstring(row->step_key)},
        {"taskId", jstring(*row->task_id)},
    });
    return append_event(state, input.event_id, "REMOTE_DISPATCH_ACCEPTED", payload, input.now_ms);
  }
  return Status::success();
}

Status fail_delegation(State& state, const FailDelegationInput& input) {
  if (auto status = require_fence(state.run, input.fence); !status.ok()) {
    return status;
  }
  if (auto status = require_mutable(state.run.status); !status.ok()) {
    return status;
  }
  Step* step = find_step(state, input.step_key);
  if (step == nullptr) {
    return Status::fail(Code::NotFound, "Step \"" + input.step_key + "\" does not exist.");
  }
  if (!can_transition(step->status, StepStatus::Failed)) {
    return state_error("Step transition is not legal.");
  }
  if (const Attempt* attempt = latest_open_attempt(state, input.step_key); attempt != nullptr) {
    close_attempt(state, attempt->attempt_id, AttemptStatus::Failed, input.now_ms, std::nullopt);
  }
  const std::string error_json = delegation_error(input.code, input.message);
  step->status = StepStatus::Failed;
  step->error_json = error_json;
  step->next_attempt_at = std::nullopt;
  step->updated_at = input.now_ms;
  if (Delegation* row = find_delegation(state, input.step_key); row != nullptr) {
    row->state = DelegationState::Failed;
    row->poll_inflight = false;
    row->inflight_action.clear();
    row->updated_at = input.now_ms;
    set_outbox_status(state, row->operation_id, OutboxStatus::Failed, input.now_ms);
  }
  state.run.updated_at = input.now_ms;
  const std::string step_payload = object_payload({
      {"code", jstring(input.code)},
      {"stepKey", jstring(input.step_key)},
  });
  if (auto status = append_event(state, input.event_id, "STEP_FAILED", step_payload, input.now_ms); !status.ok()) {
    return status;
  }
  if (!can_transition(state.run.status, WorkflowStatus::Failed)) {
    return state_error("Workflow transition is not legal.");
  }
  state.run.status = WorkflowStatus::Failed;
  state.run.error_json = error_json;
  state.run.blocked_reason = std::nullopt;
  state.run.updated_at = input.now_ms;
  return append_event(state, input.run_event_id, "WORKFLOW_FAILED", step_payload, input.now_ms);
}

Status cancel_delegation_step(State& state, const CancelDelegationInput& input) {
  if (auto status = require_fence(state.run, input.fence); !status.ok()) {
    return status;
  }
  Step* step = find_step(state, input.step_key);
  if (step == nullptr) {
    return Status::fail(Code::NotFound, "Step \"" + input.step_key + "\" does not exist.");
  }
  if (step->status != StepStatus::Cancelled) {
    if (!can_transition(step->status, StepStatus::Cancelled)) {
      return state_error("Step transition is not legal.");
    }
    if (const Attempt* attempt = latest_open_attempt(state, input.step_key); attempt != nullptr) {
      close_attempt(state, attempt->attempt_id, AttemptStatus::Cancelled, input.now_ms, std::nullopt);
    }
    step->status = StepStatus::Cancelled;
    step->error_json = delegation_error("cancelled_execution", input.message);
    step->next_attempt_at = std::nullopt;
    step->updated_at = input.now_ms;
  }
  if (Delegation* row = find_delegation(state, input.step_key); row != nullptr) {
    row->state = DelegationState::Cancelled;
    row->poll_inflight = false;
    row->inflight_action.clear();
    row->updated_at = input.now_ms;
    set_outbox_status(state, row->operation_id, OutboxStatus::Failed, input.now_ms);
  }
  state.run.updated_at = input.now_ms;
  if (is_terminal(state.run.status)) {
    return Status::success();
  }
  if (!can_transition(state.run.status, WorkflowStatus::Cancelled)) {
    return state_error("Workflow transition is not legal.");
  }
  state.run.status = WorkflowStatus::Cancelled;
  state.run.error_json = delegation_error("cancelled_execution", input.message);
  state.run.blocked_reason = std::nullopt;
  state.run.cancel_requested = true;
  state.run.updated_at = input.now_ms;
  const std::string payload = object_payload({
      {"message", jstring(input.message)},
      {"stepKey", jstring(input.step_key)},
  });
  return append_event(state, input.run_event_id, "WORKFLOW_CANCELLED", payload, input.now_ms);
}

Status block_remote_input(State& state, const BlockRemoteInput& input) {
  if (auto status = require_fence(state.run, input.fence); !status.ok()) {
    return status;
  }
  if (auto status = require_mutable(state.run.status); !status.ok()) {
    return status;
  }
  Step* step = find_step(state, input.step_key);
  if (step == nullptr) {
    return Status::fail(Code::NotFound, "Step \"" + input.step_key + "\" does not exist.");
  }
  Delegation* row = find_delegation(state, input.step_key);
  if (row == nullptr) {
    return state_error("Remote delegation is missing.");
  }
  const bool first_task = input.task_id.has_value() && !row->task_id.has_value();
  if (step->status == StepStatus::Running) {
    if (!can_transition(step->status, StepStatus::WaitingRemote)) {
      return state_error("Step transition is not legal.");
    }
    const Attempt* attempt = find_attempt(state, input.attempt_id);
    if (attempt == nullptr || attempt->step_key != step->step_key || attempt->status != AttemptStatus::Started) {
      return state_error("Attempt is not the open attempt for step \"" + input.step_key + "\".");
    }
    close_attempt(state, input.attempt_id, AttemptStatus::Completed, input.now_ms, std::nullopt);
    step->status = StepStatus::WaitingRemote;
  }
  if (step->status != StepStatus::WaitingRemote) {
    return state_error("Remote input cannot be recorded from " + std::string(to_string(step->status)) + ".");
  }
  step->next_attempt_at = std::nullopt;
  step->updated_at = input.now_ms;
  if (input.task_id.has_value()) {
    row->task_id = input.task_id;
  }
  row->state = DelegationState::InputRequired;
  row->poll_inflight = false;
  row->inflight_action.clear();
  row->updated_at = input.now_ms;
  if (row->task_id.has_value()) {
    set_outbox_status(state, row->operation_id, OutboxStatus::Accepted, input.now_ms);
  }
  state.run.updated_at = input.now_ms;
  if (first_task) {
    const std::string accepted = object_payload({
        {"operationId", jstring(row->operation_id)},
        {"remoteAgent", jstring(row->remote_agent)},
        {"stepKey", jstring(row->step_key)},
        {"taskId", jstring(*row->task_id)},
    });
    if (auto status = append_event(state, input.accepted_event_id, "REMOTE_DISPATCH_ACCEPTED", accepted, input.now_ms);
        !status.ok()) {
      return status;
    }
  }
  if (!can_transition(state.run.status, WorkflowStatus::Blocked)) {
    return state_error("Workflow transition is not legal.");
  }
  state.run.status = WorkflowStatus::Blocked;
  state.run.blocked_reason = delegation_error("remote_input_required", input.message);
  state.run.updated_at = input.now_ms;
  const std::string blocked = object_payload({
      {"code", jstring("remote_input_required")},
      {"stepKey", jstring(input.step_key)},
  });
  return append_event(state, input.run_event_id, "WORKFLOW_BLOCKED", blocked, input.now_ms);
}

Status complete_delegation(State& state, const CompleteDelegationInput& input) {
  if (auto status = require_fence(state.run, input.fence); !status.ok()) {
    return status;
  }
  if (auto status = require_mutable(state.run.status); !status.ok()) {
    return status;
  }
  Step* step = find_step(state, input.step_key);
  if (step == nullptr) {
    return Status::fail(Code::NotFound, "Step \"" + input.step_key + "\" does not exist.");
  }
  Delegation* row = find_delegation(state, input.step_key);
  if (row == nullptr) {
    return state_error("Remote delegation is missing.");
  }
  if (!can_transition(step->status, StepStatus::Completed)) {
    return state_error("Step transition is not legal.");
  }
  if (step->status == StepStatus::Running) {
    const Attempt* attempt = find_attempt(state, input.attempt_id);
    if (attempt == nullptr || attempt->step_key != step->step_key || attempt->status != AttemptStatus::Started) {
      return state_error("Attempt is not the open attempt for step \"" + input.step_key + "\".");
    }
    close_attempt(state, input.attempt_id, AttemptStatus::Completed, input.now_ms, std::nullopt);
  }
  step->status = StepStatus::Completed;
  step->output_json = input.output_json;
  step->error_json = std::nullopt;
  step->next_attempt_at = std::nullopt;
  step->updated_at = input.now_ms;
  row->state = DelegationState::Completed;
  row->result_json = input.result_json;
  row->poll_inflight = false;
  row->inflight_action.clear();
  row->updated_at = input.now_ms;
  set_outbox_status(state, row->operation_id, OutboxStatus::Delivered, input.now_ms);
  state.run.updated_at = input.now_ms;
  const std::string completed = object_payload({
      {"effects", jstring(to_string(step->effect_type))},
      {"execution", jstring(to_string(step->execution_target))},
      {"stepKey", jstring(step->step_key)},
  });
  if (auto status = append_event(state, input.event_id, "STEP_COMPLETED", completed, input.now_ms); !status.ok()) {
    return status;
  }
  std::vector<std::pair<std::string, Json>> fields = {
      {"operationId", jstring(row->operation_id)},
      {"remoteAgent", jstring(row->remote_agent)},
      {"stepKey", jstring(row->step_key)},
  };
  if (row->task_id.has_value()) {
    fields.push_back({"taskId", jstring(*row->task_id)});
  }
  return append_event(state, input.result_event_id, "REMOTE_RESULT_RECEIVED", object_payload(fields), input.now_ms);
}

}  // namespace larkx
