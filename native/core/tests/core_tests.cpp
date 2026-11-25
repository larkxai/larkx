#include "larkx.h"
#include "larkx/core.hpp"
#include "larkx/json.hpp"

#include <sqlite3.h>

#include <cstdio>
#include <cstring>
#include <fstream>
#include <iostream>
#include <iterator>
#include <sstream>
#include <string>
#include <unistd.h>
#include <vector>

namespace {

int g_failed = 0;

void check(bool condition, const char* expression, const char* file, int line) {
  if (!condition) {
    std::fprintf(stderr, "FAIL %s:%d %s\n", file, line, expression);
    g_failed += 1;
  }
}

#define CHECK(condition) check(static_cast<bool>(condition), #condition, __FILE__, __LINE__)

std::string read_file(const char* path) {
  std::ifstream input(path);
  std::ostringstream buffer;
  buffer << input.rdbuf();
  return buffer.str();
}

std::string temp_db() {
  char path[] = "/tmp/larkx-core-XXXXXX";
  const int fd = mkstemp(path);
  if (fd >= 0) {
    close(fd);
  }
  return path;
}

larkx_store* open_store(const std::string& path, uint32_t flags = 0) {
  larkx_store* store = nullptr;
  larkx_error error{};
  const auto code = larkx_store_open(path.c_str(), flags, &store, &error);
  CHECK(code == LARKX_OK);
  return store;
}

void create_agent_run(larkx_store* store, const char* run_id) {
  larkx_run_spec spec{};
  spec.run_id = run_id;
  spec.workflow_name = "personal-assistant";
  spec.workflow_version = 1;
  spec.input_json = "{\"b\":1,\"a\":2}";
  spec.data_policy = "device-only";
  spec.event_id = "evt-created";
  spec.now_ms = 10;
  int created = 0;
  larkx_error error{};
  CHECK(larkx_run_create(store, &spec, &created, &error) == LARKX_OK);
  CHECK(created == 1);
}

larkx_claim_result claim(larkx_store* store, const char* run_id, const char* owner, int64_t now, int64_t lease,
                         int may_steal) {
  larkx_claim_request request{};
  request.run_id = run_id;
  request.owner_id = owner;
  request.now_ms = now;
  request.lease_ms = lease;
  request.may_steal = may_steal;
  larkx_claim_result result{};
  larkx_error error{};
  CHECK(larkx_ownership_claim(store, &request, &result, &error) == LARKX_OK);
  return result;
}

void begin(larkx_store* store, const char* run_id, const char* owner, int64_t epoch, const char* key, int order,
           const char* effect, const char* operation, const char* attempt, const char* event) {
  larkx_step_begin_spec spec{};
  spec.run_id = run_id;
  spec.owner_id = owner;
  spec.epoch = epoch;
  spec.now_ms = 20;
  spec.step_key = key;
  spec.step_order = order;
  spec.execution_target = "local";
  spec.selected_target = "local";
  spec.effect_type = effect;
  spec.operation_id = operation;
  spec.descriptor_json = "{\"effects\":\"pure\"}";
  spec.attempt_id = attempt;
  spec.event_id = event;
  larkx_error error{};
  const auto code = larkx_step_begin(store, &spec, &error);
  CHECK(code == LARKX_OK);
}

const larkx::Json* field(const larkx::Json& object, const char* key) {
  for (const auto& entry : object.object) {
    if (entry.first == key) {
      return &entry.second;
    }
  }
  return nullptr;
}

bool array_has(const larkx::Json& array, const std::string& value) {
  for (const auto& item : array.array) {
    if (item.kind == larkx::Json::Kind::String && item.text == value) {
      return true;
    }
  }
  return false;
}

void test_fixture_transitions() {
  larkx::Json fixture;
  std::string error;
  CHECK(larkx::parse_json(read_file(LARKX_FIXTURE_PATH), fixture, error));
  const auto* workflows = field(fixture, "workflowTransitions");
  CHECK(workflows != nullptr);
  for (const auto& from_field : workflows->object) {
    larkx::WorkflowStatus from;
    CHECK(larkx::parse_workflow_status(from_field.first, from));
    for (const auto& to_field : workflows->object) {
      larkx::WorkflowStatus to;
      CHECK(larkx::parse_workflow_status(to_field.first, to));
      const bool allowed = array_has(from_field.second, to_field.first);
      CHECK(larkx::can_transition(from, to) == allowed);
    }
  }
  const auto* steps = field(fixture, "stepTransitions");
  CHECK(steps != nullptr);
  for (const auto& from_field : steps->object) {
    larkx::StepStatus from;
    CHECK(larkx::parse_step_status(from_field.first, from));
    for (const auto& to_field : steps->object) {
      larkx::StepStatus to;
      CHECK(larkx::parse_step_status(to_field.first, to));
      CHECK(larkx::can_transition(from, to) == array_has(from_field.second, to_field.first));
    }
  }
  const auto* interrupt = field(fixture, "interruptResolution");
  CHECK(interrupt != nullptr);
  for (const auto& entry : interrupt->object) {
    larkx::EffectType effect;
    CHECK(larkx::parse_effect(entry.first, effect));
    larkx::InterruptResolution resolution;
    CHECK(larkx::interrupted_resolution(effect, resolution).ok());
    const bool unknown = resolution == larkx::InterruptResolution::UnknownOutcome;
    CHECK((entry.second.text == "unknown") == unknown);
  }
  const auto* egress = field(fixture, "egress");
  CHECK(egress != nullptr);
  for (const auto& policy_field : egress->object) {
    for (const auto& dest_field : policy_field.second.object) {
      int allowed = -1;
      larkx_error err{};
      CHECK(larkx_egress_allowed(policy_field.first.c_str(), dest_field.first.c_str(), &allowed, &err) == LARKX_OK);
      CHECK(allowed == (dest_field.second.boolean ? 1 : 0));
    }
  }
}

void test_committed_output_is_replayed() {
  const auto path = temp_db();
  auto* store = open_store(path);
  create_agent_run(store, "run-1");
  larkx_error error{};
  CHECK(larkx_run_compatible(store, "run-1", "personal-assistant", 1, "{\"a\":2,\"b\":1}", &error) == LARKX_OK);
  const auto owner = claim(store, "run-1", "owner-a", 10, 1000, 0);
  CHECK(owner.acquired == 1);
  CHECK(owner.epoch == 1);
  begin(store, "run-1", "owner-a", owner.epoch, "model-0", 0, "idempotent", "op-model", "attempt-1", "evt-begin");
  larkx_step_commit_spec commit{};
  commit.run_id = "run-1";
  commit.owner_id = "owner-a";
  commit.epoch = owner.epoch;
  commit.now_ms = 30;
  commit.step_key = "model-0";
  commit.attempt_id = "attempt-1";
  commit.output_json = "{\"message\":\"kept\",\"finish\":\"stop\"}";
  commit.event_id = "evt-commit";
  CHECK(larkx_step_commit(store, &commit, &error) == LARKX_OK);
  larkx_replay replay{};
  char output[256];
  size_t needed = 0;
  CHECK(larkx_step_replay(store, "run-1", "model-0", &replay, output, sizeof(output), &needed, &error) == LARKX_OK);
  CHECK(replay.invoke_handler == 0);
  CHECK(std::strcmp(replay.operation_id, "op-model") == 0);
  CHECK(std::strcmp(output, "{\"finish\":\"stop\",\"message\":\"kept\"}") == 0);
  larkx_store_close(store);
  auto* reopened = open_store(path);
  std::memset(&replay, 0, sizeof(replay));
  CHECK(larkx_step_replay(reopened, "run-1", "model-0", &replay, output, sizeof(output), &needed, &error) == LARKX_OK);
  CHECK(replay.invoke_handler == 0);
  CHECK(std::strcmp(output, "{\"finish\":\"stop\",\"message\":\"kept\"}") == 0);
  larkx_store_close(reopened);
  std::remove(path.c_str());
}

void test_operation_id_survives_retry() {
  const auto path = temp_db();
  auto* store = open_store(path);
  create_agent_run(store, "run-retry");
  const auto owner = claim(store, "run-retry", "owner-a", 10, 1000, 0);
  begin(store, "run-retry", "owner-a", owner.epoch, "tool-0", 0, "idempotent", "op-stable", "attempt-1", "evt-begin");
  larkx_step_resolve_spec resolve{};
  resolve.run_id = "run-retry";
  resolve.owner_id = "owner-a";
  resolve.epoch = owner.epoch;
  resolve.now_ms = 40;
  resolve.step_key = "tool-0";
  resolve.attempt_id = "attempt-1";
  resolve.step_status = "RETRY_SCHEDULED";
  resolve.attempt_status = "INTERRUPTED";
  resolve.has_next_attempt_at = 1;
  resolve.next_attempt_at = 40;
  resolve.reason = "interrupted";
  resolve.event_id = "evt-retry";
  larkx_error error{};
  CHECK(larkx_step_resolve(store, &resolve, &error) == LARKX_OK);
  larkx_step_begin_spec again = {};
  again.run_id = "run-retry";
  again.owner_id = "owner-a";
  again.epoch = owner.epoch;
  again.now_ms = 50;
  again.step_key = "tool-0";
  again.step_order = 0;
  again.execution_target = "local";
  again.selected_target = "local";
  again.effect_type = "idempotent";
  again.operation_id = "op-other";
  again.descriptor_json = "{}";
  again.attempt_id = "attempt-2";
  again.event_id = "evt-begin-2";
  CHECK(larkx_step_begin(store, &again, &error) == LARKX_ERR_STATE);
  again.operation_id = "op-stable";
  CHECK(larkx_step_begin(store, &again, &error) == LARKX_OK);
  larkx_step_info info{};
  CHECK(larkx_step_at(store, "run-retry", 0, &info, &error) == LARKX_OK);
  CHECK(std::strcmp(info.operation_id, "op-stable") == 0);
  CHECK(info.attempt_count == 2);
  larkx_store_close(store);
  std::remove(path.c_str());
}

void test_non_idempotent_is_not_repeated() {
  char resolution[16];
  larkx_error error{};
  CHECK(larkx_interrupted_resolution("non-idempotent", resolution, sizeof(resolution), &error) == LARKX_OK);
  CHECK(std::strcmp(resolution, "unknown") == 0);
  CHECK(larkx_interrupted_resolution("pure", resolution, sizeof(resolution), &error) == LARKX_OK);
  CHECK(std::strcmp(resolution, "retry") == 0);

  const auto path = temp_db();
  auto* store = open_store(path);
  create_agent_run(store, "run-charge");
  const auto owner = claim(store, "run-charge", "owner-a", 10, 1000, 0);
  begin(store, "run-charge", "owner-a", owner.epoch, "charge", 0, "non-idempotent", "op-charge", "attempt-1",
        "evt-begin");
  larkx_step_unknown unknown{};
  unknown.run_id = "run-charge";
  unknown.owner_id = "owner-a";
  unknown.epoch = owner.epoch;
  unknown.now_ms = 60;
  unknown.step_key = "charge";
  unknown.attempt_id = "attempt-1";
  unknown.reason = "interrupted";
  unknown.message = "Interrupted before the step result was committed.";
  unknown.step_event_id = "evt-unknown";
  unknown.run_event_id = "evt-blocked";
  CHECK(larkx_step_mark_unknown(store, &unknown, &error) == LARKX_OK);
  larkx_step_begin_spec again{};
  again.run_id = "run-charge";
  again.owner_id = "owner-a";
  again.epoch = owner.epoch;
  again.now_ms = 70;
  again.step_key = "charge";
  again.step_order = 0;
  again.execution_target = "local";
  again.selected_target = "local";
  again.effect_type = "non-idempotent";
  again.operation_id = "op-charge";
  again.descriptor_json = "{}";
  again.attempt_id = "attempt-2";
  again.event_id = "evt-again";
  CHECK(larkx_step_begin(store, &again, &error) == LARKX_ERR_STATE);
  larkx_run_info info{};
  CHECK(larkx_run_load(store, "run-charge", &info, &error) == LARKX_OK);
  CHECK(std::strcmp(info.status, "BLOCKED") == 0);
  larkx_step_reconcile_spec reconcile{};
  reconcile.run_id = "run-charge";
  reconcile.owner_id = "owner-a";
  reconcile.epoch = owner.epoch;
  reconcile.now_ms = 80;
  reconcile.step_key = "charge";
  reconcile.resolution = "retry";
  reconcile.event_id = "evt-reconcile";
  reconcile.run_event_id = "evt-resume";
  CHECK(larkx_step_reconcile(store, &reconcile, &error) == LARKX_OK);
  larkx_step_info step{};
  CHECK(larkx_step_at(store, "run-charge", 0, &step, &error) == LARKX_OK);
  CHECK(std::strcmp(step.status, "RETRY_SCHEDULED") == 0);
  CHECK(std::strcmp(step.operation_id, "op-charge") == 0);
  larkx_replay replay{};
  char output[8];
  CHECK(larkx_step_replay(store, "run-charge", "charge", &replay, output, sizeof(output), nullptr, &error) == LARKX_OK);
  CHECK(replay.invoke_handler == 1);
  CHECK(std::strcmp(replay.operation_id, "op-charge") == 0);
  larkx_store_close(store);
  std::remove(path.c_str());
}

void test_stale_owner_cannot_commit() {
  const auto path = temp_db();
  auto* first = open_store(path);
  auto* second = open_store(path);
  create_agent_run(first, "run-fence");
  const auto owner = claim(first, "run-fence", "owner-a", 10, 1000, 0);
  begin(first, "run-fence", "owner-a", owner.epoch, "model-0", 0, "idempotent", "op-1", "attempt-1", "evt-begin");
  const auto stolen = claim(second, "run-fence", "owner-b", 20, 1000, 1);
  CHECK(stolen.acquired == 1);
  CHECK(stolen.epoch == 2);
  larkx_step_commit_spec commit{};
  commit.run_id = "run-fence";
  commit.owner_id = "owner-a";
  commit.epoch = owner.epoch;
  commit.now_ms = 30;
  commit.step_key = "model-0";
  commit.attempt_id = "attempt-1";
  commit.output_json = "{\"message\":\"late\"}";
  commit.event_id = "evt-late";
  larkx_error error{};
  CHECK(larkx_step_commit(first, &commit, &error) == LARKX_ERR_OWNERSHIP);
  larkx_step_info step{};
  CHECK(larkx_step_at(second, "run-fence", 0, &step, &error) == LARKX_OK);
  CHECK(std::strcmp(step.status, "RUNNING") == 0);
  larkx_store_close(first);
  larkx_store_close(second);
  std::remove(path.c_str());
}

void test_sensitive_event_is_rejected() {
  const auto path = temp_db();
  auto* store = open_store(path);
  create_agent_run(store, "run-secret");
  const auto owner = claim(store, "run-secret", "owner-a", 10, 1000, 0);
  larkx_transition_spec transition{};
  transition.run_id = "run-secret";
  transition.owner_id = "owner-a";
  transition.epoch = owner.epoch;
  transition.now_ms = 15;
  transition.status = "RUNNING";
  transition.event_type = "WORKFLOW_STARTED";
  transition.event_id = "evt-start";
  transition.payload_json = "{\"prompt\":\"secret\"}";
  larkx_error error{};
  CHECK(larkx_run_transition(store, &transition, &error) == LARKX_ERR_SERIALIZATION);
  larkx_run_info info{};
  CHECK(larkx_run_load(store, "run-secret", &info, &error) == LARKX_OK);
  CHECK(std::strcmp(info.status, "CREATED") == 0);
  int32_t events = 0;
  CHECK(larkx_event_count(store, "run-secret", &events, &error) == LARKX_OK);
  CHECK(events == 1);
  larkx_store_close(store);
  std::remove(path.c_str());
}

void test_outbox_dedupe() {
  const auto path = temp_db();
  auto* store = open_store(path);
  create_agent_run(store, "run-out");
  const auto owner = claim(store, "run-out", "owner-a", 10, 1000, 0);
  larkx_outbox_spec spec{};
  spec.run_id = "run-out";
  spec.owner_id = "owner-a";
  spec.epoch = owner.epoch;
  spec.now_ms = 10;
  spec.message_id = "msg-1";
  spec.step_key = "calendar";
  spec.operation_id = "op-remote";
  spec.payload_json = "{\"task\":\"meet\"}";
  spec.status = "pending";
  larkx_outbox_result result{};
  larkx_error error{};
  CHECK(larkx_outbox_insert(store, &spec, &result, &error) == LARKX_OK);
  CHECK(result.deduplicated == 0);
  CHECK(result.count == 1);
  spec.message_id = "msg-2";
  spec.payload_json = "{\"task\":\"meet\"}";
  CHECK(larkx_outbox_insert(store, &spec, &result, &error) == LARKX_OK);
  CHECK(result.deduplicated == 1);
  CHECK(result.count == 1);
  spec.payload_json = "{\"task\":\"other\"}";
  CHECK(larkx_outbox_insert(store, &spec, &result, &error) == LARKX_ERR_STATE);
  larkx_store_close(store);
  std::remove(path.c_str());
}

void test_exclusive_ownership() {
  const auto path = temp_db();
  auto* store = open_store(path, LARKX_STORE_EXCLUSIVE_OWNERSHIP);
  create_agent_run(store, "run-mobile");
  const auto owner = claim(store, "run-mobile", "owner-a", 0, 10, 0);
  CHECK(owner.acquired == 1);
  const auto blocked = claim(store, "run-mobile", "owner-b", 100, 10, 0);
  CHECK(blocked.acquired == 0);
  CHECK(std::strcmp(blocked.reason, "owned_by_other") == 0);
  const auto stolen = claim(store, "run-mobile", "owner-b", 100, 10, 1);
  CHECK(stolen.acquired == 1);
  CHECK(stolen.epoch == 2);
  larkx_store_close(store);

  auto* node = open_store(path);
  const auto expired = claim(node, "run-mobile", "owner-c", 1000, 10, 0);
  CHECK(expired.acquired == 1);
  larkx_store_close(node);
  std::remove(path.c_str());
}

std::string file_bytes(const std::string& path) {
  std::ifstream input(path, std::ios::binary);
  return std::string(std::istreambuf_iterator<char>(input), std::istreambuf_iterator<char>());
}

void test_database_identity() {
  constexpr int kApplicationId = 0x4C585254;
  const auto path = temp_db();
  auto* created = open_store(path);
  create_agent_run(created, "run-identity");
  larkx_store_close(created);

  sqlite3* db = nullptr;
  sqlite3_stmt* stmt = nullptr;
  CHECK(sqlite3_open(path.c_str(), &db) == SQLITE_OK);
  CHECK(sqlite3_prepare_v2(db, "PRAGMA application_id", -1, &stmt, nullptr) == SQLITE_OK);
  CHECK(sqlite3_step(stmt) == SQLITE_ROW);
  CHECK(sqlite3_column_int(stmt, 0) == kApplicationId);
  sqlite3_finalize(stmt);
  sqlite3_close(db);

  auto* reopened = open_store(path);
  larkx_run_info info{};
  larkx_error error{};
  CHECK(larkx_run_load(reopened, "run-identity", &info, &error) == LARKX_OK);
  CHECK(std::strcmp(info.status, "CREATED") == 0);
  larkx_store_close(reopened);

  const auto foreign = temp_db();
  CHECK(sqlite3_open(foreign.c_str(), &db) == SQLITE_OK);
  CHECK(sqlite3_exec(db,
                     "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);"
                     "INSERT INTO schema_migrations (version, applied_at) VALUES (1, 0);"
                     "CREATE TABLE workflow_runs (run_id TEXT PRIMARY KEY);",
                     nullptr, nullptr, nullptr) == SQLITE_OK);
  sqlite3_close(db);
  const auto before = file_bytes(foreign);
  larkx_store* rejected = nullptr;
  CHECK(larkx_store_open(foreign.c_str(), 0, &rejected, &error) == LARKX_ERR_STORAGE);
  CHECK(rejected == nullptr);
  CHECK(std::strstr(error.message, "was not deleted") != nullptr);
  CHECK(file_bytes(foreign) == before);
  CHECK(sqlite3_open(foreign.c_str(), &db) == SQLITE_OK);
  CHECK(sqlite3_prepare_v2(db, "PRAGMA application_id", -1, &stmt, nullptr) == SQLITE_OK);
  CHECK(sqlite3_step(stmt) == SQLITE_ROW);
  CHECK(sqlite3_column_int(stmt, 0) == 0);
  sqlite3_finalize(stmt);
  sqlite3_close(db);

  std::remove(path.c_str());
  std::remove((path + "-wal").c_str());
  std::remove((path + "-shm").c_str());
  std::remove(foreign.c_str());
}

void test_newer_schema_is_rejected() {
  const auto path = temp_db();
  auto* store = open_store(path);
  larkx_store_close(store);
  sqlite3* db = nullptr;
  CHECK(sqlite3_open(path.c_str(), &db) == SQLITE_OK);
  CHECK(sqlite3_exec(db, "UPDATE schema_migrations SET version = 2", nullptr, nullptr, nullptr) == SQLITE_OK);
  sqlite3_close(db);
  larkx_store* rejected = nullptr;
  larkx_error error{};
  CHECK(larkx_store_open(path.c_str(), 0, &rejected, &error) == LARKX_ERR_STORAGE);
  CHECK(rejected == nullptr);
  std::remove(path.c_str());
}

}  // namespace

int main() {
  test_fixture_transitions();
  test_committed_output_is_replayed();
  test_operation_id_survives_retry();
  test_non_idempotent_is_not_repeated();
  test_stale_owner_cannot_commit();
  test_sensitive_event_is_rejected();
  test_outbox_dedupe();
  test_exclusive_ownership();
  test_database_identity();
  test_newer_schema_is_rejected();
  if (g_failed != 0) {
    std::fprintf(stderr, "%d checks failed\n", g_failed);
    return 1;
  }
  std::puts("larkx native core tests passed");
  return 0;
}
