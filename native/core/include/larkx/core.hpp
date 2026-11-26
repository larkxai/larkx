#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace larkx {

enum class Code {
  Ok,
  InvalidArgument,
  State,
  Ownership,
  Storage,
  NotFound,
  Serialization,
  Capacity
};

struct Status {
  Code code = Code::Ok;
  std::string message;

  bool ok() const { return code == Code::Ok; }
  static Status success() { return {}; }
  static Status fail(Code code, std::string message) { return {code, std::move(message)}; }
};

enum class WorkflowStatus {
  Created,
  Running,
  Waiting,
  Recovering,
  Completed,
  Failed,
  Cancelled,
  Blocked
};

enum class StepStatus {
  Pending,
  Running,
  WaitingRemote,
  RetryScheduled,
  Completed,
  Failed,
  UnknownOutcome,
  Cancelled
};

enum class AttemptStatus { Started, Completed, Failed, Interrupted, Cancelled };

enum class EffectType { Pure, Idempotent, NonIdempotent };

enum class ExecutionTarget { Local, Cloud, Hybrid };

enum class SelectedTarget { Local, Cloud };

enum class DataPolicy { DeviceOnly, CloudAllowed };

enum class OutboxStatus { Pending, Accepted, Delivered, Failed };

enum class DelegationState {
  Queued,
  Submitting,
  Accepted,
  Working,
  InputRequired,
  Completed,
  Failed,
  Cancelled,
  UnknownOutcome
};

struct DelegationCapabilities {
  bool dedupe = false;
  bool lookup = false;
  bool durable_task = false;
  bool poll = false;
  bool cancel = false;
  bool persistent = false;
};

const char* to_string(WorkflowStatus status);
const char* to_string(StepStatus status);
const char* to_string(AttemptStatus status);
const char* to_string(EffectType effect);
const char* to_string(ExecutionTarget target);
const char* to_string(SelectedTarget target);
const char* to_string(DataPolicy policy);
const char* to_string(OutboxStatus status);
const char* to_string(DelegationState state);

bool parse_workflow_status(std::string_view text, WorkflowStatus& out);
bool parse_step_status(std::string_view text, StepStatus& out);
bool parse_attempt_status(std::string_view text, AttemptStatus& out);
bool parse_effect(std::string_view text, EffectType& out);
bool parse_execution_target(std::string_view text, ExecutionTarget& out);
bool parse_selected_target(std::string_view text, SelectedTarget& out);
bool parse_data_policy(std::string_view text, DataPolicy& out);
bool parse_outbox_status(std::string_view text, OutboxStatus& out);
bool parse_delegation_state(std::string_view text, DelegationState& out);
bool parse_event_type(std::string_view text);

bool is_terminal(WorkflowStatus status);
bool can_transition(WorkflowStatus from, WorkflowStatus to);
bool can_transition(StepStatus from, StepStatus to);

enum class InterruptResolution { Retry, UnknownOutcome };

Status interrupted_resolution(EffectType effect, InterruptResolution& out);

enum class EgressDestination { Local, CloudModel, RemoteTool, RemoteAgent, Telemetry };

bool parse_egress_destination(std::string_view text, EgressDestination& out);
bool egress_allowed(DataPolicy policy, EgressDestination destination);

struct Run {
  std::string run_id;
  std::string workflow_name;
  int32_t workflow_version = 0;
  std::string input_json;
  WorkflowStatus status = WorkflowStatus::Created;
  std::optional<std::string> output_json;
  std::optional<std::string> error_json;
  std::optional<std::string> blocked_reason;
  int64_t created_at = 0;
  int64_t updated_at = 0;
  std::optional<std::string> owner_id;
  int64_t ownership_epoch = 0;
  std::optional<int64_t> lease_expires_at;
  int32_t protocol_version = 1;
  DataPolicy data_policy = DataPolicy::DeviceOnly;
  bool cancel_requested = false;
};

struct Step {
  std::string run_id;
  std::string step_key;
  int32_t step_order = 0;
  StepStatus status = StepStatus::Running;
  ExecutionTarget execution_target = ExecutionTarget::Local;
  SelectedTarget selected_target = SelectedTarget::Local;
  EffectType effect_type = EffectType::Pure;
  int32_t attempt_count = 0;
  std::optional<std::string> input_json;
  std::optional<std::string> output_json;
  std::optional<std::string> error_json;
  std::string operation_id;
  std::string descriptor_json;
  std::optional<int64_t> next_attempt_at;
  int64_t created_at = 0;
  int64_t updated_at = 0;
};

struct Attempt {
  std::string attempt_id;
  std::string run_id;
  std::string step_key;
  int32_t attempt_number = 0;
  SelectedTarget execution_target = SelectedTarget::Local;
  AttemptStatus status = AttemptStatus::Started;
  int64_t started_at = 0;
  std::optional<int64_t> completed_at;
  std::optional<std::string> error_json;
};

struct Event {
  std::string event_id;
  std::string run_id;
  int64_t sequence = 0;
  std::string type;
  std::string payload_json;
  int64_t created_at = 0;
};

struct OutboxMessage {
  std::string message_id;
  std::string run_id;
  std::string step_key;
  std::string operation_id;
  std::string payload_json;
  OutboxStatus status = OutboxStatus::Pending;
  int32_t attempt_count = 1;
  std::optional<int64_t> next_attempt_at;
  int64_t created_at = 0;
  int64_t updated_at = 0;
};

struct Delegation {
  std::string run_id;
  std::string step_key;
  std::string operation_id;
  std::string remote_agent;
  std::string endpoint;
  std::string transport_id;
  std::string input_json;
  DelegationCapabilities capabilities;
  DelegationState state = DelegationState::Queued;
  std::optional<std::string> task_id;
  std::optional<std::string> result_json;
  int64_t poll_interval_ms = 1000;
  int32_t poll_epoch = 0;
  bool poll_inflight = false;
  int32_t poll_failures = 0;
  bool cancel_intent = false;
  std::string inflight_action;
  int64_t created_at = 0;
  int64_t updated_at = 0;
  std::optional<std::string> context_id;
  std::optional<std::string> remote_status;
  std::optional<std::string> continuation_json;
  std::optional<std::string> remote_identity;
  std::optional<std::string> remote_message;
};

struct State {
  Run run;
  std::vector<Step> steps;
  std::vector<Attempt> attempts;
  std::vector<Event> events;
  std::vector<OutboxMessage> outbox;
  std::vector<Delegation> delegations;
};

struct Fence {
  std::string owner_id;
  int64_t epoch = 0;
};

struct CreateRunInput {
  std::string run_id;
  std::string workflow_name;
  int32_t workflow_version = 0;
  std::string input_json;
  std::string data_policy;
  std::string event_id;
  int64_t now_ms = 0;
};

struct CreateRunOutcome {
  Status status;
  bool created = false;
  State state;
};

struct ClaimInput {
  std::string owner_id;
  int64_t now_ms = 0;
  int64_t lease_ms = 0;
  bool may_steal = false;
  bool exclusive = false;
};

struct ClaimOutcome {
  Status status;
  bool acquired = false;
  int64_t epoch = 0;
  std::string owner_id;
  std::string reason;
  std::optional<int64_t> lease_expires_at;
  State state;
};

CreateRunOutcome create_run(const State* existing, const CreateRunInput& input);
ClaimOutcome claim_ownership(const State& state, const ClaimInput& input);
Status renew_ownership(State& state, const Fence& fence, int64_t now_ms, int64_t lease_ms, bool& renewed);
Status release_ownership(State& state, const Fence& fence, int64_t now_ms, bool& released);
Status request_cancel(State& state, int64_t now_ms);

struct TransitionInput {
  Fence fence;
  int64_t now_ms = 0;
  WorkflowStatus to = WorkflowStatus::Running;
  std::string event_type;
  std::string event_id;
  std::string payload_json;
  std::optional<std::string> output_json;
  std::optional<std::string> error_json;
  std::optional<std::string> blocked_reason;
  bool set_output = false;
  bool set_error = false;
  bool set_blocked = false;
  bool honor_cancel = false;
};

Status transition_run(State& state, const TransitionInput& input);

struct BeginStepInput {
  Fence fence;
  int64_t now_ms = 0;
  std::string step_key;
  int32_t step_order = 0;
  ExecutionTarget execution_target = ExecutionTarget::Local;
  SelectedTarget selected_target = SelectedTarget::Local;
  EffectType effect_type = EffectType::Pure;
  std::string operation_id;
  std::string descriptor_json;
  std::optional<std::string> input_json;
  std::string attempt_id;
  std::string event_id;
};

Status begin_step(State& state, const BeginStepInput& input);

struct CommitStepInput {
  Fence fence;
  int64_t now_ms = 0;
  std::string step_key;
  std::string attempt_id;
  std::string output_json;
  std::string event_id;
};

Status commit_step(State& state, const CommitStepInput& input);

struct ResolveStepInput {
  Fence fence;
  int64_t now_ms = 0;
  std::string step_key;
  std::string attempt_id;
  StepStatus step_to = StepStatus::Failed;
  AttemptStatus attempt_status = AttemptStatus::Failed;
  std::optional<std::string> error_json;
  std::optional<int64_t> next_attempt_at;
  std::string reason;
  std::string event_id;
  std::optional<WorkflowStatus> run_to;
  std::string run_event_id;
};

Status resolve_step(State& state, const ResolveStepInput& input);

struct MarkUnknownInput {
  Fence fence;
  int64_t now_ms = 0;
  std::string step_key;
  std::optional<std::string> attempt_id;
  std::string reason;
  std::string message;
  std::string step_event_id;
  std::string run_event_id;
};

Status mark_unknown(State& state, const MarkUnknownInput& input);

struct ReconcileInput {
  Fence fence;
  int64_t now_ms = 0;
  std::string step_key;
  std::string resolution;
  std::optional<std::string> output_json;
  std::string message;
  std::string event_id;
  std::string run_event_id;
};

Status reconcile_step(State& state, const ReconcileInput& input);

struct OutboxInput {
  Fence fence;
  int64_t now_ms = 0;
  OutboxMessage message;
};

struct OutboxOutcome {
  Status status;
  bool deduplicated = false;
};

OutboxOutcome insert_outbox(State& state, const OutboxInput& input);

Status append_protocol_event(State& state, std::string event_id, std::string type, std::string payload, int64_t now_ms);

struct ParkDelegationInput {
  Fence fence;
  int64_t now_ms = 0;
  std::string step_key;
  std::string attempt_id;
  std::string event_id;
  DelegationState delegation_state = DelegationState::Accepted;
  std::optional<std::string> task_id;
  int64_t next_attempt_at = 0;
};

Status park_delegation(State& state, const ParkDelegationInput& input);

struct FailDelegationInput {
  Fence fence;
  int64_t now_ms = 0;
  std::string step_key;
  std::string code;
  std::string message;
  std::string event_id;
  std::string run_event_id;
};

Status fail_delegation(State& state, const FailDelegationInput& input);

struct CancelDelegationInput {
  Fence fence;
  int64_t now_ms = 0;
  std::string step_key;
  std::string message;
  std::string event_id;
  std::string run_event_id;
};

Status cancel_delegation_step(State& state, const CancelDelegationInput& input);

struct BlockRemoteInput {
  Fence fence;
  int64_t now_ms = 0;
  std::string step_key;
  std::string attempt_id;
  std::optional<std::string> task_id;
  std::string message;
  std::string event_id;
  std::string run_event_id;
  std::string accepted_event_id;
};

Status block_remote_input(State& state, const BlockRemoteInput& input);

struct AcceptRemoteContinuation {
  Fence fence;
  int64_t now_ms = 0;
  std::string step_key;
  std::string continuation_json;
  std::string event_id;
};

Status accept_remote_continuation(State& state, const AcceptRemoteContinuation& input);

struct CompleteDelegationInput {
  Fence fence;
  int64_t now_ms = 0;
  std::string step_key;
  std::string attempt_id;
  std::string output_json;
  std::string result_json;
  std::string event_id;
  std::string result_event_id;
};

Status complete_delegation(State& state, const CompleteDelegationInput& input);

Status validate_identity(std::string_view value, std::string_view label, size_t max_length);
Status validate_run_id(std::string_view value);
Status validate_step_key(std::string_view value);
Status validate_workflow_name(std::string_view value);
Status validate_json_text(std::string_view value, bool object, std::string& canonical);

const Step* find_step(const State& state, std::string_view key);
Step* find_step(State& state, std::string_view key);

}  // namespace larkx
