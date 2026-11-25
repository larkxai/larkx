#include "larkx.h"

#include "larkx/agent.hpp"
#include "larkx/core.hpp"
#include "larkx/store.hpp"

#include <cstdio>
#include <cstring>
#include <memory>
#include <string>
#include <vector>

struct larkx_store {
  std::unique_ptr<larkx::Store> impl;
};

namespace {

larkx_code to_code(larkx::Code code) {
  switch (code) {
    case larkx::Code::Ok:
      return LARKX_OK;
    case larkx::Code::InvalidArgument:
      return LARKX_ERR_INVALID_ARGUMENT;
    case larkx::Code::State:
      return LARKX_ERR_STATE;
    case larkx::Code::Ownership:
      return LARKX_ERR_OWNERSHIP;
    case larkx::Code::Storage:
      return LARKX_ERR_STORAGE;
    case larkx::Code::NotFound:
      return LARKX_ERR_NOT_FOUND;
    case larkx::Code::Serialization:
      return LARKX_ERR_SERIALIZATION;
    case larkx::Code::Capacity:
      return LARKX_ERR_CAPACITY;
  }
  return LARKX_ERR_STORAGE;
}

void set_error(larkx_error* err, const larkx::Status& status) {
  if (err == nullptr) {
    return;
  }
  err->code = to_code(status.code);
  std::snprintf(err->message, sizeof(err->message), "%s", status.ok() ? "" : status.message.c_str());
}

larkx_code fail(larkx_error* err, const larkx::Status& status) {
  set_error(err, status);
  return to_code(status.code);
}

larkx_code ok(larkx_error* err) {
  set_error(err, larkx::Status::success());
  return LARKX_OK;
}

bool text(const char* value) { return value != nullptr && value[0] != '\0'; }

larkx::Status need(const char* value, const char* label) {
  if (!text(value)) {
    return larkx::Status::fail(larkx::Code::InvalidArgument, std::string(label) + " is required.");
  }
  return larkx::Status::success();
}

template <size_t N>
bool copy_field(char (&dest)[N], const std::string& src) {
  if (src.size() >= N) {
    return false;
  }
  std::memcpy(dest, src.c_str(), src.size() + 1);
  return true;
}

larkx_code copy_buffer(const std::string& src, char* buffer, size_t capacity, size_t* needed, larkx_error* err) {
  if (needed != nullptr) {
    *needed = src.size() + 1;
  }
  if (buffer == nullptr || capacity < src.size() + 1) {
    return fail(err, larkx::Status::fail(larkx::Code::Capacity, "Output buffer is too small."));
  }
  std::memcpy(buffer, src.c_str(), src.size() + 1);
  return ok(err);
}

larkx_code fill_run(const larkx::Run& run, larkx_run_info* out, larkx_error* err) {
  std::memset(out, 0, sizeof(*out));
  if (!copy_field(out->run_id, run.run_id) || !copy_field(out->workflow_name, run.workflow_name) ||
      !copy_field(out->status, larkx::to_string(run.status)) ||
      !copy_field(out->data_policy, larkx::to_string(run.data_policy))) {
    return fail(err, larkx::Status::fail(larkx::Code::Capacity, "Run field does not fit the ABI buffer."));
  }
  out->workflow_version = run.workflow_version;
  out->protocol_version = run.protocol_version;
  out->created_at = run.created_at;
  out->updated_at = run.updated_at;
  out->ownership_epoch = run.ownership_epoch;
  out->has_lease = run.lease_expires_at.has_value() ? 1 : 0;
  out->lease_expires_at = run.lease_expires_at.value_or(0);
  out->cancel_requested = run.cancel_requested ? 1 : 0;
  out->has_owner = run.owner_id.has_value() ? 1 : 0;
  if (run.owner_id.has_value() && !copy_field(out->owner_id, *run.owner_id)) {
    return fail(err, larkx::Status::fail(larkx::Code::Capacity, "Owner id does not fit the ABI buffer."));
  }
  out->has_blocked_reason = run.blocked_reason.has_value() ? 1 : 0;
  if (run.blocked_reason.has_value() && !copy_field(out->blocked_reason, *run.blocked_reason)) {
    return fail(err, larkx::Status::fail(larkx::Code::Capacity, "Blocked reason does not fit the ABI buffer."));
  }
  return ok(err);
}

larkx::Fence fence_from(const char* owner_id, int64_t epoch) {
  return larkx::Fence{owner_id == nullptr ? std::string() : std::string(owner_id), epoch};
}

}  // namespace

uint32_t larkx_abi_version(void) { return LARKX_ABI_VERSION; }

larkx_code larkx_store_open(const char* path, uint32_t flags, larkx_store** out, larkx_error* err) {
  if (out == nullptr || path == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Store open is missing a path or output."));
  }
  if ((flags & ~LARKX_STORE_EXCLUSIVE_OWNERSHIP) != 0) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Unknown store flag."));
  }
  *out = nullptr;
  auto store = std::make_unique<larkx_store>();
  auto status = larkx::Store::open(path, (flags & LARKX_STORE_EXCLUSIVE_OWNERSHIP) != 0, store->impl);
  if (!status.ok()) {
    return fail(err, status);
  }
  *out = store.release();
  return ok(err);
}

void larkx_store_close(larkx_store* store) { delete store; }

larkx_code larkx_store_describe(const larkx_store* store, larkx_store_info* out, larkx_error* err) {
  if (store == nullptr || store->impl == nullptr || out == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Store info is missing a store or output."));
  }
  out->abi_version = LARKX_ABI_VERSION;
  out->protocol_version = LARKX_PROTOCOL_VERSION;
  out->schema_version = LARKX_STORAGE_SCHEMA_VERSION;
  out->exclusive_ownership = store->impl->exclusive() ? 1 : 0;
  return ok(err);
}

larkx_code larkx_run_create(larkx_store* store, const larkx_run_spec* spec, int* created, larkx_error* err) {
  if (store == nullptr || spec == nullptr || created == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Run create is missing an argument."));
  }
  larkx::CreateRunInput input;
  input.run_id = spec->run_id == nullptr ? "" : spec->run_id;
  input.workflow_name = spec->workflow_name == nullptr ? "" : spec->workflow_name;
  input.workflow_version = spec->workflow_version;
  input.input_json = spec->input_json == nullptr ? "" : spec->input_json;
  input.data_policy = spec->data_policy == nullptr ? "" : spec->data_policy;
  input.event_id = spec->event_id == nullptr ? "" : spec->event_id;
  input.now_ms = spec->now_ms;
  bool was_created = false;
  auto status = store->impl->create_run(input, was_created);
  if (!status.ok()) {
    return fail(err, status);
  }
  *created = was_created ? 1 : 0;
  return ok(err);
}

larkx_code larkx_run_load(larkx_store* store, const char* run_id, larkx_run_info* out, larkx_error* err) {
  if (store == nullptr || out == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Run load is missing an argument."));
  }
  if (auto status = need(run_id, "Run id"); !status.ok()) {
    return fail(err, status);
  }
  std::optional<larkx::Run> run;
  auto status = store->impl->load_run(run_id, run);
  if (!status.ok()) {
    return fail(err, status);
  }
  if (!run.has_value()) {
    return fail(err, larkx::Status::fail(larkx::Code::NotFound, std::string("Run ") + run_id + " does not exist."));
  }
  return fill_run(*run, out, err);
}

larkx_code larkx_run_compatible(larkx_store* store, const char* run_id, const char* workflow_name,
                               int32_t workflow_version, const char* input_json, larkx_error* err) {
  if (store == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Run compatibility is missing a store."));
  }
  auto status = store->impl->compatible(run_id == nullptr ? "" : run_id, workflow_name == nullptr ? "" : workflow_name,
                                        workflow_version, input_json == nullptr ? "" : input_json);
  if (!status.ok()) {
    return fail(err, status);
  }
  return ok(err);
}

larkx_code larkx_run_request_cancel(larkx_store* store, const char* run_id, int64_t now_ms, larkx_error* err) {
  if (store == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Cancel is missing a store."));
  }
  auto status = store->impl->request_cancel(run_id == nullptr ? "" : run_id, now_ms);
  return status.ok() ? ok(err) : fail(err, status);
}

larkx_code larkx_run_transition(larkx_store* store, const larkx_transition_spec* spec, larkx_error* err) {
  if (store == nullptr || spec == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Run transition is missing an argument."));
  }
  larkx::TransitionInput input;
  input.fence = fence_from(spec->owner_id, spec->epoch);
  input.now_ms = spec->now_ms;
  if (!larkx::parse_workflow_status(spec->status == nullptr ? "" : spec->status, input.to)) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Workflow status is invalid."));
  }
  input.event_type = spec->event_type == nullptr ? "" : spec->event_type;
  input.event_id = spec->event_id == nullptr ? "" : spec->event_id;
  if (spec->payload_json == nullptr) {
    input.payload_json = "{}";
  } else {
    if (auto status = larkx::validate_json_text(spec->payload_json, true, input.payload_json); !status.ok()) {
      return fail(err, status);
    }
  }
  if (spec->output_json != nullptr) {
    std::string canonical;
    if (auto status = larkx::validate_json_text(spec->output_json, false, canonical); !status.ok()) {
      return fail(err, status);
    }
    input.set_output = true;
    input.output_json = canonical;
  }
  if (spec->error_json != nullptr) {
    std::string canonical;
    if (auto status = larkx::validate_json_text(spec->error_json, true, canonical); !status.ok()) {
      return fail(err, status);
    }
    input.set_error = true;
    input.error_json = canonical;
  }
  if (spec->blocked_reason != nullptr) {
    input.set_blocked = true;
    input.blocked_reason = spec->blocked_reason;
  }
  input.honor_cancel = spec->honor_cancel != 0;
  auto status = store->impl->transition_run(input, spec->run_id == nullptr ? "" : spec->run_id);
  return status.ok() ? ok(err) : fail(err, status);
}

larkx_code larkx_ownership_claim(larkx_store* store, const larkx_claim_request* spec, larkx_claim_result* out,
                                larkx_error* err) {
  if (store == nullptr || spec == nullptr || out == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Claim is missing an argument."));
  }
  larkx::ClaimInput input;
  input.owner_id = spec->owner_id == nullptr ? "" : spec->owner_id;
  input.now_ms = spec->now_ms;
  input.lease_ms = spec->lease_ms;
  input.may_steal = spec->may_steal != 0;
  larkx::ClaimOutcome outcome;
  auto status = store->impl->claim(spec->run_id == nullptr ? "" : spec->run_id, input, outcome);
  if (!status.ok()) {
    return fail(err, status);
  }
  std::memset(out, 0, sizeof(*out));
  out->acquired = outcome.acquired ? 1 : 0;
  out->epoch = outcome.epoch;
  out->has_lease = outcome.lease_expires_at.has_value() ? 1 : 0;
  out->lease_expires_at = outcome.lease_expires_at.value_or(0);
  if (!copy_field(out->owner_id, outcome.owner_id) || !copy_field(out->reason, outcome.reason)) {
    return fail(err, larkx::Status::fail(larkx::Code::Capacity, "Claim result does not fit the ABI buffer."));
  }
  return ok(err);
}

larkx_code larkx_ownership_renew(larkx_store* store, const char* run_id, const char* owner_id, int64_t epoch,
                                int64_t now_ms, int64_t lease_ms, int* renewed, larkx_error* err) {
  if (store == nullptr || renewed == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Renew is missing an argument."));
  }
  bool was_renewed = false;
  auto status =
      store->impl->renew(run_id == nullptr ? "" : run_id, fence_from(owner_id, epoch), now_ms, lease_ms, was_renewed);
  if (!status.ok()) {
    return fail(err, status);
  }
  *renewed = was_renewed ? 1 : 0;
  return ok(err);
}

larkx_code larkx_ownership_release(larkx_store* store, const char* run_id, const char* owner_id, int64_t epoch,
                                  int64_t now_ms, int* released, larkx_error* err) {
  if (store == nullptr || released == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Release is missing an argument."));
  }
  bool was_released = false;
  auto status = store->impl->release(run_id == nullptr ? "" : run_id, fence_from(owner_id, epoch), now_ms, was_released);
  if (!status.ok()) {
    return fail(err, status);
  }
  *released = was_released ? 1 : 0;
  return ok(err);
}

larkx_code larkx_step_begin(larkx_store* store, const larkx_step_begin_spec* spec, larkx_error* err) {
  if (store == nullptr || spec == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Step begin is missing an argument."));
  }
  larkx::BeginStepInput input;
  input.fence = fence_from(spec->owner_id, spec->epoch);
  input.now_ms = spec->now_ms;
  input.step_key = spec->step_key == nullptr ? "" : spec->step_key;
  input.step_order = spec->step_order;
  if (!larkx::parse_execution_target(spec->execution_target == nullptr ? "" : spec->execution_target,
                                    input.execution_target) ||
      !larkx::parse_selected_target(spec->selected_target == nullptr ? "" : spec->selected_target,
                                   input.selected_target) ||
      !larkx::parse_effect(spec->effect_type == nullptr ? "" : spec->effect_type, input.effect_type)) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Step execution target or effect is invalid."));
  }
  input.operation_id = spec->operation_id == nullptr ? "" : spec->operation_id;
  if (spec->descriptor_json == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Step descriptor is required."));
  }
  if (auto status = larkx::validate_json_text(spec->descriptor_json, true, input.descriptor_json); !status.ok()) {
    return fail(err, status);
  }
  if (spec->input_json != nullptr) {
    std::string canonical;
    if (auto status = larkx::validate_json_text(spec->input_json, false, canonical); !status.ok()) {
      return fail(err, status);
    }
    input.input_json = canonical;
  }
  input.attempt_id = spec->attempt_id == nullptr ? "" : spec->attempt_id;
  input.event_id = spec->event_id == nullptr ? "" : spec->event_id;
  auto status = store->impl->begin_step(input, spec->run_id == nullptr ? "" : spec->run_id);
  return status.ok() ? ok(err) : fail(err, status);
}

larkx_code larkx_step_commit(larkx_store* store, const larkx_step_commit_spec* spec, larkx_error* err) {
  if (store == nullptr || spec == nullptr || spec->output_json == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Step commit is missing an argument."));
  }
  larkx::CommitStepInput input;
  input.fence = fence_from(spec->owner_id, spec->epoch);
  input.now_ms = spec->now_ms;
  input.step_key = spec->step_key == nullptr ? "" : spec->step_key;
  input.attempt_id = spec->attempt_id == nullptr ? "" : spec->attempt_id;
  input.event_id = spec->event_id == nullptr ? "" : spec->event_id;
  if (auto status = larkx::validate_json_text(spec->output_json, false, input.output_json); !status.ok()) {
    return fail(err, status);
  }
  auto status = store->impl->commit_step(input, spec->run_id == nullptr ? "" : spec->run_id);
  return status.ok() ? ok(err) : fail(err, status);
}

larkx_code larkx_step_resolve(larkx_store* store, const larkx_step_resolve_spec* spec, larkx_error* err) {
  if (store == nullptr || spec == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Step resolve is missing an argument."));
  }
  larkx::ResolveStepInput input;
  input.fence = fence_from(spec->owner_id, spec->epoch);
  input.now_ms = spec->now_ms;
  input.step_key = spec->step_key == nullptr ? "" : spec->step_key;
  input.attempt_id = spec->attempt_id == nullptr ? "" : spec->attempt_id;
  if (!larkx::parse_step_status(spec->step_status == nullptr ? "" : spec->step_status, input.step_to) ||
      !larkx::parse_attempt_status(spec->attempt_status == nullptr ? "" : spec->attempt_status, input.attempt_status)) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Step resolve status is invalid."));
  }
  if (spec->error_json != nullptr) {
    std::string canonical;
    if (auto status = larkx::validate_json_text(spec->error_json, true, canonical); !status.ok()) {
      return fail(err, status);
    }
    input.error_json = canonical;
  }
  if (spec->has_next_attempt_at) {
    input.next_attempt_at = spec->next_attempt_at;
  }
  input.reason = spec->reason == nullptr ? "" : spec->reason;
  input.event_id = spec->event_id == nullptr ? "" : spec->event_id;
  if (spec->run_status != nullptr) {
    larkx::WorkflowStatus run_to;
    if (!larkx::parse_workflow_status(spec->run_status, run_to)) {
      return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Run status is invalid."));
    }
    input.run_to = run_to;
    input.run_event_id = spec->run_event_id == nullptr ? "" : spec->run_event_id;
  }
  auto status = store->impl->resolve_step(input, spec->run_id == nullptr ? "" : spec->run_id);
  return status.ok() ? ok(err) : fail(err, status);
}

larkx_code larkx_step_mark_unknown(larkx_store* store, const larkx_step_unknown* spec, larkx_error* err) {
  if (store == nullptr || spec == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Mark unknown is missing an argument."));
  }
  larkx::MarkUnknownInput input;
  input.fence = fence_from(spec->owner_id, spec->epoch);
  input.now_ms = spec->now_ms;
  input.step_key = spec->step_key == nullptr ? "" : spec->step_key;
  if (spec->attempt_id != nullptr) {
    input.attempt_id = spec->attempt_id;
  }
  input.reason = spec->reason == nullptr ? "" : spec->reason;
  input.message = spec->message == nullptr ? "" : spec->message;
  input.step_event_id = spec->step_event_id == nullptr ? "" : spec->step_event_id;
  input.run_event_id = spec->run_event_id == nullptr ? "" : spec->run_event_id;
  auto status = store->impl->mark_unknown(input, spec->run_id == nullptr ? "" : spec->run_id);
  return status.ok() ? ok(err) : fail(err, status);
}

larkx_code larkx_step_reconcile(larkx_store* store, const larkx_step_reconcile_spec* spec, larkx_error* err) {
  if (store == nullptr || spec == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Reconcile is missing an argument."));
  }
  larkx::ReconcileInput input;
  input.fence = fence_from(spec->owner_id, spec->epoch);
  input.now_ms = spec->now_ms;
  input.step_key = spec->step_key == nullptr ? "" : spec->step_key;
  input.resolution = spec->resolution == nullptr ? "" : spec->resolution;
  if (spec->output_json != nullptr) {
    std::string canonical;
    if (auto status = larkx::validate_json_text(spec->output_json, false, canonical); !status.ok()) {
      return fail(err, status);
    }
    input.output_json = canonical;
  }
  input.message = spec->message == nullptr ? "" : spec->message;
  input.event_id = spec->event_id == nullptr ? "" : spec->event_id;
  input.run_event_id = spec->run_event_id == nullptr ? "" : spec->run_event_id;
  auto status = store->impl->reconcile(input, spec->run_id == nullptr ? "" : spec->run_id);
  return status.ok() ? ok(err) : fail(err, status);
}

larkx_code larkx_step_count(larkx_store* store, const char* run_id, int32_t* count, larkx_error* err) {
  if (store == nullptr || count == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Step count is missing an argument."));
  }
  std::optional<larkx::State> state;
  auto status = store->impl->load_state(run_id == nullptr ? "" : run_id, state);
  if (!status.ok()) {
    return fail(err, status);
  }
  if (!state.has_value()) {
    return fail(err, larkx::Status::fail(larkx::Code::NotFound, "Run does not exist."));
  }
  *count = static_cast<int32_t>(state->steps.size());
  return ok(err);
}

larkx_code larkx_step_at(larkx_store* store, const char* run_id, int32_t index, larkx_step_info* out, larkx_error* err) {
  if (store == nullptr || out == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Step read is missing an argument."));
  }
  std::optional<larkx::State> state;
  auto status = store->impl->load_state(run_id == nullptr ? "" : run_id, state);
  if (!status.ok()) {
    return fail(err, status);
  }
  if (!state.has_value()) {
    return fail(err, larkx::Status::fail(larkx::Code::NotFound, "Run does not exist."));
  }
  if (index < 0 || static_cast<size_t>(index) >= state->steps.size()) {
    return fail(err, larkx::Status::fail(larkx::Code::NotFound, "Step index is out of range."));
  }
  const auto& step = state->steps[static_cast<size_t>(index)];
  std::memset(out, 0, sizeof(*out));
  if (!copy_field(out->step_key, step.step_key) || !copy_field(out->status, larkx::to_string(step.status)) ||
      !copy_field(out->execution_target, larkx::to_string(step.execution_target)) ||
      !copy_field(out->selected_target, larkx::to_string(step.selected_target)) ||
      !copy_field(out->effect_type, larkx::to_string(step.effect_type)) ||
      !copy_field(out->operation_id, step.operation_id)) {
    return fail(err, larkx::Status::fail(larkx::Code::Capacity, "Step field does not fit the ABI buffer."));
  }
  out->step_order = step.step_order;
  out->attempt_count = step.attempt_count;
  return ok(err);
}

larkx_code larkx_step_output(larkx_store* store, const char* run_id, const char* step_key, char* buffer, size_t capacity,
                            size_t* needed, larkx_error* err) {
  if (store == nullptr || step_key == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Step output is missing an argument."));
  }
  std::optional<larkx::State> state;
  auto status = store->impl->load_state(run_id == nullptr ? "" : run_id, state);
  if (!status.ok()) {
    return fail(err, status);
  }
  if (!state.has_value()) {
    return fail(err, larkx::Status::fail(larkx::Code::NotFound, "Run does not exist."));
  }
  const auto* step = larkx::find_step(*state, step_key);
  if (step == nullptr || !step->output_json.has_value()) {
    return fail(err, larkx::Status::fail(larkx::Code::NotFound, "Step output is not stored."));
  }
  return copy_buffer(*step->output_json, buffer, capacity, needed, err);
}

larkx_code larkx_step_replay(larkx_store* store, const char* run_id, const char* step_key, larkx_replay* out, char* output,
                            size_t capacity, size_t* needed, larkx_error* err) {
  if (store == nullptr || out == nullptr || step_key == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Replay is missing an argument."));
  }
  std::optional<larkx::State> state;
  auto status = store->impl->load_state(run_id == nullptr ? "" : run_id, state);
  if (!status.ok()) {
    return fail(err, status);
  }
  if (!state.has_value()) {
    return fail(err, larkx::Status::fail(larkx::Code::NotFound, "Run does not exist."));
  }
  std::memset(out, 0, sizeof(*out));
  const auto* step = larkx::find_step(*state, step_key);
  if (step == nullptr) {
    out->known = 0;
    out->invoke_handler = 1;
    return copy_buffer("", output, capacity, needed, err);
  }
  out->known = 1;
  if (!copy_field(out->status, larkx::to_string(step->status)) || !copy_field(out->operation_id, step->operation_id) ||
      !copy_field(out->effect_type, larkx::to_string(step->effect_type))) {
    return fail(err, larkx::Status::fail(larkx::Code::Capacity, "Replay field does not fit the ABI buffer."));
  }
  out->invoke_handler =
      (step->status == larkx::StepStatus::Pending || step->status == larkx::StepStatus::RetryScheduled) ? 1 : 0;
  if (step->status == larkx::StepStatus::Completed && step->output_json.has_value()) {
    return copy_buffer(*step->output_json, output, capacity, needed, err);
  }
  return copy_buffer("", output, capacity, needed, err);
}

larkx_code larkx_event_count(larkx_store* store, const char* run_id, int32_t* count, larkx_error* err) {
  if (store == nullptr || count == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Event count is missing an argument."));
  }
  std::optional<larkx::State> state;
  auto status = store->impl->load_state(run_id == nullptr ? "" : run_id, state);
  if (!status.ok()) {
    return fail(err, status);
  }
  if (!state.has_value()) {
    return fail(err, larkx::Status::fail(larkx::Code::NotFound, "Run does not exist."));
  }
  *count = static_cast<int32_t>(state->events.size());
  return ok(err);
}

larkx_code larkx_event_at(larkx_store* store, const char* run_id, int32_t index, larkx_event_info* out, larkx_error* err) {
  if (store == nullptr || out == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Event read is missing an argument."));
  }
  std::optional<larkx::State> state;
  auto status = store->impl->load_state(run_id == nullptr ? "" : run_id, state);
  if (!status.ok()) {
    return fail(err, status);
  }
  if (!state.has_value() || index < 0 || static_cast<size_t>(index) >= state->events.size()) {
    return fail(err, larkx::Status::fail(larkx::Code::NotFound, "Event index is out of range."));
  }
  const auto& event = state->events[static_cast<size_t>(index)];
  std::memset(out, 0, sizeof(*out));
  out->sequence = event.sequence;
  if (!copy_field(out->event_id, event.event_id) || !copy_field(out->type, event.type)) {
    return fail(err, larkx::Status::fail(larkx::Code::Capacity, "Event field does not fit the ABI buffer."));
  }
  return ok(err);
}

larkx_code larkx_event_payload(larkx_store* store, const char* run_id, int32_t index, char* buffer, size_t capacity,
                              size_t* needed, larkx_error* err) {
  if (store == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Event payload is missing a store."));
  }
  std::optional<larkx::State> state;
  auto status = store->impl->load_state(run_id == nullptr ? "" : run_id, state);
  if (!status.ok()) {
    return fail(err, status);
  }
  if (!state.has_value() || index < 0 || static_cast<size_t>(index) >= state->events.size()) {
    return fail(err, larkx::Status::fail(larkx::Code::NotFound, "Event index is out of range."));
  }
  return copy_buffer(state->events[static_cast<size_t>(index)].payload_json, buffer, capacity, needed, err);
}

larkx_code larkx_outbox_insert(larkx_store* store, const larkx_outbox_spec* spec, larkx_outbox_result* out,
                              larkx_error* err) {
  if (store == nullptr || spec == nullptr || out == nullptr || spec->payload_json == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Outbox insert is missing an argument."));
  }
  larkx::OutboxInput input;
  input.fence = fence_from(spec->owner_id, spec->epoch);
  input.now_ms = spec->now_ms;
  input.message.message_id = spec->message_id == nullptr ? "" : spec->message_id;
  input.message.run_id = spec->run_id == nullptr ? "" : spec->run_id;
  input.message.step_key = spec->step_key == nullptr ? "" : spec->step_key;
  input.message.operation_id = spec->operation_id == nullptr ? "" : spec->operation_id;
  if (auto status = larkx::validate_json_text(spec->payload_json, true, input.message.payload_json); !status.ok()) {
    return fail(err, status);
  }
  if (!larkx::parse_outbox_status(spec->status == nullptr ? "" : spec->status, input.message.status)) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Outbox status is invalid."));
  }
  input.message.attempt_count = 1;
  input.message.created_at = spec->now_ms;
  input.message.updated_at = spec->now_ms;
  bool deduplicated = false;
  int32_t count = 0;
  auto status = store->impl->insert_outbox(input, deduplicated, count);
  if (!status.ok()) {
    return fail(err, status);
  }
  out->deduplicated = deduplicated ? 1 : 0;
  out->count = count;
  return ok(err);
}

larkx_code larkx_interrupted_resolution(const char* effect_type, char* out, size_t capacity, larkx_error* err) {
  larkx::EffectType effect;
  if (effect_type == nullptr || !larkx::parse_effect(effect_type, effect)) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Effect class is invalid."));
  }
  larkx::InterruptResolution resolution;
  auto status = larkx::interrupted_resolution(effect, resolution);
  if (!status.ok()) {
    return fail(err, status);
  }
  const char* text = resolution == larkx::InterruptResolution::UnknownOutcome ? "unknown" : "retry";
  return copy_buffer(text, out, capacity, nullptr, err);
}

larkx_code larkx_egress_allowed(const char* data_policy, const char* destination, int* allowed, larkx_error* err) {
  if (allowed == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Egress decision is missing an output."));
  }
  larkx::DataPolicy policy;
  larkx::EgressDestination dest;
  if (data_policy == nullptr || !larkx::parse_data_policy(data_policy, policy) || destination == nullptr ||
      !larkx::parse_egress_destination(destination, dest)) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Egress policy or destination is invalid."));
  }
  *allowed = larkx::egress_allowed(policy, dest) ? 1 : 0;
  return ok(err);
}

struct larkx_runtime {
  std::unique_ptr<larkx::Runtime> impl;
};

larkx::AgentRegistration registration_from(const larkx_agent_spec* spec) {
  larkx::AgentRegistration agent;
  agent.name = spec->name == nullptr ? "" : spec->name;
  agent.version = spec->version;
  agent.instructions = spec->instructions == nullptr ? "" : spec->instructions;
  agent.model_id = spec->model_id == nullptr ? "" : spec->model_id;
  agent.model_name = spec->model_name == nullptr ? "" : spec->model_name;
  agent.tool_calling = spec->tool_calling != 0;
  agent.max_iterations = spec->max_iterations;
  agent.max_tool_calls = spec->max_tool_calls;
  agent.max_invalid_tool_requests = spec->max_invalid_tool_requests;
  agent.max_context_chars = spec->max_context_chars;
  agent.model_max_attempts = spec->model_max_attempts;
  agent.model_initial_interval_ms = spec->model_initial_interval_ms;
  agent.model_max_interval_ms = spec->model_max_interval_ms;
  agent.model_backoff = spec->model_backoff == nullptr ? "" : spec->model_backoff;
  if (spec->tools != nullptr) {
    for (int32_t index = 0; index < spec->tool_count; index += 1) {
      const larkx_tool_spec& tool = spec->tools[index];
      larkx::ToolRegistration item;
      item.name = tool.name == nullptr ? "" : tool.name;
      item.description = tool.description == nullptr ? "" : tool.description;
      item.schema_json = tool.input_schema_json == nullptr ? "" : tool.input_schema_json;
      item.effects = tool.effects == nullptr ? "" : tool.effects;
      item.max_attempts = tool.max_attempts;
      item.initial_interval_ms = tool.initial_interval_ms;
      item.max_interval_ms = tool.max_interval_ms;
      item.backoff = tool.backoff == nullptr ? "" : tool.backoff;
      agent.tools.push_back(std::move(item));
    }
  }
  return agent;
}

void fill_request(const larkx::ExecRequest& request, larkx_exec_request* out) {
  std::memset(out, 0, sizeof(*out));
  out->kind = request.kind;
  out->attempt = request.attempt;
  out->wait_until_ms = request.wait_until_ms;
  out->has_wait_until = request.has_wait_until ? 1 : 0;
  out->cancel_requested = request.cancel_requested ? 1 : 0;
  copy_field(out->request_id, request.request_id);
  copy_field(out->step_key, request.step_key);
  copy_field(out->operation_id, request.operation_id);
  copy_field(out->tool_name, request.tool_name);
  copy_field(out->effect_type, request.effect_type);
}

larkx_code larkx_runtime_open(const char* path, uint32_t flags, const char* owner_id, int64_t lease_ms, larkx_runtime** out,
                             larkx_error* err) {
  if (out == nullptr || path == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Runtime open is missing a path or output."));
  }
  if ((flags & ~(LARKX_STORE_EXCLUSIVE_OWNERSHIP | LARKX_RUNTIME_MAY_STEAL)) != 0) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Unknown runtime flag."));
  }
  *out = nullptr;
  auto runtime = std::make_unique<larkx_runtime>();
  auto status = larkx::Runtime::open(path, (flags & LARKX_STORE_EXCLUSIVE_OWNERSHIP) != 0, (flags & LARKX_RUNTIME_MAY_STEAL) != 0,
                                    owner_id == nullptr ? "" : owner_id, lease_ms, runtime->impl);
  if (!status.ok()) {
    return fail(err, status);
  }
  *out = runtime.release();
  return ok(err);
}

void larkx_runtime_close(larkx_runtime* runtime) { delete runtime; }

larkx_code larkx_agent_register(larkx_runtime* runtime, const larkx_agent_spec* spec, larkx_error* err) {
  if (runtime == nullptr || runtime->impl == nullptr || spec == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Agent registration is missing an argument."));
  }
  auto status = runtime->impl->register_agent(registration_from(spec));
  return status.ok() ? ok(err) : fail(err, status);
}

larkx_code larkx_agent_start(larkx_runtime* runtime, const char* agent_name, int32_t agent_version, const char* run_id,
                            const char* input_json, int64_t now_ms, larkx_run_info* out, larkx_error* err) {
  if (runtime == nullptr || runtime->impl == nullptr || out == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Agent start is missing an argument."));
  }
  larkx::Run run;
  auto status = runtime->impl->start(agent_name == nullptr ? "" : agent_name, agent_version, run_id == nullptr ? "" : run_id,
                                    input_json == nullptr ? "" : input_json, now_ms, run);
  if (!run.run_id.empty()) {
    const auto filled = fill_run(run, out, err);
    if (filled != LARKX_OK) {
      return filled;
    }
  }
  return status.ok() ? ok(err) : fail(err, status);
}

larkx_code larkx_run_drive(larkx_runtime* runtime, const char* run_id, int64_t now_ms, larkx_exec_request* out, char* detail_json,
                          size_t detail_capacity, size_t* needed, larkx_error* err) {
  if (runtime == nullptr || runtime->impl == nullptr || out == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Drive is missing an argument."));
  }
  larkx::ExecRequest request;
  auto status = runtime->impl->drive(run_id == nullptr ? "" : run_id, now_ms, request);
  if (!status.ok()) {
    return fail(err, status);
  }
  fill_request(request, out);
  return copy_buffer(request.detail_json, detail_json, detail_capacity, needed, err);
}

larkx_code larkx_run_submit_model(larkx_runtime* runtime, const char* run_id, const char* request_id, const char* response_json,
                                 const char* error_code, const char* error_message, int retryable, int64_t now_ms, larkx_error* err) {
  if (runtime == nullptr || runtime->impl == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Model submit is missing a runtime."));
  }
  auto status = runtime->impl->submit_model(run_id == nullptr ? "" : run_id, request_id == nullptr ? "" : request_id,
                                            response_json == nullptr ? "" : response_json, error_code == nullptr ? "" : error_code,
                                            error_message == nullptr ? "" : error_message, retryable != 0, now_ms);
  return status.ok() ? ok(err) : fail(err, status);
}

larkx_code larkx_run_submit_tool(larkx_runtime* runtime, const char* run_id, const char* request_id, const char* output_json,
                                const char* error_code, const char* error_message, int retryable, int64_t now_ms, larkx_error* err) {
  if (runtime == nullptr || runtime->impl == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Tool submit is missing a runtime."));
  }
  auto status = runtime->impl->submit_tool(run_id == nullptr ? "" : run_id, request_id == nullptr ? "" : request_id,
                                           output_json == nullptr ? "null" : output_json, error_code == nullptr ? "" : error_code,
                                           error_message == nullptr ? "" : error_message, retryable != 0, now_ms);
  return status.ok() ? ok(err) : fail(err, status);
}

larkx_code larkx_run_submit_reconcile(larkx_runtime* runtime, const char* run_id, const char* request_id, const char* resolution,
                                     const char* output_json, const char* message, int64_t now_ms, larkx_error* err) {
  if (runtime == nullptr || runtime->impl == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Reconcile submit is missing a runtime."));
  }
  auto status = runtime->impl->submit_reconcile(run_id == nullptr ? "" : run_id, request_id == nullptr ? "" : request_id,
                                                resolution == nullptr ? "" : resolution, output_json == nullptr ? "null" : output_json,
                                                message == nullptr ? "" : message, now_ms);
  return status.ok() ? ok(err) : fail(err, status);
}

larkx_code larkx_run_pause(larkx_runtime* runtime, const char* run_id, int64_t now_ms, larkx_error* err) {
  if (runtime == nullptr || runtime->impl == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Pause is missing a runtime."));
  }
  auto status = runtime->impl->pause(run_id == nullptr ? "" : run_id, now_ms);
  return status.ok() ? ok(err) : fail(err, status);
}

larkx_code larkx_run_resume(larkx_runtime* runtime, const char* run_id, int64_t now_ms, larkx_error* err) {
  if (runtime == nullptr || runtime->impl == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Resume is missing a runtime."));
  }
  auto status = runtime->impl->resume_run(run_id == nullptr ? "" : run_id, now_ms);
  return status.ok() ? ok(err) : fail(err, status);
}

larkx_code larkx_run_cancel(larkx_runtime* runtime, const char* run_id, int64_t now_ms, larkx_error* err) {
  if (runtime == nullptr || runtime->impl == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Cancel is missing a runtime."));
  }
  auto status = runtime->impl->cancel(run_id == nullptr ? "" : run_id, now_ms);
  return status.ok() ? ok(err) : fail(err, status);
}

larkx_code larkx_run_inspect(larkx_runtime* runtime, const char* run_id, larkx_run_info* out, larkx_error* err) {
  if (runtime == nullptr || runtime->impl == nullptr || out == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Inspect is missing an argument."));
  }
  larkx::Run run;
  auto status = runtime->impl->inspect(run_id == nullptr ? "" : run_id, run);
  if (!status.ok()) {
    return fail(err, status);
  }
  return fill_run(run, out, err);
}

larkx_code larkx_run_result(larkx_runtime* runtime, const char* run_id, char* buffer, size_t capacity, size_t* needed, larkx_error* err) {
  if (runtime == nullptr || runtime->impl == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Result is missing a runtime."));
  }
  std::string json;
  auto status = runtime->impl->result_json(run_id == nullptr ? "" : run_id, json);
  if (!status.ok()) {
    return fail(err, status);
  }
  return copy_buffer(json, buffer, capacity, needed, err);
}

larkx_code larkx_run_step_count(larkx_runtime* runtime, const char* run_id, int32_t* count, larkx_error* err) {
  if (runtime == nullptr || runtime->impl == nullptr || count == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Step count is missing an argument."));
  }
  auto status = runtime->impl->step_count(run_id == nullptr ? "" : run_id, *count);
  return status.ok() ? ok(err) : fail(err, status);
}

larkx_code larkx_run_step_at(larkx_runtime* runtime, const char* run_id, int32_t index, larkx_step_info* out, larkx_error* err) {
  if (runtime == nullptr || runtime->impl == nullptr || out == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Step read is missing an argument."));
  }
  larkx::Step step;
  auto status = runtime->impl->step_at(run_id == nullptr ? "" : run_id, index, step);
  if (!status.ok()) {
    return fail(err, status);
  }
  std::memset(out, 0, sizeof(*out));
  if (!copy_field(out->step_key, step.step_key) || !copy_field(out->status, larkx::to_string(step.status)) ||
      !copy_field(out->execution_target, larkx::to_string(step.execution_target)) ||
      !copy_field(out->selected_target, larkx::to_string(step.selected_target)) ||
      !copy_field(out->effect_type, larkx::to_string(step.effect_type)) || !copy_field(out->operation_id, step.operation_id)) {
    return fail(err, larkx::Status::fail(larkx::Code::Capacity, "Step field does not fit the ABI buffer."));
  }
  out->step_order = step.step_order;
  out->attempt_count = step.attempt_count;
  return ok(err);
}

larkx_code larkx_run_step_output(larkx_runtime* runtime, const char* run_id, const char* step_key, char* buffer, size_t capacity,
                                size_t* needed, larkx_error* err) {
  if (runtime == nullptr || runtime->impl == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Step output is missing a runtime."));
  }
  std::string json;
  auto status = runtime->impl->step_output(run_id == nullptr ? "" : run_id, step_key == nullptr ? "" : step_key, json);
  if (!status.ok()) {
    return fail(err, status);
  }
  return copy_buffer(json, buffer, capacity, needed, err);
}

larkx_code larkx_run_event_count(larkx_runtime* runtime, const char* run_id, int32_t* count, larkx_error* err) {
  if (runtime == nullptr || runtime->impl == nullptr || count == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Event count is missing an argument."));
  }
  auto status = runtime->impl->event_count(run_id == nullptr ? "" : run_id, *count);
  return status.ok() ? ok(err) : fail(err, status);
}

larkx_code larkx_run_event_payload(larkx_runtime* runtime, const char* run_id, int32_t index, char* buffer, size_t capacity,
                                  size_t* needed, larkx_error* err) {
  if (runtime == nullptr || runtime->impl == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Event payload is missing a runtime."));
  }
  std::string json;
  auto status = runtime->impl->event_payload(run_id == nullptr ? "" : run_id, index, json);
  if (!status.ok()) {
    return fail(err, status);
  }
  return copy_buffer(json, buffer, capacity, needed, err);
}

larkx_code larkx_run_count(larkx_runtime* runtime, int32_t* count, larkx_error* err) {
  if (runtime == nullptr || runtime->impl == nullptr || count == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Run list is missing an argument."));
  }
  std::vector<larkx::Run> runs;
  auto status = runtime->impl->list_runs(runs);
  if (!status.ok()) {
    return fail(err, status);
  }
  if (runs.size() > 0x7fffffffU) {
    return fail(err, larkx::Status::fail(larkx::Code::Capacity, "Run list does not fit a 32-bit count."));
  }
  *count = static_cast<int32_t>(runs.size());
  return ok(err);
}

larkx_code larkx_run_at(larkx_runtime* runtime, int32_t index, larkx_run_info* out, larkx_error* err) {
  if (runtime == nullptr || runtime->impl == nullptr || out == nullptr) {
    return fail(err, larkx::Status::fail(larkx::Code::InvalidArgument, "Run list is missing an argument."));
  }
  std::vector<larkx::Run> runs;
  auto status = runtime->impl->list_runs(runs);
  if (!status.ok()) {
    return fail(err, status);
  }
  if (index < 0 || static_cast<size_t>(index) >= runs.size()) {
    return fail(err, larkx::Status::fail(larkx::Code::NotFound, "Run index is out of range."));
  }
  return fill_run(runs[static_cast<size_t>(index)], out, err);
}
