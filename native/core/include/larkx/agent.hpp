#pragma once

#include "larkx/core.hpp"

#include <memory>
#include <string>
#include <vector>

namespace larkx {

struct ToolRegistration {
  std::string name;
  std::string description;
  std::string schema_json;
  std::string effects;
  int32_t max_attempts = 0;
  int64_t initial_interval_ms = -1;
  int64_t max_interval_ms = -1;
  std::string backoff;
};

struct AgentRegistration {
  std::string name;
  int32_t version = 1;
  std::string instructions;
  std::string model_id;
  std::string model_name;
  bool tool_calling = true;
  std::vector<ToolRegistration> tools;
  int32_t max_iterations = 0;
  int32_t max_tool_calls = 0;
  int32_t max_invalid_tool_requests = 0;
  int32_t max_context_chars = 0;
  int32_t model_max_attempts = 0;
  int64_t model_initial_interval_ms = -1;
  int64_t model_max_interval_ms = -1;
  std::string model_backoff;
};

struct ExecRequest {
  int32_t kind = 0;
  std::string request_id;
  std::string step_key;
  std::string operation_id;
  std::string tool_name;
  int32_t attempt = 0;
  int64_t wait_until_ms = 0;
  bool has_wait_until = false;
  std::string effect_type;
  bool cancel_requested = false;
  std::string detail_json;
};

class Runtime {
 public:
  Runtime(const Runtime&) = delete;
  Runtime& operator=(const Runtime&) = delete;
  ~Runtime();

  static Status open(const std::string& path, bool exclusive, bool may_steal, const std::string& owner_id,
                     int64_t lease_ms, std::unique_ptr<Runtime>& out);

  Status register_agent(const AgentRegistration& spec);
  Status start(const std::string& name, int32_t version, const std::string& run_id, const std::string& input_json,
               int64_t now_ms, Run& out);
  Status drive(const std::string& run_id, int64_t now_ms, ExecRequest& out);
  Status submit_model(const std::string& run_id, const std::string& request_id, const std::string& response_json,
                      const std::string& error_code, const std::string& error_message, bool retryable, int64_t now_ms);
  Status submit_tool(const std::string& run_id, const std::string& request_id, const std::string& output_json,
                     const std::string& error_code, const std::string& error_message, bool retryable, int64_t now_ms);
  Status submit_reconcile(const std::string& run_id, const std::string& request_id, const std::string& resolution,
                          const std::string& output_json, const std::string& message, int64_t now_ms);
  Status pause(const std::string& run_id, int64_t now_ms);
  Status resume_run(const std::string& run_id, int64_t now_ms);
  Status cancel(const std::string& run_id, int64_t now_ms);
  Status inspect(const std::string& run_id, Run& out);
  Status list_runs(std::vector<Run>& out);
  Status result_json(const std::string& run_id, std::string& out);
  Status step_count(const std::string& run_id, int32_t& count);
  Status step_at(const std::string& run_id, int32_t index, Step& out);
  Status step_output(const std::string& run_id, const std::string& step_key, std::string& out);
  Status event_count(const std::string& run_id, int32_t& count);
  Status event_payload(const std::string& run_id, int32_t index, std::string& out);

 private:
  struct Impl;
  explicit Runtime(std::unique_ptr<Impl> impl);
  std::unique_ptr<Impl> impl_;
};

}  // namespace larkx
