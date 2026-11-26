#pragma once

#include "larkx/core.hpp"

#include <functional>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <vector>

struct sqlite3;

namespace larkx {

/** Run id, update time, and the highest committed sequence. No event payloads. */
struct JournalHead {
  std::string run_id;
  int64_t updated_at = 0;
  int64_t max_sequence = 0;
};

struct PageRun {
  std::string run_id;
  std::string workflow_name;
  int32_t workflow_version = 0;
  std::string status;
  int64_t created_at = 0;
  int64_t updated_at = 0;
  int64_t ownership_epoch = 0;
  int32_t protocol_version = 1;
  std::string data_policy;
  bool cancel_requested = false;
  bool has_owner = false;
  bool has_blocked_reason = false;
  std::string blocked_reason;
};

struct PageStep {
  std::string step_key;
  int32_t step_order = 0;
  std::string status;
  std::string execution_target;
  std::string selected_target;
  std::string effect_type;
  int32_t attempt_count = 0;
  std::string operation_id;
};

struct PageEvent {
  std::string event_id;
  int64_t sequence = 0;
  std::string type;
  std::string payload_json;
  int64_t created_at = 0;
};

struct EventPage {
  bool found = false;
  PageRun run;
  int64_t max_sequence = 0;
  std::vector<PageStep> steps;
  std::vector<PageEvent> events;
};

class Store {
 public:
  Store(const Store&) = delete;
  Store& operator=(const Store&) = delete;
  ~Store();

  static Status open(const std::string& path, bool exclusive, std::unique_ptr<Store>& out);

  bool exclusive() const { return exclusive_; }

  Status create_run(const CreateRunInput& input, bool& created);
  Status load_run(const std::string& run_id, std::optional<Run>& out);
  Status list_runs(std::vector<Run>& out);
  Status journal_heads(std::vector<JournalHead>& out);
  Status event_page(const std::string& run_id, int64_t after_sequence, int32_t limit, EventPage& out);
  Status load_state(const std::string& run_id, std::optional<State>& out);
  Status compatible(const std::string& run_id, const std::string& workflow_name, int32_t workflow_version,
                    const std::string& input_json);
  Status request_cancel(const std::string& run_id, int64_t now_ms);
  Status transition_run(const TransitionInput& input, const std::string& run_id);
  Status claim(const std::string& run_id, const ClaimInput& input, ClaimOutcome& out);
  Status renew(const std::string& run_id, const Fence& fence, int64_t now_ms, int64_t lease_ms, bool& renewed);
  Status release(const std::string& run_id, const Fence& fence, int64_t now_ms, bool& released);
  Status begin_step(const BeginStepInput& input, const std::string& run_id);
  Status commit_step(const CommitStepInput& input, const std::string& run_id);
  Status resolve_step(const ResolveStepInput& input, const std::string& run_id);
  Status mark_unknown(const MarkUnknownInput& input, const std::string& run_id);
  Status reconcile(const ReconcileInput& input, const std::string& run_id);
  Status insert_outbox(const OutboxInput& input, bool& deduplicated, int32_t& count);
  Status apply(const std::string& run_id, const std::function<Status(State&)>& fn);

 private:
  Store(sqlite3* db, bool exclusive);
  Status migrate();
  Status load_unlocked(const std::string& run_id, std::optional<State>& out);
  Status persist(const State& before, const State& after);
  Status require(const std::string& run_id, State& out);
  Status insert_new_run(const State& state);
  template <typename Fn>
  Status mutate(const std::string& run_id, Fn&& fn);

  sqlite3* db_ = nullptr;
  bool exclusive_ = false;
  std::recursive_mutex mutex_;
};

}  // namespace larkx
