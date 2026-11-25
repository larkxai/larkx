#include "larkx/core.hpp"

#include <array>

namespace larkx {
namespace {

template <typename T, size_t N>
bool parse_token(std::string_view text, const std::array<std::pair<std::string_view, T>, N>& table, T& out) {
  for (const auto& entry : table) {
    if (entry.first == text) {
      out = entry.second;
      return true;
    }
  }
  return false;
}

}  // namespace

const char* to_string(WorkflowStatus status) {
  switch (status) {
    case WorkflowStatus::Created:
      return "CREATED";
    case WorkflowStatus::Running:
      return "RUNNING";
    case WorkflowStatus::Waiting:
      return "WAITING";
    case WorkflowStatus::Recovering:
      return "RECOVERING";
    case WorkflowStatus::Completed:
      return "COMPLETED";
    case WorkflowStatus::Failed:
      return "FAILED";
    case WorkflowStatus::Cancelled:
      return "CANCELLED";
    case WorkflowStatus::Blocked:
      return "BLOCKED";
  }
  return "";
}

const char* to_string(StepStatus status) {
  switch (status) {
    case StepStatus::Pending:
      return "PENDING";
    case StepStatus::Running:
      return "RUNNING";
    case StepStatus::WaitingRemote:
      return "WAITING_REMOTE";
    case StepStatus::RetryScheduled:
      return "RETRY_SCHEDULED";
    case StepStatus::Completed:
      return "COMPLETED";
    case StepStatus::Failed:
      return "FAILED";
    case StepStatus::UnknownOutcome:
      return "UNKNOWN_OUTCOME";
    case StepStatus::Cancelled:
      return "CANCELLED";
  }
  return "";
}

const char* to_string(AttemptStatus status) {
  switch (status) {
    case AttemptStatus::Started:
      return "STARTED";
    case AttemptStatus::Completed:
      return "COMPLETED";
    case AttemptStatus::Failed:
      return "FAILED";
    case AttemptStatus::Interrupted:
      return "INTERRUPTED";
    case AttemptStatus::Cancelled:
      return "CANCELLED";
  }
  return "";
}

const char* to_string(EffectType effect) {
  switch (effect) {
    case EffectType::Pure:
      return "pure";
    case EffectType::Idempotent:
      return "idempotent";
    case EffectType::NonIdempotent:
      return "non-idempotent";
  }
  return "";
}

const char* to_string(ExecutionTarget target) {
  switch (target) {
    case ExecutionTarget::Local:
      return "local";
    case ExecutionTarget::Cloud:
      return "cloud";
    case ExecutionTarget::Hybrid:
      return "hybrid";
  }
  return "";
}

const char* to_string(SelectedTarget target) {
  switch (target) {
    case SelectedTarget::Local:
      return "local";
    case SelectedTarget::Cloud:
      return "cloud";
  }
  return "";
}

const char* to_string(DataPolicy policy) {
  switch (policy) {
    case DataPolicy::DeviceOnly:
      return "device-only";
    case DataPolicy::CloudAllowed:
      return "cloud-allowed";
  }
  return "";
}

const char* to_string(OutboxStatus status) {
  switch (status) {
    case OutboxStatus::Pending:
      return "pending";
    case OutboxStatus::Accepted:
      return "accepted";
    case OutboxStatus::Delivered:
      return "delivered";
    case OutboxStatus::Failed:
      return "failed";
  }
  return "";
}

const char* to_string(DelegationState state) {
  switch (state) {
    case DelegationState::Queued:
      return "QUEUED";
    case DelegationState::Submitting:
      return "SUBMITTING";
    case DelegationState::Accepted:
      return "ACCEPTED";
    case DelegationState::Working:
      return "WORKING";
    case DelegationState::InputRequired:
      return "INPUT_REQUIRED";
    case DelegationState::Completed:
      return "COMPLETED";
    case DelegationState::Failed:
      return "FAILED";
    case DelegationState::Cancelled:
      return "CANCELLED";
    case DelegationState::UnknownOutcome:
      return "UNKNOWN_OUTCOME";
  }
  return "";
}

bool parse_workflow_status(std::string_view text, WorkflowStatus& out) {
  constexpr std::array<std::pair<std::string_view, WorkflowStatus>, 8> table{{
      {"CREATED", WorkflowStatus::Created},
      {"RUNNING", WorkflowStatus::Running},
      {"WAITING", WorkflowStatus::Waiting},
      {"RECOVERING", WorkflowStatus::Recovering},
      {"COMPLETED", WorkflowStatus::Completed},
      {"FAILED", WorkflowStatus::Failed},
      {"CANCELLED", WorkflowStatus::Cancelled},
      {"BLOCKED", WorkflowStatus::Blocked},
  }};
  return parse_token(text, table, out);
}

bool parse_step_status(std::string_view text, StepStatus& out) {
  constexpr std::array<std::pair<std::string_view, StepStatus>, 8> table{{
      {"PENDING", StepStatus::Pending},
      {"RUNNING", StepStatus::Running},
      {"WAITING_REMOTE", StepStatus::WaitingRemote},
      {"RETRY_SCHEDULED", StepStatus::RetryScheduled},
      {"COMPLETED", StepStatus::Completed},
      {"FAILED", StepStatus::Failed},
      {"UNKNOWN_OUTCOME", StepStatus::UnknownOutcome},
      {"CANCELLED", StepStatus::Cancelled},
  }};
  return parse_token(text, table, out);
}

bool parse_attempt_status(std::string_view text, AttemptStatus& out) {
  constexpr std::array<std::pair<std::string_view, AttemptStatus>, 5> table{{
      {"STARTED", AttemptStatus::Started},
      {"COMPLETED", AttemptStatus::Completed},
      {"FAILED", AttemptStatus::Failed},
      {"INTERRUPTED", AttemptStatus::Interrupted},
      {"CANCELLED", AttemptStatus::Cancelled},
  }};
  return parse_token(text, table, out);
}

bool parse_effect(std::string_view text, EffectType& out) {
  constexpr std::array<std::pair<std::string_view, EffectType>, 3> table{{
      {"pure", EffectType::Pure},
      {"idempotent", EffectType::Idempotent},
      {"non-idempotent", EffectType::NonIdempotent},
  }};
  return parse_token(text, table, out);
}

bool parse_execution_target(std::string_view text, ExecutionTarget& out) {
  constexpr std::array<std::pair<std::string_view, ExecutionTarget>, 3> table{{
      {"local", ExecutionTarget::Local},
      {"cloud", ExecutionTarget::Cloud},
      {"hybrid", ExecutionTarget::Hybrid},
  }};
  return parse_token(text, table, out);
}

bool parse_selected_target(std::string_view text, SelectedTarget& out) {
  constexpr std::array<std::pair<std::string_view, SelectedTarget>, 2> table{{
      {"local", SelectedTarget::Local},
      {"cloud", SelectedTarget::Cloud},
  }};
  return parse_token(text, table, out);
}

bool parse_data_policy(std::string_view text, DataPolicy& out) {
  constexpr std::array<std::pair<std::string_view, DataPolicy>, 2> table{{
      {"device-only", DataPolicy::DeviceOnly},
      {"cloud-allowed", DataPolicy::CloudAllowed},
  }};
  return parse_token(text, table, out);
}

bool parse_outbox_status(std::string_view text, OutboxStatus& out) {
  constexpr std::array<std::pair<std::string_view, OutboxStatus>, 4> table{{
      {"pending", OutboxStatus::Pending},
      {"accepted", OutboxStatus::Accepted},
      {"delivered", OutboxStatus::Delivered},
      {"failed", OutboxStatus::Failed},
  }};
  return parse_token(text, table, out);
}

bool parse_delegation_state(std::string_view text, DelegationState& out) {
  constexpr std::array<std::pair<std::string_view, DelegationState>, 9> table{{
      {"QUEUED", DelegationState::Queued},
      {"SUBMITTING", DelegationState::Submitting},
      {"ACCEPTED", DelegationState::Accepted},
      {"WORKING", DelegationState::Working},
      {"INPUT_REQUIRED", DelegationState::InputRequired},
      {"COMPLETED", DelegationState::Completed},
      {"FAILED", DelegationState::Failed},
      {"CANCELLED", DelegationState::Cancelled},
      {"UNKNOWN_OUTCOME", DelegationState::UnknownOutcome},
  }};
  return parse_token(text, table, out);
}

bool parse_event_type(std::string_view text) {
  constexpr std::array<std::string_view, 17> types{
      "WORKFLOW_CREATED",     "WORKFLOW_STARTED",       "WORKFLOW_RECOVERED",
      "WORKFLOW_WAITING",     "WORKFLOW_BLOCKED",       "STEP_STARTED",
      "STEP_COMPLETED",       "STEP_FAILED",            "STEP_RETRY_SCHEDULED",
      "STEP_OUTCOME_UNKNOWN", "STEP_RECONCILED",        "REMOTE_DISPATCH_QUEUED",
      "REMOTE_DISPATCH_ACCEPTED", "REMOTE_RESULT_RECEIVED", "WORKFLOW_COMPLETED",
      "WORKFLOW_FAILED",      "WORKFLOW_CANCELLED",
  };
  for (const auto type : types) {
    if (type == text) {
      return true;
    }
  }
  return false;
}

bool parse_egress_destination(std::string_view text, EgressDestination& out) {
  constexpr std::array<std::pair<std::string_view, EgressDestination>, 5> table{{
      {"local", EgressDestination::Local},
      {"cloud-model", EgressDestination::CloudModel},
      {"remote-tool", EgressDestination::RemoteTool},
      {"remote-agent", EgressDestination::RemoteAgent},
      {"telemetry", EgressDestination::Telemetry},
  }};
  return parse_token(text, table, out);
}

bool is_terminal(WorkflowStatus status) {
  return status == WorkflowStatus::Completed || status == WorkflowStatus::Failed ||
         status == WorkflowStatus::Cancelled;
}

bool can_transition(WorkflowStatus from, WorkflowStatus to) {
  switch (from) {
    case WorkflowStatus::Created:
      return to == WorkflowStatus::Running || to == WorkflowStatus::Cancelled ||
             to == WorkflowStatus::Blocked;
    case WorkflowStatus::Running:
      return to == WorkflowStatus::Waiting || to == WorkflowStatus::Recovering ||
             to == WorkflowStatus::Completed || to == WorkflowStatus::Failed ||
             to == WorkflowStatus::Cancelled || to == WorkflowStatus::Blocked;
    case WorkflowStatus::Waiting:
      return to == WorkflowStatus::Running || to == WorkflowStatus::Recovering ||
             to == WorkflowStatus::Cancelled || to == WorkflowStatus::Failed ||
             to == WorkflowStatus::Blocked;
    case WorkflowStatus::Recovering:
      return to == WorkflowStatus::Running || to == WorkflowStatus::Waiting ||
             to == WorkflowStatus::Completed || to == WorkflowStatus::Failed ||
             to == WorkflowStatus::Cancelled || to == WorkflowStatus::Blocked;
    case WorkflowStatus::Completed:
    case WorkflowStatus::Failed:
    case WorkflowStatus::Cancelled:
      return false;
    case WorkflowStatus::Blocked:
      return to == WorkflowStatus::Running || to == WorkflowStatus::Recovering ||
             to == WorkflowStatus::Failed || to == WorkflowStatus::Cancelled;
  }
  return false;
}

bool can_transition(StepStatus from, StepStatus to) {
  switch (from) {
    case StepStatus::Pending:
      return to == StepStatus::Running || to == StepStatus::Cancelled;
    case StepStatus::Running:
      return to == StepStatus::Completed || to == StepStatus::Failed ||
             to == StepStatus::WaitingRemote || to == StepStatus::RetryScheduled ||
             to == StepStatus::UnknownOutcome || to == StepStatus::Cancelled;
    case StepStatus::WaitingRemote:
      return to == StepStatus::Completed || to == StepStatus::Failed ||
             to == StepStatus::RetryScheduled || to == StepStatus::UnknownOutcome ||
             to == StepStatus::Cancelled;
    case StepStatus::RetryScheduled:
      return to == StepStatus::Running || to == StepStatus::Cancelled || to == StepStatus::Failed;
    case StepStatus::Completed:
    case StepStatus::Failed:
    case StepStatus::Cancelled:
      return false;
    case StepStatus::UnknownOutcome:
      return to == StepStatus::RetryScheduled || to == StepStatus::Completed ||
             to == StepStatus::Failed || to == StepStatus::Cancelled;
  }
  return false;
}

Status interrupted_resolution(EffectType effect, InterruptResolution& out) {
  if (effect == EffectType::NonIdempotent) {
    out = InterruptResolution::UnknownOutcome;
    return Status::success();
  }
  out = InterruptResolution::Retry;
  return Status::success();
}

bool egress_allowed(DataPolicy policy, EgressDestination destination) {
  if (destination == EgressDestination::Local) {
    return true;
  }
  if (destination == EgressDestination::Telemetry) {
    return false;
  }
  return policy == DataPolicy::CloudAllowed;
}

}  // namespace larkx
