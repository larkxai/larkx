#ifndef LARKX_H
#define LARKX_H

/**
 * LarkX native core, C ABI version 4.
 *
 * This header is the stable boundary for Swift, Kotlin, React Native, and
 * Node bindings. It does not expose C++ types. The caller owns every pointer
 * it passes in. The store owns the database connection. Strings written into
 * caller buffers are NUL-terminated when the call succeeds.
 *
 * Version 1 of this header is the execution foundation: protocol transitions,
 * ownership fences, step journaling, reconciliation, an outbox row, and egress
 * decisions. Version 2 adds the agent runtime. Version 3 adds durable remote
 * delegation. Version 4 adds the remote transport kind, A2A task and context
 * identity, and a continuation for remote input. The runtime returns an
 * execution request and the host submits the result. The core does not call
 * the host, a model SDK, HTTP, or a device API. Telemetry export is not part
 * of this ABI.
 *
 * A store handle is safe to call from multiple threads. Calls are serialized.
 * Do not re-enter the same store from inside a future host callback.
 */

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define LARKX_ABI_VERSION 4u
#define LARKX_PROTOCOL_VERSION 1u
#define LARKX_STORAGE_SCHEMA_VERSION 3u

/** Another owner cannot take a run merely because its lease expired. */
#define LARKX_STORE_EXCLUSIVE_OWNERSHIP 1u

typedef enum larkx_code {
  LARKX_OK = 0,
  LARKX_ERR_INVALID_ARGUMENT = 1,
  LARKX_ERR_STATE = 2,
  LARKX_ERR_OWNERSHIP = 3,
  LARKX_ERR_STORAGE = 4,
  LARKX_ERR_NOT_FOUND = 5,
  LARKX_ERR_SERIALIZATION = 6,
  LARKX_ERR_CAPACITY = 7
} larkx_code;

typedef struct larkx_error {
  larkx_code code;
  char message[384];
} larkx_error;

typedef struct larkx_store larkx_store;

uint32_t larkx_abi_version(void);

larkx_code larkx_store_open(const char* path, uint32_t flags, larkx_store** out, larkx_error* err);
void larkx_store_close(larkx_store* store);

typedef struct larkx_store_info {
  uint32_t abi_version;
  int32_t protocol_version;
  int32_t schema_version;
  int exclusive_ownership;
} larkx_store_info;

larkx_code larkx_store_describe(const larkx_store* store, larkx_store_info* out, larkx_error* err);

typedef struct larkx_run_create {
  const char* run_id;
  const char* workflow_name;
  int32_t workflow_version;
  const char* input_json;
  const char* data_policy;
  const char* event_id;
  int64_t now_ms;
} larkx_run_spec;

larkx_code larkx_run_create(larkx_store* store, const larkx_run_spec* spec, int* created, larkx_error* err);

typedef struct larkx_run_info {
  char run_id[201];
  char workflow_name[65];
  int32_t workflow_version;
  char status[32];
  char data_policy[32];
  int32_t protocol_version;
  int64_t created_at;
  int64_t updated_at;
  int64_t ownership_epoch;
  int64_t lease_expires_at;
  int has_lease;
  int cancel_requested;
  char owner_id[201];
  int has_owner;
  char blocked_reason[513];
  int has_blocked_reason;
} larkx_run_info;

larkx_code larkx_run_load(larkx_store* store, const char* run_id, larkx_run_info* out, larkx_error* err);

/**
 * Compares the stored workflow name, version, and canonical input.
 * Returns LARKX_OK when they match. Returns LARKX_ERR_STATE when they do not.
 */
larkx_code larkx_run_compatible(
    larkx_store* store,
    const char* run_id,
    const char* workflow_name,
    int32_t workflow_version,
    const char* input_json,
    larkx_error* err);

/** Sets the cancel flag. It does not by itself move the run to CANCELLED. */
larkx_code larkx_run_request_cancel(larkx_store* store, const char* run_id, int64_t now_ms, larkx_error* err);

typedef struct larkx_run_transition {
  const char* run_id;
  const char* owner_id;
  int64_t epoch;
  int64_t now_ms;
  const char* status;
  const char* event_type;
  const char* event_id;
  const char* payload_json;
  const char* output_json;
  const char* error_json;
  const char* blocked_reason;
  int honor_cancel;
} larkx_transition_spec;

larkx_code larkx_run_transition(larkx_store* store, const larkx_transition_spec* spec, larkx_error* err);

typedef struct larkx_claim_request {
  const char* run_id;
  const char* owner_id;
  int64_t now_ms;
  int64_t lease_ms;
  int may_steal;
} larkx_claim_request;

typedef struct larkx_claim_result {
  int acquired;
  int64_t epoch;
  char owner_id[201];
  char reason[32];
  int64_t lease_expires_at;
  int has_lease;
} larkx_claim_result;

larkx_code larkx_ownership_claim(
    larkx_store* store, const larkx_claim_request* spec, larkx_claim_result* out, larkx_error* err);

larkx_code larkx_ownership_renew(
    larkx_store* store,
    const char* run_id,
    const char* owner_id,
    int64_t epoch,
    int64_t now_ms,
    int64_t lease_ms,
    int* renewed,
    larkx_error* err);

larkx_code larkx_ownership_release(
    larkx_store* store,
    const char* run_id,
    const char* owner_id,
    int64_t epoch,
    int64_t now_ms,
    int* released,
    larkx_error* err);

typedef struct larkx_step_begin {
  const char* run_id;
  const char* owner_id;
  int64_t epoch;
  int64_t now_ms;
  const char* step_key;
  int32_t step_order;
  const char* execution_target;
  const char* selected_target;
  const char* effect_type;
  const char* operation_id;
  const char* descriptor_json;
  const char* input_json;
  const char* attempt_id;
  const char* event_id;
} larkx_step_begin_spec;

larkx_code larkx_step_begin(larkx_store* store, const larkx_step_begin_spec* spec, larkx_error* err);

typedef struct larkx_step_commit {
  const char* run_id;
  const char* owner_id;
  int64_t epoch;
  int64_t now_ms;
  const char* step_key;
  const char* attempt_id;
  const char* output_json;
  const char* event_id;
} larkx_step_commit_spec;

larkx_code larkx_step_commit(larkx_store* store, const larkx_step_commit_spec* spec, larkx_error* err);

typedef struct larkx_step_resolve {
  const char* run_id;
  const char* owner_id;
  int64_t epoch;
  int64_t now_ms;
  const char* step_key;
  const char* attempt_id;
  const char* step_status;
  const char* attempt_status;
  const char* error_json;
  int64_t next_attempt_at;
  int has_next_attempt_at;
  const char* reason;
  const char* event_id;
  const char* run_status;
  const char* run_event_id;
} larkx_step_resolve_spec;

larkx_code larkx_step_resolve(larkx_store* store, const larkx_step_resolve_spec* spec, larkx_error* err);

typedef struct larkx_step_unknown {
  const char* run_id;
  const char* owner_id;
  int64_t epoch;
  int64_t now_ms;
  const char* step_key;
  const char* attempt_id;
  const char* reason;
  const char* message;
  const char* step_event_id;
  const char* run_event_id;
} larkx_step_unknown;

larkx_code larkx_step_mark_unknown(larkx_store* store, const larkx_step_unknown* spec, larkx_error* err);

typedef struct larkx_step_reconcile {
  const char* run_id;
  const char* owner_id;
  int64_t epoch;
  int64_t now_ms;
  const char* step_key;
  const char* resolution;
  const char* output_json;
  const char* message;
  const char* event_id;
  const char* run_event_id;
} larkx_step_reconcile_spec;

larkx_code larkx_step_reconcile(larkx_store* store, const larkx_step_reconcile_spec* spec, larkx_error* err);

typedef struct larkx_step_info {
  char step_key[129];
  int32_t step_order;
  char status[32];
  char execution_target[16];
  char selected_target[16];
  char effect_type[32];
  char operation_id[201];
  int32_t attempt_count;
} larkx_step_info;

larkx_code larkx_step_count(larkx_store* store, const char* run_id, int32_t* count, larkx_error* err);
larkx_code larkx_step_at(
    larkx_store* store, const char* run_id, int32_t index, larkx_step_info* out, larkx_error* err);

/**
 * Copies the committed step output. When the buffer is too small, returns
 * LARKX_ERR_CAPACITY and writes the required size, including the NUL, to
 * `needed` when that pointer is non-NULL.
 */
larkx_code larkx_step_output(
    larkx_store* store,
    const char* run_id,
    const char* step_key,
    char* buffer,
    size_t capacity,
    size_t* needed,
    larkx_error* err);

typedef struct larkx_replay {
  int known;
  int invoke_handler;
  char status[32];
  char operation_id[201];
  char effect_type[32];
} larkx_replay;

/**
 * Replay decision for one step key.
 * A completed step sets invoke_handler to 0 and returns the stored output.
 * The core does not call a handler.
 */
larkx_code larkx_step_replay(
    larkx_store* store,
    const char* run_id,
    const char* step_key,
    larkx_replay* out,
    char* output,
    size_t capacity,
    size_t* needed,
    larkx_error* err);

typedef struct larkx_event_info {
  int64_t sequence;
  char event_id[201];
  char type[64];
} larkx_event_info;

larkx_code larkx_event_count(larkx_store* store, const char* run_id, int32_t* count, larkx_error* err);
larkx_code larkx_event_at(
    larkx_store* store, const char* run_id, int32_t index, larkx_event_info* out, larkx_error* err);
larkx_code larkx_event_payload(
    larkx_store* store,
    const char* run_id,
    int32_t index,
    char* buffer,
    size_t capacity,
    size_t* needed,
    larkx_error* err);

typedef struct larkx_outbox_insert {
  const char* run_id;
  const char* owner_id;
  int64_t epoch;
  int64_t now_ms;
  const char* message_id;
  const char* step_key;
  const char* operation_id;
  const char* payload_json;
  const char* status;
} larkx_outbox_spec;

typedef struct larkx_outbox_result {
  int deduplicated;
  int32_t count;
} larkx_outbox_result;

larkx_code larkx_outbox_insert(
    larkx_store* store, const larkx_outbox_spec* spec, larkx_outbox_result* out, larkx_error* err);

/**
 * Recovery classification for a step left RUNNING.
 * Writes "retry" or "unknown". pure and idempotent retry. non-idempotent is unknown.
 * A2A compatibility is not an input to this decision.
 */
larkx_code larkx_interrupted_resolution(const char* effect_type, char* out, size_t capacity, larkx_error* err);

/**
 * SDK-managed egress decision.
 * "telemetry" is never authorized by a data policy. An exporter is a separate opt-in.
 * "local" is allowed under every policy. Remote destinations require "cloud-allowed".
 * This does not sandbox arbitrary native code.
 */
larkx_code larkx_egress_allowed(
    const char* data_policy, const char* destination, int* allowed, larkx_error* err);

/**
 * ABI 2 agent runtime.
 *
 * The host registers an agent, starts a run, and then alternates
 * larkx_run_drive with a submit call. Drive persists the step and operation id
 * before it returns an invoke request. A request_id names that attempt. A
 * second submit for an attempt that is no longer open is rejected.
 *
 * Closing the runtime does not release ownership. Reopen with the same owner
 * id to recover. A RUNNING step that this process did not issue is an
 * interrupt: pure and idempotent steps retry with the same operation id, and
 * non-idempotent steps become UNKNOWN_OUTCOME. A remote delegation is not that
 * rule: recovery follows the capabilities stored with the operation. A known
 * remote task id is polled. Without a task id, lookup or a declared dedupe
 * capability is required before another submission. Otherwise the delegation
 * is UNKNOWN_OUTCOME and the parent run blocks.
 *
 * A model or idempotent tool can run again when the process dies after the
 * attempt is begun and before the result is committed. That window cannot be
 * closed from the device. Non-idempotent work is not repeated.
 *
 * Zero in a limit or model_max_attempts selects the default. A negative
 * interval selects the default interval. Zero is a real interval.
 */
#define LARKX_RUNTIME_MAY_STEAL 2u

typedef enum larkx_request_kind {
  LARKX_REQUEST_INVOKE_MODEL = 1,
  LARKX_REQUEST_INVOKE_TOOL = 2,
  LARKX_REQUEST_RECONCILE = 3,
  LARKX_REQUEST_WAIT = 4,
  LARKX_REQUEST_COMPLETE = 5,
  LARKX_REQUEST_BLOCKED = 6,
  LARKX_REQUEST_FAILED = 7,
  LARKX_REQUEST_CANCELLED = 8,
  LARKX_REQUEST_PAUSED = 9,
  LARKX_REQUEST_DELEGATE = 10
} larkx_request_kind;

typedef struct larkx_runtime larkx_runtime;

typedef struct larkx_tool_spec {
  const char* name;
  const char* description;
  const char* input_schema_json;
  const char* effects;
  int32_t max_attempts;
  int64_t initial_interval_ms;
  int64_t max_interval_ms;
  const char* backoff;
} larkx_tool_spec;

typedef struct larkx_remote_spec {
  const char* name;
  const char* description;
  const char* input_schema_json;
  const char* endpoint;
  int dedupe;
  int lookup;
  int durable_task;
  int poll;
  int cancel;
  int persistent;
  int64_t poll_interval_ms;
  /**
   * "http" or "a2a". NULL means "http" so a zeroed version-3 spec stays valid
   * for callers rebuilt against this header. The stored transport id is this
   * kind plus the normalized endpoint.
   */
  const char* transport;
} larkx_remote_spec;

typedef struct larkx_agent_spec {
  const char* name;
  int32_t version;
  const char* instructions;
  const char* model_id;
  const char* model_name;
  int tool_calling;
  const larkx_tool_spec* tools;
  int32_t tool_count;
  int32_t max_iterations;
  int32_t max_tool_calls;
  int32_t max_invalid_tool_requests;
  int32_t max_context_chars;
  int32_t model_max_attempts;
  int64_t model_initial_interval_ms;
  int64_t model_max_interval_ms;
  const char* model_backoff;
  const larkx_remote_spec* remote_agents;
  int32_t remote_count;
  int allow_remote;
} larkx_agent_spec;

typedef struct larkx_exec_request {
  int32_t kind;
  char request_id[201];
  char step_key[129];
  char operation_id[201];
  char tool_name[81];
  int32_t attempt;
  int64_t wait_until_ms;
  int has_wait_until;
  char effect_type[32];
  int cancel_requested;
} larkx_exec_request;

larkx_code larkx_runtime_open(
    const char* path,
    uint32_t flags,
    const char* owner_id,
    int64_t lease_ms,
    larkx_runtime** out,
    larkx_error* err);
void larkx_runtime_close(larkx_runtime* runtime);

larkx_code larkx_agent_register(larkx_runtime* runtime, const larkx_agent_spec* spec, larkx_error* err);

/**
 * Persists the run identity before returning. Does not call a model.
 * An existing run with the same id must have the same agent version and input.
 */
larkx_code larkx_agent_start(
    larkx_runtime* runtime,
    const char* agent_name,
    int32_t agent_version,
    const char* run_id,
    const char* input_json,
    int64_t now_ms,
    larkx_run_info* out,
    larkx_error* err);

larkx_code larkx_run_drive(
    larkx_runtime* runtime,
    const char* run_id,
    int64_t now_ms,
    larkx_exec_request* out,
    char* detail_json,
    size_t detail_capacity,
    size_t* needed,
    larkx_error* err);

larkx_code larkx_run_submit_model(
    larkx_runtime* runtime,
    const char* run_id,
    const char* request_id,
    const char* response_json,
    const char* error_code,
    const char* error_message,
    int retryable,
    int64_t now_ms,
    larkx_error* err);

larkx_code larkx_run_submit_tool(
    larkx_runtime* runtime,
    const char* run_id,
    const char* request_id,
    const char* output_json,
    const char* error_code,
    const char* error_message,
    int retryable,
    int64_t now_ms,
    larkx_error* err);

/**
 * Commits one host result for a LARKX_REQUEST_DELEGATE request.
 * body_json is an object with action, outcome, and optional taskId, result,
 * and message. The core validates it and chooses the next delegation state.
 * A stale owner or a closed request is rejected.
 */
larkx_code larkx_run_submit_delegation(
    larkx_runtime* runtime,
    const char* run_id,
    const char* request_id,
    const char* body_json,
    int64_t now_ms,
    larkx_error* err);

larkx_code larkx_run_delegations(
    larkx_runtime* runtime,
    const char* run_id,
    char* buffer,
    size_t capacity,
    size_t* needed,
    larkx_error* err);

/**
 * Supplies one text answer to a blocked A2A delegation that asked for input.
 * The text is stored as the next continuation and the parent run resumes.
 * It is not written to the event journal. HTTP delegations cannot use this.
 */
larkx_code larkx_run_provide_input(
    larkx_runtime* runtime,
    const char* run_id,
    const char* step_key,
    const char* text,
    int64_t now_ms,
    larkx_error* err);

larkx_code larkx_run_submit_reconcile(
    larkx_runtime* runtime,
    const char* run_id,
    const char* request_id,
    const char* resolution,
    const char* output_json,
    const char* message,
    int64_t now_ms,
    larkx_error* err);

larkx_code larkx_run_pause(larkx_runtime* runtime, const char* run_id, int64_t now_ms, larkx_error* err);
larkx_code larkx_run_resume(larkx_runtime* runtime, const char* run_id, int64_t now_ms, larkx_error* err);
larkx_code larkx_run_cancel(larkx_runtime* runtime, const char* run_id, int64_t now_ms, larkx_error* err);

larkx_code larkx_run_inspect(larkx_runtime* runtime, const char* run_id, larkx_run_info* out, larkx_error* err);

/**
 * Snapshot of persisted runs, ordered by updated time and then run id.
 * count receives the number of runs. at reads one index from a fresh snapshot.
 * An index past the end returns LARKX_ERR_NOT_FOUND.
 */
larkx_code larkx_run_count(larkx_runtime* runtime, int32_t* count, larkx_error* err);
larkx_code larkx_run_at(larkx_runtime* runtime, int32_t index, larkx_run_info* out, larkx_error* err);
larkx_code larkx_run_result(
    larkx_runtime* runtime, const char* run_id, char* buffer, size_t capacity, size_t* needed, larkx_error* err);
larkx_code larkx_run_step_count(larkx_runtime* runtime, const char* run_id, int32_t* count, larkx_error* err);
larkx_code larkx_run_step_at(
    larkx_runtime* runtime, const char* run_id, int32_t index, larkx_step_info* out, larkx_error* err);
larkx_code larkx_run_step_output(
    larkx_runtime* runtime,
    const char* run_id,
    const char* step_key,
    char* buffer,
    size_t capacity,
    size_t* needed,
    larkx_error* err);
larkx_code larkx_run_event_count(larkx_runtime* runtime, const char* run_id, int32_t* count, larkx_error* err);
larkx_code larkx_run_event_payload(
    larkx_runtime* runtime,
    const char* run_id,
    int32_t index,
    char* buffer,
    size_t capacity,
    size_t* needed,
    larkx_error* err);

/**
 * One row per run: run id, updated time, and maximum committed sequence.
 * Event payloads are not read.
 */
larkx_code larkx_run_journal_heads(
    larkx_runtime* runtime, char* buffer, size_t capacity, size_t* needed, larkx_error* err);

/**
 * Events with sequence greater than after_sequence, ordered by sequence, at most limit.
 * limit is 1 through 500. The JSON also includes run and step metadata and maxSequence.
 * Earlier event payloads, step inputs, and step outputs are not read.
 */
larkx_code larkx_run_event_page(
    larkx_runtime* runtime,
    const char* run_id,
    int64_t after_sequence,
    int32_t limit,
    char* buffer,
    size_t capacity,
    size_t* needed,
    larkx_error* err);

#ifdef __cplusplus
}
#endif

#endif
