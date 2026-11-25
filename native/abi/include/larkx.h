#ifndef LARKX_H
#define LARKX_H

/**
 * LarkX native core, C ABI version 1.
 *
 * This header is the stable boundary for Swift, Kotlin, React Native, and
 * Node bindings. It does not expose C++ types. The caller owns every pointer
 * it passes in. The store owns the database connection. Strings written into
 * caller buffers are NUL-terminated when the call succeeds.
 *
 * ABI 1 is the execution foundation: protocol transitions, ownership fences,
 * step journaling, reconciliation, an offline outbox row, and egress decisions.
 * It does not run model adapters, submit remote tasks, or export telemetry.
 * Those stay behind host interfaces in later phases. The TypeScript engine
 * remains the shipped runtime until this core passes equivalent recovery tests.
 *
 * A store handle is safe to call from multiple threads. Calls are serialized.
 * Do not re-enter the same store from inside a future host callback.
 */

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define LARKX_ABI_VERSION 1u
#define LARKX_PROTOCOL_VERSION 1u
#define LARKX_STORAGE_SCHEMA_VERSION 1u

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

#ifdef __cplusplus
}
#endif

#endif
