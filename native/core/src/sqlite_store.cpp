#include "larkx/store.hpp"

#include "larkx/json.hpp"

#include <sqlite3.h>

#include <utility>

namespace larkx {
namespace {

Status storage(std::string message) { return Status::fail(Code::Storage, std::move(message)); }

Status exec_sql(sqlite3* db, const char* sql) {
  char* error = nullptr;
  if (sqlite3_exec(db, sql, nullptr, nullptr, &error) != SQLITE_OK) {
    std::string message = error != nullptr ? error : sqlite3_errmsg(db);
    sqlite3_free(error);
    return storage(std::move(message));
  }
  return Status::success();
}

class Statement {
 public:
  explicit Statement(sqlite3_stmt* stmt) : stmt_(stmt) {}
  Statement(const Statement&) = delete;
  Statement& operator=(const Statement&) = delete;
  ~Statement() { sqlite3_finalize(stmt_); }
  sqlite3_stmt* get() const { return stmt_; }

 private:
  sqlite3_stmt* stmt_ = nullptr;
};

class Transaction {
 public:
  explicit Transaction(sqlite3* db) : db_(db) {}
  Transaction(const Transaction&) = delete;
  Transaction& operator=(const Transaction&) = delete;
  ~Transaction() {
    if (open_) {
      sqlite3_exec(db_, "ROLLBACK;", nullptr, nullptr, nullptr);
    }
  }
  Status begin() {
    auto status = exec_sql(db_, "BEGIN IMMEDIATE;");
    open_ = status.ok();
    return status;
  }
  Status commit() {
    auto status = exec_sql(db_, "COMMIT;");
    if (status.ok()) {
      open_ = false;
    }
    return status;
  }

 private:
  sqlite3* db_ = nullptr;
  bool open_ = false;
};

void bind_text(sqlite3_stmt* stmt, int index, const std::string& value) {
  sqlite3_bind_text(stmt, index, value.data(), static_cast<int>(value.size()), SQLITE_TRANSIENT);
}

void bind_optional_text(sqlite3_stmt* stmt, int index, const std::optional<std::string>& value) {
  if (!value.has_value()) {
    sqlite3_bind_null(stmt, index);
    return;
  }
  bind_text(stmt, index, *value);
}

void bind_optional_int(sqlite3_stmt* stmt, int index, const std::optional<int64_t>& value) {
  if (!value.has_value()) {
    sqlite3_bind_null(stmt, index);
    return;
  }
  sqlite3_bind_int64(stmt, index, *value);
}

std::string column_text(sqlite3_stmt* stmt, int index) {
  const auto* raw = sqlite3_column_text(stmt, index);
  if (raw == nullptr) {
    return {};
  }
  const int bytes = sqlite3_column_bytes(stmt, index);
  return std::string(reinterpret_cast<const char*>(raw), static_cast<size_t>(bytes < 0 ? 0 : bytes));
}

std::optional<std::string> column_optional_text(sqlite3_stmt* stmt, int index) {
  if (sqlite3_column_type(stmt, index) == SQLITE_NULL) {
    return std::nullopt;
  }
  return column_text(stmt, index);
}

std::optional<int64_t> column_optional_int(sqlite3_stmt* stmt, int index) {
  if (sqlite3_column_type(stmt, index) == SQLITE_NULL) {
    return std::nullopt;
  }
  return sqlite3_column_int64(stmt, index);
}

Status step_done(sqlite3_stmt* stmt, sqlite3* db) {
  const int rc = sqlite3_step(stmt);
  if (rc != SQLITE_DONE) {
    return storage(sqlite3_errmsg(db));
  }
  return Status::success();
}

// SQLite application_id for databases created by this C++ runtime. ASCII "LXRT".
// A file with any other id is left untouched. There is no migration from earlier files.
constexpr int64_t kApplicationId = 0x4C585254;

const char* kSchema = R"SQL(
CREATE TABLE workflow_runs (
  run_id TEXT PRIMARY KEY,
  workflow_name TEXT NOT NULL,
  workflow_version INTEGER NOT NULL,
  input_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('CREATED','RUNNING','WAITING','RECOVERING','COMPLETED','FAILED','CANCELLED','BLOCKED')),
  output_json TEXT,
  error_json TEXT,
  blocked_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  owner_id TEXT,
  ownership_epoch INTEGER NOT NULL,
  lease_expires_at INTEGER,
  protocol_version INTEGER NOT NULL,
  data_policy TEXT NOT NULL CHECK (data_policy IN ('device-only','cloud-allowed')),
  cancel_requested INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE workflow_steps (
  run_id TEXT NOT NULL,
  step_key TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING','RUNNING','WAITING_REMOTE','RETRY_SCHEDULED','COMPLETED','FAILED','UNKNOWN_OUTCOME','CANCELLED')),
  execution_target TEXT NOT NULL,
  selected_target TEXT NOT NULL,
  effect_type TEXT NOT NULL,
  attempt_count INTEGER NOT NULL,
  input_json TEXT,
  output_json TEXT,
  error_json TEXT,
  operation_id TEXT NOT NULL,
  descriptor_json TEXT NOT NULL,
  next_attempt_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, step_key),
  UNIQUE (run_id, step_order),
  FOREIGN KEY (run_id) REFERENCES workflow_runs(run_id)
);
CREATE TABLE step_attempts (
  attempt_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_key TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  execution_target TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('STARTED','COMPLETED','FAILED','INTERRUPTED','CANCELLED')),
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  error_json TEXT,
  UNIQUE (run_id, step_key, attempt_number),
  FOREIGN KEY (run_id, step_key) REFERENCES workflow_steps(run_id, step_key)
);
CREATE TABLE workflow_events (
  event_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (run_id, sequence),
  FOREIGN KEY (run_id) REFERENCES workflow_runs(run_id)
);
CREATE TABLE outbox (
  message_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_key TEXT NOT NULL,
  operation_id TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','delivered','failed')),
  attempt_count INTEGER NOT NULL,
  next_attempt_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (run_id) REFERENCES workflow_runs(run_id)
);
CREATE TABLE artifacts (
  artifact_id TEXT PRIMARY KEY,
  local_uri TEXT NOT NULL,
  remote_reference TEXT,
  content_hash TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE delegations (
  run_id TEXT NOT NULL,
  step_key TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  remote_agent TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  transport_id TEXT NOT NULL,
  input_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN (
    'QUEUED','SUBMITTING','ACCEPTED','WORKING','INPUT_REQUIRED','COMPLETED','FAILED','CANCELLED','UNKNOWN_OUTCOME')),
  task_id TEXT,
  result_json TEXT,
  cap_dedupe INTEGER NOT NULL,
  cap_lookup INTEGER NOT NULL,
  cap_task INTEGER NOT NULL,
  cap_poll INTEGER NOT NULL,
  cap_cancel INTEGER NOT NULL,
  cap_persistent INTEGER NOT NULL,
  poll_interval_ms INTEGER NOT NULL,
  poll_epoch INTEGER NOT NULL,
  poll_inflight INTEGER NOT NULL,
  poll_failures INTEGER NOT NULL,
  cancel_intent INTEGER NOT NULL,
  inflight_action TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  context_id TEXT,
  remote_status TEXT,
  continuation_json TEXT,
  remote_identity TEXT,
  remote_message TEXT,
  PRIMARY KEY (run_id, step_key),
  UNIQUE (run_id, operation_id),
  FOREIGN KEY (run_id, step_key) REFERENCES workflow_steps(run_id, step_key)
);
CREATE INDEX idx_workflow_runs_status ON workflow_runs(status);
CREATE INDEX idx_workflow_events_run ON workflow_events(run_id, sequence);
)SQL";

const char* kDelegationTable = R"SQL(
CREATE TABLE delegations (
  run_id TEXT NOT NULL,
  step_key TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  remote_agent TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  transport_id TEXT NOT NULL,
  input_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN (
    'QUEUED','SUBMITTING','ACCEPTED','WORKING','INPUT_REQUIRED','COMPLETED','FAILED','CANCELLED','UNKNOWN_OUTCOME')),
  task_id TEXT,
  result_json TEXT,
  cap_dedupe INTEGER NOT NULL,
  cap_lookup INTEGER NOT NULL,
  cap_task INTEGER NOT NULL,
  cap_poll INTEGER NOT NULL,
  cap_cancel INTEGER NOT NULL,
  cap_persistent INTEGER NOT NULL,
  poll_interval_ms INTEGER NOT NULL,
  poll_epoch INTEGER NOT NULL,
  poll_inflight INTEGER NOT NULL,
  poll_failures INTEGER NOT NULL,
  cancel_intent INTEGER NOT NULL,
  inflight_action TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, step_key),
  UNIQUE (run_id, operation_id),
  FOREIGN KEY (run_id, step_key) REFERENCES workflow_steps(run_id, step_key)
);
)SQL";

Status read_int(sqlite3* db, const char* sql, int64_t& out, bool& found) {
  sqlite3_stmt* raw = nullptr;
  if (sqlite3_prepare_v2(db, sql, -1, &raw, nullptr) != SQLITE_OK) {
    return storage(sqlite3_errmsg(db));
  }
  Statement stmt(raw);
  const int rc = sqlite3_step(stmt.get());
  if (rc == SQLITE_ROW) {
    out = sqlite3_column_int64(stmt.get(), 0);
    found = true;
    return Status::success();
  }
  if (rc != SQLITE_DONE) {
    return storage(sqlite3_errmsg(db));
  }
  found = false;
  return Status::success();
}

Status schema_version(sqlite3* db, int32_t& version) {
  bool found = false;
  int64_t value = 0;
  if (auto status = read_int(
          db, "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'", value, found);
      !status.ok()) {
    return status;
  }
  if (!found) {
    version = 0;
    return Status::success();
  }
  found = false;
  if (auto status =
          read_int(db, "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1", value, found);
      !status.ok()) {
    return status;
  }
  version = found ? static_cast<int32_t>(value) : 0;
  return Status::success();
}

Status add_delegation_identity_columns(sqlite3* db) {
  const char* statements[] = {
      "ALTER TABLE delegations ADD COLUMN context_id TEXT",
      "ALTER TABLE delegations ADD COLUMN remote_status TEXT",
      "ALTER TABLE delegations ADD COLUMN continuation_json TEXT",
      "ALTER TABLE delegations ADD COLUMN remote_identity TEXT",
      "ALTER TABLE delegations ADD COLUMN remote_message TEXT",
  };
  for (const char* statement : statements) {
    if (auto status = exec_sql(db, statement); !status.ok()) {
      return status;
    }
  }
  return Status::success();
}

Status bind_delete(sqlite3* db, const char* sql, const std::string& run_id) {
  sqlite3_stmt* raw = nullptr;
  if (sqlite3_prepare_v2(db, sql, -1, &raw, nullptr) != SQLITE_OK) {
    return storage(sqlite3_errmsg(db));
  }
  Statement stmt(raw);
  bind_text(stmt.get(), 1, run_id);
  return step_done(stmt.get(), db);
}

}  // namespace

Store::Store(sqlite3* db, bool exclusive) : db_(db), exclusive_(exclusive) {}

Store::~Store() {
  if (db_ != nullptr) {
    sqlite3_close(db_);
  }
}

Status Store::open(const std::string& path, bool exclusive, std::unique_ptr<Store>& out) {
  if (path.empty()) {
    return Status::fail(Code::InvalidArgument, "Database path is empty.");
  }
  sqlite3* db = nullptr;
  if (sqlite3_open_v2(path.c_str(), &db, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX,
                      nullptr) != SQLITE_OK) {
    std::string message = db != nullptr ? sqlite3_errmsg(db) : "SQLite open failed.";
    if (db != nullptr) {
      sqlite3_close(db);
    }
    return storage(std::move(message));
  }
  auto store = std::unique_ptr<Store>(new Store(db, exclusive));
  if (auto status = store->migrate(); !status.ok()) {
    return status;
  }
  out = std::move(store);
  return Status::success();
}

Status Store::migrate() {
  if (auto status = exec_sql(db_, "PRAGMA foreign_keys = ON;"); !status.ok()) {
    return status;
  }
  if (auto status = exec_sql(db_, "PRAGMA busy_timeout = 5000;"); !status.ok()) {
    return status;
  }
  if (auto status = exec_sql(db_, "PRAGMA synchronous = NORMAL;"); !status.ok()) {
    return status;
  }

  bool found = false;
  int64_t application_id = 0;
  if (auto status = read_int(db_, "PRAGMA application_id", application_id, found); !status.ok()) {
    return status;
  }
  if (!found) {
    return storage("SQLite did not report an application_id.");
  }
  int64_t objects = 0;
  if (auto status = read_int(db_, "SELECT 1 FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' LIMIT 1", objects,
                             found);
      !status.ok()) {
    return status;
  }
  const bool fresh = application_id == 0 && !(found && objects == 1);
  if (application_id != kApplicationId && !fresh) {
    return storage(
        "This SQLite file was not created by this LarkX runtime. "
        "It was not migrated and it was not deleted. Open a new database file.");
  }

  if (fresh) {
    Transaction tx(db_);
    if (auto status = tx.begin(); !status.ok()) {
      return status;
    }
    const std::string identity = "PRAGMA application_id = " + std::to_string(kApplicationId) + ";";
    if (auto status = exec_sql(db_, identity.c_str()); !status.ok()) {
      return status;
    }
    if (auto status = exec_sql(db_,
                               "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, "
                               "applied_at INTEGER NOT NULL);");
        !status.ok()) {
      return status;
    }
    if (auto status = exec_sql(db_, kSchema); !status.ok()) {
      return status;
    }
    sqlite3_stmt* insert = nullptr;
    if (sqlite3_prepare_v2(db_, "INSERT INTO schema_migrations (version, applied_at) VALUES (3, ?)", -1, &insert,
                           nullptr) != SQLITE_OK) {
      return storage(sqlite3_errmsg(db_));
    }
    Statement insert_stmt(insert);
    sqlite3_bind_int64(insert_stmt.get(), 1, 0);
    if (auto status = step_done(insert_stmt.get(), db_); !status.ok()) {
      return status;
    }
    if (auto status = tx.commit(); !status.ok()) {
      return status;
    }
  } else {
    int32_t version = 0;
    if (auto status = schema_version(db_, version); !status.ok()) {
      return status;
    }
    if (version > 3) {
      return storage("Database schema " + std::to_string(version) + " is newer than storage schema 3.");
    }
    if (version == 1) {
      Transaction tx(db_);
      if (auto status = tx.begin(); !status.ok()) {
        return status;
      }
      if (auto status = exec_sql(db_, kDelegationTable); !status.ok()) {
        return status;
      }
      if (auto status = add_delegation_identity_columns(db_); !status.ok()) {
        return status;
      }
      sqlite3_stmt* upgrade = nullptr;
      if (sqlite3_prepare_v2(db_, "INSERT INTO schema_migrations (version, applied_at) VALUES (3, ?)", -1, &upgrade,
                             nullptr) != SQLITE_OK) {
        return storage(sqlite3_errmsg(db_));
      }
      Statement upgrade_stmt(upgrade);
      sqlite3_bind_int64(upgrade_stmt.get(), 1, 0);
      if (auto status = step_done(upgrade_stmt.get(), db_); !status.ok()) {
        return status;
      }
      if (auto status = tx.commit(); !status.ok()) {
        return status;
      }
      version = 3;
    }
    if (version == 2) {
      Transaction tx(db_);
      if (auto status = tx.begin(); !status.ok()) {
        return status;
      }
      if (auto status = add_delegation_identity_columns(db_); !status.ok()) {
        return status;
      }
      sqlite3_stmt* upgrade = nullptr;
      if (sqlite3_prepare_v2(db_, "INSERT INTO schema_migrations (version, applied_at) VALUES (3, ?)", -1, &upgrade,
                             nullptr) != SQLITE_OK) {
        return storage(sqlite3_errmsg(db_));
      }
      Statement upgrade_stmt(upgrade);
      sqlite3_bind_int64(upgrade_stmt.get(), 1, 0);
      if (auto status = step_done(upgrade_stmt.get(), db_); !status.ok()) {
        return status;
      }
      if (auto status = tx.commit(); !status.ok()) {
        return status;
      }
      version = 3;
    }
    if (version != 3) {
      return storage(
          "This LarkX database is not storage schema 3. "
          "It was not migrated and it was not deleted. Open a new database file.");
    }
  }
  exec_sql(db_, "PRAGMA journal_mode = WAL;");
  return Status::success();
}

Status Store::load_unlocked(const std::string& run_id, std::optional<State>& out) {
  sqlite3_stmt* raw = nullptr;
  if (sqlite3_prepare_v2(db_,
                         "SELECT run_id, workflow_name, workflow_version, input_json, status, output_json, "
                         "error_json, blocked_reason, created_at, updated_at, owner_id, ownership_epoch, "
                         "lease_expires_at, protocol_version, data_policy, cancel_requested "
                         "FROM workflow_runs WHERE run_id = ?",
                         -1, &raw, nullptr) != SQLITE_OK) {
    return storage(sqlite3_errmsg(db_));
  }
  Statement query(raw);
  bind_text(query.get(), 1, run_id);
  const int rc = sqlite3_step(query.get());
  if (rc == SQLITE_DONE) {
    out = std::nullopt;
    return Status::success();
  }
  if (rc != SQLITE_ROW) {
    return storage(sqlite3_errmsg(db_));
  }
  State state;
  state.run.run_id = column_text(query.get(), 0);
  state.run.workflow_name = column_text(query.get(), 1);
  state.run.workflow_version = static_cast<int32_t>(sqlite3_column_int64(query.get(), 2));
  state.run.input_json = column_text(query.get(), 3);
  if (!parse_workflow_status(column_text(query.get(), 4), state.run.status)) {
    return storage("Stored workflow status is invalid.");
  }
  state.run.output_json = column_optional_text(query.get(), 5);
  state.run.error_json = column_optional_text(query.get(), 6);
  state.run.blocked_reason = column_optional_text(query.get(), 7);
  state.run.created_at = sqlite3_column_int64(query.get(), 8);
  state.run.updated_at = sqlite3_column_int64(query.get(), 9);
  state.run.owner_id = column_optional_text(query.get(), 10);
  state.run.ownership_epoch = sqlite3_column_int64(query.get(), 11);
  state.run.lease_expires_at = column_optional_int(query.get(), 12);
  state.run.protocol_version = static_cast<int32_t>(sqlite3_column_int64(query.get(), 13));
  if (!parse_data_policy(column_text(query.get(), 14), state.run.data_policy)) {
    return storage("Stored data policy is invalid.");
  }
  state.run.cancel_requested = sqlite3_column_int64(query.get(), 15) != 0;

  auto load_steps = [&]() -> Status {
    sqlite3_stmt* step_raw = nullptr;
    if (sqlite3_prepare_v2(db_,
                           "SELECT run_id, step_key, step_order, status, execution_target, selected_target, "
                           "effect_type, attempt_count, input_json, output_json, error_json, operation_id, "
                           "descriptor_json, next_attempt_at, created_at, updated_at FROM workflow_steps "
                           "WHERE run_id = ? ORDER BY step_order ASC",
                           -1, &step_raw, nullptr) != SQLITE_OK) {
      return storage(sqlite3_errmsg(db_));
    }
    Statement steps(step_raw);
    bind_text(steps.get(), 1, run_id);
    while (true) {
      const int step_rc = sqlite3_step(steps.get());
      if (step_rc == SQLITE_DONE) {
        return Status::success();
      }
      if (step_rc != SQLITE_ROW) {
        return storage(sqlite3_errmsg(db_));
      }
      Step step;
      step.run_id = column_text(steps.get(), 0);
      step.step_key = column_text(steps.get(), 1);
      step.step_order = static_cast<int32_t>(sqlite3_column_int64(steps.get(), 2));
      if (!parse_step_status(column_text(steps.get(), 3), step.status) ||
          !parse_execution_target(column_text(steps.get(), 4), step.execution_target) ||
          !parse_selected_target(column_text(steps.get(), 5), step.selected_target) ||
          !parse_effect(column_text(steps.get(), 6), step.effect_type)) {
        return storage("Stored step is invalid.");
      }
      step.attempt_count = static_cast<int32_t>(sqlite3_column_int64(steps.get(), 7));
      step.input_json = column_optional_text(steps.get(), 8);
      step.output_json = column_optional_text(steps.get(), 9);
      step.error_json = column_optional_text(steps.get(), 10);
      step.operation_id = column_text(steps.get(), 11);
      step.descriptor_json = column_text(steps.get(), 12);
      step.next_attempt_at = column_optional_int(steps.get(), 13);
      step.created_at = sqlite3_column_int64(steps.get(), 14);
      step.updated_at = sqlite3_column_int64(steps.get(), 15);
      state.steps.push_back(std::move(step));
    }
  };
  if (auto status = load_steps(); !status.ok()) {
    return status;
  }

  auto load_attempts = [&]() -> Status {
    sqlite3_stmt* attempt_raw = nullptr;
    if (sqlite3_prepare_v2(db_,
                           "SELECT attempt_id, run_id, step_key, attempt_number, execution_target, status, "
                           "started_at, completed_at, error_json FROM step_attempts WHERE run_id = ? "
                           "ORDER BY attempt_number ASC, attempt_id ASC",
                           -1, &attempt_raw, nullptr) != SQLITE_OK) {
      return storage(sqlite3_errmsg(db_));
    }
    Statement attempts(attempt_raw);
    bind_text(attempts.get(), 1, run_id);
    while (true) {
      const int attempt_rc = sqlite3_step(attempts.get());
      if (attempt_rc == SQLITE_DONE) {
        return Status::success();
      }
      if (attempt_rc != SQLITE_ROW) {
        return storage(sqlite3_errmsg(db_));
      }
      Attempt attempt;
      attempt.attempt_id = column_text(attempts.get(), 0);
      attempt.run_id = column_text(attempts.get(), 1);
      attempt.step_key = column_text(attempts.get(), 2);
      attempt.attempt_number = static_cast<int32_t>(sqlite3_column_int64(attempts.get(), 3));
      if (!parse_selected_target(column_text(attempts.get(), 4), attempt.execution_target) ||
          !parse_attempt_status(column_text(attempts.get(), 5), attempt.status)) {
        return storage("Stored attempt is invalid.");
      }
      attempt.started_at = sqlite3_column_int64(attempts.get(), 6);
      attempt.completed_at = column_optional_int(attempts.get(), 7);
      attempt.error_json = column_optional_text(attempts.get(), 8);
      state.attempts.push_back(std::move(attempt));
    }
  };
  if (auto status = load_attempts(); !status.ok()) {
    return status;
  }

  auto load_events = [&]() -> Status {
    sqlite3_stmt* event_raw = nullptr;
    if (sqlite3_prepare_v2(db_,
                           "SELECT event_id, run_id, sequence, event_type, payload_json, created_at "
                           "FROM workflow_events WHERE run_id = ? ORDER BY sequence ASC",
                           -1, &event_raw, nullptr) != SQLITE_OK) {
      return storage(sqlite3_errmsg(db_));
    }
    Statement events(event_raw);
    bind_text(events.get(), 1, run_id);
    while (true) {
      const int event_rc = sqlite3_step(events.get());
      if (event_rc == SQLITE_DONE) {
        return Status::success();
      }
      if (event_rc != SQLITE_ROW) {
        return storage(sqlite3_errmsg(db_));
      }
      Event event;
      event.event_id = column_text(events.get(), 0);
      event.run_id = column_text(events.get(), 1);
      event.sequence = sqlite3_column_int64(events.get(), 2);
      event.type = column_text(events.get(), 3);
      event.payload_json = column_text(events.get(), 4);
      event.created_at = sqlite3_column_int64(events.get(), 5);
      if (!state.events.empty() && event.sequence != state.events.back().sequence + 1) {
        return storage("Event sequence is not contiguous.");
      }
      state.events.push_back(std::move(event));
    }
  };
  if (auto status = load_events(); !status.ok()) {
    return status;
  }

  sqlite3_stmt* outbox_raw = nullptr;
  if (sqlite3_prepare_v2(db_,
                         "SELECT message_id, run_id, step_key, operation_id, payload_json, status, "
                         "attempt_count, next_attempt_at, created_at, updated_at FROM outbox "
                         "WHERE run_id = ? ORDER BY created_at ASC, message_id ASC",
                         -1, &outbox_raw, nullptr) != SQLITE_OK) {
    return storage(sqlite3_errmsg(db_));
  }
  Statement messages(outbox_raw);
  bind_text(messages.get(), 1, run_id);
  while (true) {
    const int message_rc = sqlite3_step(messages.get());
    if (message_rc == SQLITE_DONE) {
      break;
    }
    if (message_rc != SQLITE_ROW) {
      return storage(sqlite3_errmsg(db_));
    }
    OutboxMessage message;
    message.message_id = column_text(messages.get(), 0);
    message.run_id = column_text(messages.get(), 1);
    message.step_key = column_text(messages.get(), 2);
    message.operation_id = column_text(messages.get(), 3);
    message.payload_json = column_text(messages.get(), 4);
    if (!parse_outbox_status(column_text(messages.get(), 5), message.status)) {
      return storage("Stored outbox status is invalid.");
    }
    message.attempt_count = static_cast<int32_t>(sqlite3_column_int64(messages.get(), 6));
    message.next_attempt_at = column_optional_int(messages.get(), 7);
    message.created_at = sqlite3_column_int64(messages.get(), 8);
    message.updated_at = sqlite3_column_int64(messages.get(), 9);
    state.outbox.push_back(std::move(message));
  }

  sqlite3_stmt* delegation_raw = nullptr;
  if (sqlite3_prepare_v2(db_,
                         "SELECT run_id, step_key, operation_id, remote_agent, endpoint, transport_id, input_json, "
                         "state, task_id, result_json, cap_dedupe, cap_lookup, cap_task, cap_poll, cap_cancel, "
                         "cap_persistent, poll_interval_ms, poll_epoch, poll_inflight, poll_failures, cancel_intent, "
                         "inflight_action, created_at, updated_at, context_id, remote_status, continuation_json, "
                         "remote_identity, remote_message FROM delegations WHERE run_id = ? "
                         "ORDER BY created_at ASC, step_key ASC",
                         -1, &delegation_raw, nullptr) != SQLITE_OK) {
    return storage(sqlite3_errmsg(db_));
  }
  Statement delegations(delegation_raw);
  bind_text(delegations.get(), 1, run_id);
  while (true) {
    const int delegation_rc = sqlite3_step(delegations.get());
    if (delegation_rc == SQLITE_DONE) {
      break;
    }
    if (delegation_rc != SQLITE_ROW) {
      return storage(sqlite3_errmsg(db_));
    }
    Delegation row;
    row.run_id = column_text(delegations.get(), 0);
    row.step_key = column_text(delegations.get(), 1);
    row.operation_id = column_text(delegations.get(), 2);
    row.remote_agent = column_text(delegations.get(), 3);
    row.endpoint = column_text(delegations.get(), 4);
    row.transport_id = column_text(delegations.get(), 5);
    row.input_json = column_text(delegations.get(), 6);
    if (!parse_delegation_state(column_text(delegations.get(), 7), row.state)) {
      return storage("Stored delegation state is invalid.");
    }
    row.task_id = column_optional_text(delegations.get(), 8);
    row.result_json = column_optional_text(delegations.get(), 9);
    row.capabilities.dedupe = sqlite3_column_int64(delegations.get(), 10) != 0;
    row.capabilities.lookup = sqlite3_column_int64(delegations.get(), 11) != 0;
    row.capabilities.durable_task = sqlite3_column_int64(delegations.get(), 12) != 0;
    row.capabilities.poll = sqlite3_column_int64(delegations.get(), 13) != 0;
    row.capabilities.cancel = sqlite3_column_int64(delegations.get(), 14) != 0;
    row.capabilities.persistent = sqlite3_column_int64(delegations.get(), 15) != 0;
    row.poll_interval_ms = sqlite3_column_int64(delegations.get(), 16);
    row.poll_epoch = static_cast<int32_t>(sqlite3_column_int64(delegations.get(), 17));
    row.poll_inflight = sqlite3_column_int64(delegations.get(), 18) != 0;
    row.poll_failures = static_cast<int32_t>(sqlite3_column_int64(delegations.get(), 19));
    row.cancel_intent = sqlite3_column_int64(delegations.get(), 20) != 0;
    row.inflight_action = column_text(delegations.get(), 21);
    row.created_at = sqlite3_column_int64(delegations.get(), 22);
    row.updated_at = sqlite3_column_int64(delegations.get(), 23);
    row.context_id = column_optional_text(delegations.get(), 24);
    row.remote_status = column_optional_text(delegations.get(), 25);
    row.continuation_json = column_optional_text(delegations.get(), 26);
    row.remote_identity = column_optional_text(delegations.get(), 27);
    row.remote_message = column_optional_text(delegations.get(), 28);
    state.delegations.push_back(std::move(row));
  }
  out = std::move(state);
  return Status::success();
}

Status Store::require(const std::string& run_id, State& out) {
  std::optional<State> loaded;
  if (auto status = load_unlocked(run_id, loaded); !status.ok()) {
    return status;
  }
  if (!loaded.has_value()) {
    return Status::fail(Code::NotFound, "Run " + run_id + " does not exist.");
  }
  out = std::move(*loaded);
  return Status::success();
}

Status Store::persist(const State& before, const State& after) {
  if (after.events.size() < before.events.size()) {
    return storage("Event history was truncated.");
  }
  for (size_t index = 0; index < before.events.size(); index += 1) {
    if (before.events[index].event_id != after.events[index].event_id ||
        before.events[index].sequence != after.events[index].sequence) {
      return storage("Event history was rewritten.");
    }
  }
  sqlite3_stmt* update = nullptr;
  if (sqlite3_prepare_v2(db_,
                         "UPDATE workflow_runs SET workflow_name = ?, workflow_version = ?, input_json = ?, "
                         "status = ?, output_json = ?, error_json = ?, blocked_reason = ?, created_at = ?, "
                         "updated_at = ?, owner_id = ?, ownership_epoch = ?, lease_expires_at = ?, "
                         "protocol_version = ?, data_policy = ?, cancel_requested = ? WHERE run_id = ?",
                         -1, &update, nullptr) != SQLITE_OK) {
    return storage(sqlite3_errmsg(db_));
  }
  Statement update_stmt(update);
  const Run& run = after.run;
  bind_text(update_stmt.get(), 1, run.workflow_name);
  sqlite3_bind_int64(update_stmt.get(), 2, run.workflow_version);
  bind_text(update_stmt.get(), 3, run.input_json);
  bind_text(update_stmt.get(), 4, to_string(run.status));
  bind_optional_text(update_stmt.get(), 5, run.output_json);
  bind_optional_text(update_stmt.get(), 6, run.error_json);
  bind_optional_text(update_stmt.get(), 7, run.blocked_reason);
  sqlite3_bind_int64(update_stmt.get(), 8, run.created_at);
  sqlite3_bind_int64(update_stmt.get(), 9, run.updated_at);
  bind_optional_text(update_stmt.get(), 10, run.owner_id);
  sqlite3_bind_int64(update_stmt.get(), 11, run.ownership_epoch);
  bind_optional_int(update_stmt.get(), 12, run.lease_expires_at);
  sqlite3_bind_int64(update_stmt.get(), 13, run.protocol_version);
  bind_text(update_stmt.get(), 14, to_string(run.data_policy));
  sqlite3_bind_int64(update_stmt.get(), 15, run.cancel_requested ? 1 : 0);
  bind_text(update_stmt.get(), 16, run.run_id);
  if (auto status = step_done(update_stmt.get(), db_); !status.ok()) {
    return status;
  }
  if (sqlite3_changes(db_) != 1) {
    return storage("Failed to update run " + run.run_id + ".");
  }
  if (auto status = bind_delete(db_, "DELETE FROM delegations WHERE run_id = ?", run.run_id); !status.ok()) {
    return status;
  }
  if (auto status = bind_delete(db_, "DELETE FROM step_attempts WHERE run_id = ?", run.run_id); !status.ok()) {
    return status;
  }
  if (auto status = bind_delete(db_, "DELETE FROM outbox WHERE run_id = ?", run.run_id); !status.ok()) {
    return status;
  }
  if (auto status = bind_delete(db_, "DELETE FROM workflow_steps WHERE run_id = ?", run.run_id); !status.ok()) {
    return status;
  }
  for (const auto& step : after.steps) {
    sqlite3_stmt* raw = nullptr;
    if (sqlite3_prepare_v2(db_,
                           "INSERT INTO workflow_steps (run_id, step_key, step_order, status, execution_target, "
                           "selected_target, effect_type, attempt_count, input_json, output_json, error_json, "
                           "operation_id, descriptor_json, next_attempt_at, created_at, updated_at) "
                           "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                           -1, &raw, nullptr) != SQLITE_OK) {
      return storage(sqlite3_errmsg(db_));
    }
    Statement stmt(raw);
    bind_text(stmt.get(), 1, step.run_id);
    bind_text(stmt.get(), 2, step.step_key);
    sqlite3_bind_int64(stmt.get(), 3, step.step_order);
    bind_text(stmt.get(), 4, to_string(step.status));
    bind_text(stmt.get(), 5, to_string(step.execution_target));
    bind_text(stmt.get(), 6, to_string(step.selected_target));
    bind_text(stmt.get(), 7, to_string(step.effect_type));
    sqlite3_bind_int64(stmt.get(), 8, step.attempt_count);
    bind_optional_text(stmt.get(), 9, step.input_json);
    bind_optional_text(stmt.get(), 10, step.output_json);
    bind_optional_text(stmt.get(), 11, step.error_json);
    bind_text(stmt.get(), 12, step.operation_id);
    bind_text(stmt.get(), 13, step.descriptor_json);
    bind_optional_int(stmt.get(), 14, step.next_attempt_at);
    sqlite3_bind_int64(stmt.get(), 15, step.created_at);
    sqlite3_bind_int64(stmt.get(), 16, step.updated_at);
    if (auto status = step_done(stmt.get(), db_); !status.ok()) {
      return status;
    }
  }
  for (const auto& attempt : after.attempts) {
    sqlite3_stmt* raw = nullptr;
    if (sqlite3_prepare_v2(db_,
                           "INSERT INTO step_attempts (attempt_id, run_id, step_key, attempt_number, "
                           "execution_target, status, started_at, completed_at, error_json) "
                           "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                           -1, &raw, nullptr) != SQLITE_OK) {
      return storage(sqlite3_errmsg(db_));
    }
    Statement stmt(raw);
    bind_text(stmt.get(), 1, attempt.attempt_id);
    bind_text(stmt.get(), 2, attempt.run_id);
    bind_text(stmt.get(), 3, attempt.step_key);
    sqlite3_bind_int64(stmt.get(), 4, attempt.attempt_number);
    bind_text(stmt.get(), 5, to_string(attempt.execution_target));
    bind_text(stmt.get(), 6, to_string(attempt.status));
    sqlite3_bind_int64(stmt.get(), 7, attempt.started_at);
    bind_optional_int(stmt.get(), 8, attempt.completed_at);
    bind_optional_text(stmt.get(), 9, attempt.error_json);
    if (auto status = step_done(stmt.get(), db_); !status.ok()) {
      return status;
    }
  }
  for (size_t index = before.events.size(); index < after.events.size(); index += 1) {
    const auto& event = after.events[index];
    sqlite3_stmt* raw = nullptr;
    if (sqlite3_prepare_v2(db_,
                           "INSERT INTO workflow_events (event_id, run_id, sequence, event_type, payload_json, "
                           "created_at) VALUES (?, ?, ?, ?, ?, ?)",
                           -1, &raw, nullptr) != SQLITE_OK) {
      return storage(sqlite3_errmsg(db_));
    }
    Statement stmt(raw);
    bind_text(stmt.get(), 1, event.event_id);
    bind_text(stmt.get(), 2, event.run_id);
    sqlite3_bind_int64(stmt.get(), 3, event.sequence);
    bind_text(stmt.get(), 4, event.type);
    bind_text(stmt.get(), 5, event.payload_json);
    sqlite3_bind_int64(stmt.get(), 6, event.created_at);
    if (auto status = step_done(stmt.get(), db_); !status.ok()) {
      return status;
    }
  }
  for (const auto& message : after.outbox) {
    sqlite3_stmt* raw = nullptr;
    if (sqlite3_prepare_v2(db_,
                           "INSERT INTO outbox (message_id, run_id, step_key, operation_id, payload_json, status, "
                           "attempt_count, next_attempt_at, created_at, updated_at) "
                           "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                           -1, &raw, nullptr) != SQLITE_OK) {
      return storage(sqlite3_errmsg(db_));
    }
    Statement stmt(raw);
    bind_text(stmt.get(), 1, message.message_id);
    bind_text(stmt.get(), 2, message.run_id);
    bind_text(stmt.get(), 3, message.step_key);
    bind_text(stmt.get(), 4, message.operation_id);
    bind_text(stmt.get(), 5, message.payload_json);
    bind_text(stmt.get(), 6, to_string(message.status));
    sqlite3_bind_int64(stmt.get(), 7, message.attempt_count);
    bind_optional_int(stmt.get(), 8, message.next_attempt_at);
    sqlite3_bind_int64(stmt.get(), 9, message.created_at);
    sqlite3_bind_int64(stmt.get(), 10, message.updated_at);
    if (auto status = step_done(stmt.get(), db_); !status.ok()) {
      return status;
    }
  }
  for (const auto& row : after.delegations) {
    sqlite3_stmt* raw = nullptr;
    if (sqlite3_prepare_v2(db_,
                           "INSERT INTO delegations (run_id, step_key, operation_id, remote_agent, endpoint, "
                           "transport_id, input_json, state, task_id, result_json, cap_dedupe, cap_lookup, cap_task, "
                           "cap_poll, cap_cancel, cap_persistent, poll_interval_ms, poll_epoch, poll_inflight, "
                           "poll_failures, cancel_intent, inflight_action, created_at, updated_at, context_id, "
                           "remote_status, continuation_json, remote_identity, remote_message) "
                           "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                           -1, &raw, nullptr) != SQLITE_OK) {
      return storage(sqlite3_errmsg(db_));
    }
    Statement stmt(raw);
    bind_text(stmt.get(), 1, row.run_id);
    bind_text(stmt.get(), 2, row.step_key);
    bind_text(stmt.get(), 3, row.operation_id);
    bind_text(stmt.get(), 4, row.remote_agent);
    bind_text(stmt.get(), 5, row.endpoint);
    bind_text(stmt.get(), 6, row.transport_id);
    bind_text(stmt.get(), 7, row.input_json);
    bind_text(stmt.get(), 8, to_string(row.state));
    bind_optional_text(stmt.get(), 9, row.task_id);
    bind_optional_text(stmt.get(), 10, row.result_json);
    sqlite3_bind_int64(stmt.get(), 11, row.capabilities.dedupe ? 1 : 0);
    sqlite3_bind_int64(stmt.get(), 12, row.capabilities.lookup ? 1 : 0);
    sqlite3_bind_int64(stmt.get(), 13, row.capabilities.durable_task ? 1 : 0);
    sqlite3_bind_int64(stmt.get(), 14, row.capabilities.poll ? 1 : 0);
    sqlite3_bind_int64(stmt.get(), 15, row.capabilities.cancel ? 1 : 0);
    sqlite3_bind_int64(stmt.get(), 16, row.capabilities.persistent ? 1 : 0);
    sqlite3_bind_int64(stmt.get(), 17, row.poll_interval_ms);
    sqlite3_bind_int64(stmt.get(), 18, row.poll_epoch);
    sqlite3_bind_int64(stmt.get(), 19, row.poll_inflight ? 1 : 0);
    sqlite3_bind_int64(stmt.get(), 20, row.poll_failures);
    sqlite3_bind_int64(stmt.get(), 21, row.cancel_intent ? 1 : 0);
    bind_text(stmt.get(), 22, row.inflight_action);
    sqlite3_bind_int64(stmt.get(), 23, row.created_at);
    sqlite3_bind_int64(stmt.get(), 24, row.updated_at);
    bind_optional_text(stmt.get(), 25, row.context_id);
    bind_optional_text(stmt.get(), 26, row.remote_status);
    bind_optional_text(stmt.get(), 27, row.continuation_json);
    bind_optional_text(stmt.get(), 28, row.remote_identity);
    bind_optional_text(stmt.get(), 29, row.remote_message);
    if (auto status = step_done(stmt.get(), db_); !status.ok()) {
      return status;
    }
  }
  return Status::success();
}

Status Store::apply(const std::string& run_id, const std::function<Status(State&)>& fn) {
  return mutate(run_id, [&](State& state) { return fn(state); });
}

Status Store::insert_new_run(const State& state) {
  sqlite3_stmt* raw = nullptr;
  if (sqlite3_prepare_v2(db_,
                         "INSERT INTO workflow_runs (run_id, workflow_name, workflow_version, input_json, status, "
                         "output_json, error_json, blocked_reason, created_at, updated_at, owner_id, "
                         "ownership_epoch, lease_expires_at, protocol_version, data_policy, cancel_requested) "
                         "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                         -1, &raw, nullptr) != SQLITE_OK) {
    return storage(sqlite3_errmsg(db_));
  }
  Statement stmt(raw);
  const Run& run = state.run;
  bind_text(stmt.get(), 1, run.run_id);
  bind_text(stmt.get(), 2, run.workflow_name);
  sqlite3_bind_int64(stmt.get(), 3, run.workflow_version);
  bind_text(stmt.get(), 4, run.input_json);
  bind_text(stmt.get(), 5, to_string(run.status));
  bind_optional_text(stmt.get(), 6, run.output_json);
  bind_optional_text(stmt.get(), 7, run.error_json);
  bind_optional_text(stmt.get(), 8, run.blocked_reason);
  sqlite3_bind_int64(stmt.get(), 9, run.created_at);
  sqlite3_bind_int64(stmt.get(), 10, run.updated_at);
  bind_optional_text(stmt.get(), 11, run.owner_id);
  sqlite3_bind_int64(stmt.get(), 12, run.ownership_epoch);
  bind_optional_int(stmt.get(), 13, run.lease_expires_at);
  sqlite3_bind_int64(stmt.get(), 14, run.protocol_version);
  bind_text(stmt.get(), 15, to_string(run.data_policy));
  sqlite3_bind_int64(stmt.get(), 16, run.cancel_requested ? 1 : 0);
  if (auto status = step_done(stmt.get(), db_); !status.ok()) {
    return status;
  }
  for (const auto& event : state.events) {
    sqlite3_stmt* event_raw = nullptr;
    if (sqlite3_prepare_v2(db_,
                           "INSERT INTO workflow_events (event_id, run_id, sequence, event_type, payload_json, "
                           "created_at) VALUES (?, ?, ?, ?, ?, ?)",
                           -1, &event_raw, nullptr) != SQLITE_OK) {
      return storage(sqlite3_errmsg(db_));
    }
    Statement event_stmt(event_raw);
    bind_text(event_stmt.get(), 1, event.event_id);
    bind_text(event_stmt.get(), 2, event.run_id);
    sqlite3_bind_int64(event_stmt.get(), 3, event.sequence);
    bind_text(event_stmt.get(), 4, event.type);
    bind_text(event_stmt.get(), 5, event.payload_json);
    sqlite3_bind_int64(event_stmt.get(), 6, event.created_at);
    if (auto status = step_done(event_stmt.get(), db_); !status.ok()) {
      return status;
    }
  }
  return Status::success();
}

template <typename Fn>
Status Store::mutate(const std::string& run_id, Fn&& fn) {
  std::lock_guard<std::recursive_mutex> lock(mutex_);
  Transaction tx(db_);
  if (auto status = tx.begin(); !status.ok()) {
    return status;
  }
  State before;
  if (auto status = require(run_id, before); !status.ok()) {
    return status;
  }
  State next = before;
  if (auto status = fn(next); !status.ok()) {
    return status;
  }
  if (auto status = persist(before, next); !status.ok()) {
    return status;
  }
  return tx.commit();
}

Status Store::create_run(const CreateRunInput& input, bool& created) {
  std::lock_guard<std::recursive_mutex> lock(mutex_);
  Transaction tx(db_);
  if (auto status = tx.begin(); !status.ok()) {
    return status;
  }
  std::optional<State> existing;
  if (auto status = load_unlocked(input.run_id, existing); !status.ok()) {
    return status;
  }
  auto outcome = larkx::create_run(existing.has_value() ? &existing.value() : nullptr, input);
  if (!outcome.status.ok()) {
    return outcome.status;
  }
  created = outcome.created;
  if (outcome.created) {
    if (auto status = insert_new_run(outcome.state); !status.ok()) {
      return status;
    }
  }
  return tx.commit();
}

Status Store::load_run(const std::string& run_id, std::optional<Run>& out) {
  std::lock_guard<std::recursive_mutex> lock(mutex_);
  Transaction tx(db_);
  if (auto status = tx.begin(); !status.ok()) {
    return status;
  }
  std::optional<State> state;
  if (auto status = load_unlocked(run_id, state); !status.ok()) {
    return status;
  }
  if (auto status = tx.commit(); !status.ok()) {
    return status;
  }
  if (!state.has_value()) {
    out = std::nullopt;
    return Status::success();
  }
  out = state->run;
  return Status::success();
}

Status Store::load_state(const std::string& run_id, std::optional<State>& out) {
  std::lock_guard<std::recursive_mutex> lock(mutex_);
  Transaction tx(db_);
  if (auto status = tx.begin(); !status.ok()) {
    return status;
  }
  if (auto status = load_unlocked(run_id, out); !status.ok()) {
    return status;
  }
  return tx.commit();
}

Status Store::compatible(const std::string& run_id, const std::string& workflow_name, int32_t workflow_version,
                         const std::string& input_json) {
  std::string canonical;
  if (auto status = validate_json_text(input_json, false, canonical); !status.ok()) {
    return status;
  }
  std::optional<Run> run;
  if (auto status = load_run(run_id, run); !status.ok()) {
    return status;
  }
  if (!run.has_value()) {
    return Status::fail(Code::NotFound, "Run " + run_id + " does not exist.");
  }
  if (run->workflow_name != workflow_name || run->workflow_version != workflow_version || run->input_json != canonical) {
    return Status::fail(Code::State, "Run " + run_id + " does not match this workflow name, version, and input.");
  }
  return Status::success();
}

Status Store::request_cancel(const std::string& run_id, int64_t now_ms) {
  return mutate(run_id, [&](State& state) { return larkx::request_cancel(state, now_ms); });
}

Status Store::transition_run(const TransitionInput& input, const std::string& run_id) {
  return mutate(run_id, [&](State& state) { return larkx::transition_run(state, input); });
}

Status Store::claim(const std::string& run_id, const ClaimInput& input, ClaimOutcome& out) {
  std::lock_guard<std::recursive_mutex> lock(mutex_);
  Transaction tx(db_);
  if (auto status = tx.begin(); !status.ok()) {
    return status;
  }
  State before;
  if (auto status = require(run_id, before); !status.ok()) {
    return status;
  }
  ClaimInput claim_input = input;
  claim_input.exclusive = exclusive_;
  out = claim_ownership(before, claim_input);
  if (!out.status.ok()) {
    return out.status;
  }
  if (auto status = persist(before, out.state); !status.ok()) {
    return status;
  }
  return tx.commit();
}

Status Store::renew(const std::string& run_id, const Fence& fence, int64_t now_ms, int64_t lease_ms, bool& renewed) {
  return mutate(run_id, [&](State& state) { return renew_ownership(state, fence, now_ms, lease_ms, renewed); });
}

Status Store::release(const std::string& run_id, const Fence& fence, int64_t now_ms, bool& released) {
  return mutate(run_id, [&](State& state) { return release_ownership(state, fence, now_ms, released); });
}

Status Store::begin_step(const BeginStepInput& input, const std::string& run_id) {
  return mutate(run_id, [&](State& state) { return larkx::begin_step(state, input); });
}

Status Store::commit_step(const CommitStepInput& input, const std::string& run_id) {
  return mutate(run_id, [&](State& state) { return larkx::commit_step(state, input); });
}

Status Store::resolve_step(const ResolveStepInput& input, const std::string& run_id) {
  return mutate(run_id, [&](State& state) { return larkx::resolve_step(state, input); });
}

Status Store::mark_unknown(const MarkUnknownInput& input, const std::string& run_id) {
  return mutate(run_id, [&](State& state) { return larkx::mark_unknown(state, input); });
}

Status Store::reconcile(const ReconcileInput& input, const std::string& run_id) {
  return mutate(run_id, [&](State& state) { return reconcile_step(state, input); });
}

Status Store::insert_outbox(const OutboxInput& input, bool& deduplicated, int32_t& count) {
  std::lock_guard<std::recursive_mutex> lock(mutex_);
  Transaction tx(db_);
  if (auto status = tx.begin(); !status.ok()) {
    return status;
  }
  State before;
  if (auto status = require(input.message.run_id, before); !status.ok()) {
    return status;
  }
  State next = before;
  auto outcome = larkx::insert_outbox(next, input);
  if (!outcome.status.ok()) {
    return outcome.status;
  }
  if (auto status = persist(before, next); !status.ok()) {
    return status;
  }
  if (auto status = tx.commit(); !status.ok()) {
    return status;
  }
  deduplicated = outcome.deduplicated;
  count = static_cast<int32_t>(next.outbox.size());
  return Status::success();
}

Status Store::list_runs(std::vector<Run>& out) {
  std::lock_guard<std::recursive_mutex> lock(mutex_);
  out.clear();
  sqlite3_stmt* raw = nullptr;
  if (sqlite3_prepare_v2(db_,
                         "SELECT run_id, workflow_name, workflow_version, status, created_at, updated_at, owner_id, "
                         "ownership_epoch, lease_expires_at, protocol_version, data_policy, cancel_requested, "
                         "blocked_reason FROM workflow_runs ORDER BY updated_at ASC, run_id ASC",
                         -1, &raw, nullptr) != SQLITE_OK) {
    return storage(sqlite3_errmsg(db_));
  }
  Statement query(raw);
  while (true) {
    const int rc = sqlite3_step(query.get());
    if (rc == SQLITE_DONE) {
      return Status::success();
    }
    if (rc != SQLITE_ROW) {
      return storage(sqlite3_errmsg(db_));
    }
    Run run;
    run.run_id = column_text(query.get(), 0);
    run.workflow_name = column_text(query.get(), 1);
    run.workflow_version = static_cast<int32_t>(sqlite3_column_int64(query.get(), 2));
    if (!parse_workflow_status(column_text(query.get(), 3), run.status)) {
      return storage("Stored workflow status is invalid.");
    }
    run.created_at = sqlite3_column_int64(query.get(), 4);
    run.updated_at = sqlite3_column_int64(query.get(), 5);
    run.owner_id = column_optional_text(query.get(), 6);
    run.ownership_epoch = sqlite3_column_int64(query.get(), 7);
    run.lease_expires_at = column_optional_int(query.get(), 8);
    run.protocol_version = static_cast<int32_t>(sqlite3_column_int64(query.get(), 9));
    if (!parse_data_policy(column_text(query.get(), 10), run.data_policy)) {
      return storage("Stored data policy is invalid.");
    }
    run.cancel_requested = sqlite3_column_int64(query.get(), 11) != 0;
    run.blocked_reason = column_optional_text(query.get(), 12);
    out.push_back(std::move(run));
  }
}

Status Store::journal_heads(std::vector<JournalHead>& out) {
  std::lock_guard<std::recursive_mutex> lock(mutex_);
  out.clear();
  sqlite3_stmt* raw = nullptr;
  if (sqlite3_prepare_v2(
          db_,
          "SELECT r.run_id, r.updated_at, "
          "IFNULL((SELECT MAX(e.sequence) FROM workflow_events e WHERE e.run_id = r.run_id), 0) "
          "FROM workflow_runs r ORDER BY r.updated_at ASC, r.run_id ASC",
          -1, &raw, nullptr) != SQLITE_OK) {
    return storage(sqlite3_errmsg(db_));
  }
  Statement query(raw);
  while (true) {
    const int rc = sqlite3_step(query.get());
    if (rc == SQLITE_DONE) {
      return Status::success();
    }
    if (rc != SQLITE_ROW) {
      return storage(sqlite3_errmsg(db_));
    }
    JournalHead head;
    head.run_id = column_text(query.get(), 0);
    head.updated_at = sqlite3_column_int64(query.get(), 1);
    head.max_sequence = sqlite3_column_int64(query.get(), 2);
    out.push_back(std::move(head));
  }
}

Status Store::event_page(const std::string& run_id, int64_t after_sequence, int32_t limit, EventPage& out) {
  std::lock_guard<std::recursive_mutex> lock(mutex_);
  out = EventPage{};
  if (after_sequence < 0 || limit < 1 || limit > 500) {
    return Status::fail(Code::InvalidArgument, "Event page bounds are invalid.");
  }
  sqlite3_stmt* run_raw = nullptr;
  if (sqlite3_prepare_v2(
          db_,
          "SELECT run_id, workflow_name, workflow_version, status, created_at, updated_at, "
          "owner_id IS NOT NULL, ownership_epoch, protocol_version, data_policy, cancel_requested, blocked_reason "
          "FROM workflow_runs WHERE run_id = ?",
          -1, &run_raw, nullptr) != SQLITE_OK) {
    return storage(sqlite3_errmsg(db_));
  }
  Statement run_query(run_raw);
  bind_text(run_query.get(), 1, run_id);
  const int run_rc = sqlite3_step(run_query.get());
  if (run_rc == SQLITE_DONE) {
    return Status::fail(Code::NotFound, "Run was not found.");
  }
  if (run_rc != SQLITE_ROW) {
    return storage(sqlite3_errmsg(db_));
  }
  out.found = true;
  out.run.run_id = column_text(run_query.get(), 0);
  out.run.workflow_name = column_text(run_query.get(), 1);
  out.run.workflow_version = static_cast<int32_t>(sqlite3_column_int64(run_query.get(), 2));
  out.run.status = column_text(run_query.get(), 3);
  out.run.created_at = sqlite3_column_int64(run_query.get(), 4);
  out.run.updated_at = sqlite3_column_int64(run_query.get(), 5);
  out.run.has_owner = sqlite3_column_int64(run_query.get(), 6) != 0;
  out.run.ownership_epoch = sqlite3_column_int64(run_query.get(), 7);
  out.run.protocol_version = static_cast<int32_t>(sqlite3_column_int64(run_query.get(), 8));
  out.run.data_policy = column_text(run_query.get(), 9);
  out.run.cancel_requested = sqlite3_column_int64(run_query.get(), 10) != 0;
  if (sqlite3_column_type(run_query.get(), 11) != SQLITE_NULL) {
    out.run.has_blocked_reason = true;
    out.run.blocked_reason = column_text(run_query.get(), 11);
  }

  sqlite3_stmt* max_raw = nullptr;
  if (sqlite3_prepare_v2(db_, "SELECT IFNULL(MAX(sequence), 0) FROM workflow_events WHERE run_id = ?", -1, &max_raw,
                         nullptr) != SQLITE_OK) {
    return storage(sqlite3_errmsg(db_));
  }
  Statement max_query(max_raw);
  bind_text(max_query.get(), 1, run_id);
  if (sqlite3_step(max_query.get()) != SQLITE_ROW) {
    return storage(sqlite3_errmsg(db_));
  }
  out.max_sequence = sqlite3_column_int64(max_query.get(), 0);

  sqlite3_stmt* step_raw = nullptr;
  if (sqlite3_prepare_v2(
          db_,
          "SELECT step_key, step_order, status, execution_target, selected_target, effect_type, attempt_count, "
          "operation_id FROM workflow_steps WHERE run_id = ? ORDER BY step_order ASC",
          -1, &step_raw, nullptr) != SQLITE_OK) {
    return storage(sqlite3_errmsg(db_));
  }
  Statement steps(step_raw);
  bind_text(steps.get(), 1, run_id);
  while (true) {
    const int step_rc = sqlite3_step(steps.get());
    if (step_rc == SQLITE_DONE) {
      break;
    }
    if (step_rc != SQLITE_ROW) {
      return storage(sqlite3_errmsg(db_));
    }
    PageStep step;
    step.step_key = column_text(steps.get(), 0);
    step.step_order = static_cast<int32_t>(sqlite3_column_int64(steps.get(), 1));
    step.status = column_text(steps.get(), 2);
    step.execution_target = column_text(steps.get(), 3);
    step.selected_target = column_text(steps.get(), 4);
    step.effect_type = column_text(steps.get(), 5);
    step.attempt_count = static_cast<int32_t>(sqlite3_column_int64(steps.get(), 6));
    step.operation_id = column_text(steps.get(), 7);
    out.steps.push_back(std::move(step));
  }

  sqlite3_stmt* event_raw = nullptr;
  if (sqlite3_prepare_v2(
          db_,
          "SELECT event_id, sequence, event_type, payload_json, created_at FROM workflow_events "
          "WHERE run_id = ? AND sequence > ? ORDER BY sequence ASC LIMIT ?",
          -1, &event_raw, nullptr) != SQLITE_OK) {
    return storage(sqlite3_errmsg(db_));
  }
  Statement events(event_raw);
  bind_text(events.get(), 1, run_id);
  sqlite3_bind_int64(events.get(), 2, after_sequence);
  sqlite3_bind_int(events.get(), 3, limit);
  while (true) {
    const int event_rc = sqlite3_step(events.get());
    if (event_rc == SQLITE_DONE) {
      return Status::success();
    }
    if (event_rc != SQLITE_ROW) {
      return storage(sqlite3_errmsg(db_));
    }
    PageEvent event;
    event.event_id = column_text(events.get(), 0);
    event.sequence = sqlite3_column_int64(events.get(), 1);
    event.type = column_text(events.get(), 2);
    event.payload_json = column_text(events.get(), 3);
    event.created_at = sqlite3_column_int64(events.get(), 4);
    out.events.push_back(std::move(event));
  }
}

}  // namespace larkx
