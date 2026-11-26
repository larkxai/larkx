#include "larkx.h"

#include <sqlite3.h>

#include <cstdio>
#include <cstring>
#include <iostream>
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

std::string temp_db() {
  char path[] = "/tmp/larkx-agent-XXXXXX";
  const int fd = mkstemp(path);
  if (fd >= 0) {
    close(fd);
  }
  return path;
}

larkx_runtime* open_runtime(const std::string& path, const char* owner = "owner-a") {
  larkx_runtime* runtime = nullptr;
  larkx_error error{};
  CHECK(larkx_runtime_open(path.c_str(), 0, owner, 0, &runtime, &error) == LARKX_OK);
  return runtime;
}

larkx_tool_spec note_tool(const char* effects, int32_t attempts = 0, int64_t interval = -1) {
  larkx_tool_spec tool{};
  tool.name = "get_note";
  tool.description = "Read a note";
  tool.input_schema_json = "{\"type\":\"object\",\"properties\":{},\"additionalProperties\":false}";
  tool.effects = effects;
  tool.max_attempts = attempts;
  tool.initial_interval_ms = interval;
  tool.max_interval_ms = interval;
  tool.backoff = "fixed";
  return tool;
}

void register_agent(larkx_runtime* runtime, const char* name, int32_t version, const larkx_tool_spec* tools, int32_t tool_count,
                    int32_t max_iterations = 0, int32_t max_invalid = 0, int32_t max_context = 0, int32_t model_attempts = 0,
                    int64_t model_interval = -1) {
  larkx_agent_spec spec{};
  spec.name = name;
  spec.version = version;
  spec.instructions = "Secret instructions";
  spec.model_id = "scripted";
  spec.model_name = "scripted-1";
  spec.tool_calling = 1;
  spec.tools = tools;
  spec.tool_count = tool_count;
  spec.max_iterations = max_iterations;
  spec.max_invalid_tool_requests = max_invalid;
  spec.max_context_chars = max_context;
  spec.model_max_attempts = model_attempts;
  spec.model_initial_interval_ms = model_interval;
  spec.model_max_interval_ms = model_interval;
  spec.model_backoff = "fixed";
  larkx_error error{};
  CHECK(larkx_agent_register(runtime, &spec, &error) == LARKX_OK);
}

larkx_run_info start_run(larkx_runtime* runtime, const char* name, int32_t version, const char* run_id, const char* message = "Plan") {
  const std::string input = std::string("{\"message\":\"") + message + "\"}";
  larkx_run_info info{};
  larkx_error error{};
  CHECK(larkx_agent_start(runtime, name, version, run_id, input.c_str(), 10, &info, &error) == LARKX_OK);
  return info;
}

struct Drive {
  larkx_code code = LARKX_OK;
  larkx_exec_request request{};
  std::string detail;
  std::string message;
};

Drive drive(larkx_runtime* runtime, const char* run_id, int64_t now = 20) {
  Drive out;
  char detail[65536] = {};
  size_t needed = 0;
  larkx_error error{};
  out.code = larkx_run_drive(runtime, run_id, now, &out.request, detail, sizeof(detail), &needed, &error);
  out.detail = detail;
  out.message = error.message;
  return out;
}

void submit_model(larkx_runtime* runtime, const char* run_id, const char* request, const char* json, const char* error_code = nullptr,
                  int retryable = 0) {
  larkx_error error{};
  const auto code = larkx_run_submit_model(runtime, run_id, request, json, error_code, error_code, retryable, 30, &error);
  CHECK(code == LARKX_OK);
}

void submit_tool(larkx_runtime* runtime, const char* run_id, const char* request, const char* json, const char* error_code = nullptr,
                 int retryable = 0) {
  larkx_error error{};
  CHECK(larkx_run_submit_tool(runtime, run_id, request, json, error_code, error_code, retryable, 30, &error) == LARKX_OK);
}

bool contains(const std::string& text, const char* needle) { return text.find(needle) != std::string::npos; }

void test_single_turn_persists_before_the_model_runs() {
  const auto path = temp_db();
  auto* runtime = open_runtime(path);
  register_agent(runtime, "single-turn", 1, nullptr, 0);
  const auto started = start_run(runtime, "single-turn", 1, "single-1", "Hi");
  CHECK(std::strcmp(started.status, "RUNNING") == 0);
  CHECK(std::strcmp(started.data_policy, "device-only") == 0);
  larkx_runtime_close(runtime);
  auto* reopened = open_runtime(path);
  register_agent(reopened, "single-turn", 1, nullptr, 0);
  larkx_run_info info{};
  larkx_error error{};
  CHECK(larkx_run_inspect(reopened, "single-1", &info, &error) == LARKX_OK);
  CHECK(std::strcmp(info.status, "RUNNING") == 0);
  const auto first = drive(reopened, "single-1");
  CHECK(first.code == LARKX_OK);
  CHECK(first.request.kind == LARKX_REQUEST_INVOKE_MODEL);
  bool recovered_event = false;
  int32_t recovered_events = 0;
  CHECK(larkx_run_event_count(reopened, "single-1", &recovered_events, &error) == LARKX_OK);
  for (int32_t index = 0; index < recovered_events; index += 1) {
    char payload[2048];
    size_t payload_needed = 0;
    CHECK(larkx_run_event_payload(reopened, "single-1", index, payload, sizeof(payload), &payload_needed, &error) ==
          LARKX_OK);
    if (contains(payload, "WORKFLOW_RECOVERED") && contains(payload, "interrupted")) {
      recovered_event = true;
    }
  }
  CHECK(recovered_event);
  CHECK(contains(first.detail, "Secret instructions"));
  CHECK(contains(first.detail, "Hi"));
  submit_model(reopened, "single-1", first.request.request_id, "{\"message\":\"hello\",\"finish\":\"stop\",\"calls\":[]}");
  larkx_runtime_close(reopened);
  auto* recovered = open_runtime(path);
  register_agent(recovered, "single-turn", 1, nullptr, 0);
  const auto second = drive(recovered, "single-1");
  CHECK(second.request.kind == LARKX_REQUEST_COMPLETE);
  CHECK(contains(second.detail, "hello"));
  char result[512];
  size_t needed = 0;
  CHECK(larkx_run_result(recovered, "single-1", result, sizeof(result), &needed, &error) == LARKX_OK);
  CHECK(std::strcmp(result, "{\"finish\":\"stop\",\"iterations\":1,\"message\":\"hello\",\"toolCalls\":0}") == 0);
  int32_t events = 0;
  CHECK(larkx_run_event_count(recovered, "single-1", &events, &error) == LARKX_OK);
  for (int32_t index = 0; index < events; index += 1) {
    char payload[1024];
    CHECK(larkx_run_event_payload(recovered, "single-1", index, payload, sizeof(payload), &needed, &error) == LARKX_OK);
    CHECK(!contains(payload, "Hi"));
    CHECK(!contains(payload, "Secret instructions"));
    CHECK(!contains(payload, "hello"));
  }
  larkx_runtime_close(recovered);
  std::remove(path.c_str());
}

void test_dynamic_tool_calls_keep_stable_keys() {
  const auto path = temp_db();
  auto* runtime = open_runtime(path);
  const auto tool = note_tool("pure");
  larkx_tool_spec search{};
  search.name = "search_notes";
  search.description = "Search notes";
  search.input_schema_json =
      "{\"type\":\"object\",\"properties\":{\"query\":{\"type\":\"string\"}},\"required\":[\"query\"],\"additionalProperties\":false}";
  search.effects = "pure";
  search.initial_interval_ms = -1;
  search.max_interval_ms = -1;
  const larkx_tool_spec tools[] = {tool, search};
  register_agent(runtime, "multi-tool", 1, tools, 2);
  start_run(runtime, "multi-tool", 1, "multi-1");
  const char* responses[] = {
      "{\"message\":null,\"finish\":\"tool_calls\",\"calls\":[{\"id\":\"note\",\"name\":\"get_note\",\"arguments\":{}}]}",
      "{\"message\":null,\"finish\":\"tool_calls\",\"calls\":[{\"id\":\"search\",\"name\":\"search_notes\",\"arguments\":{\"query\":\"sofa\"}}]}",
      "{\"message\":\"ready\",\"finish\":\"stop\",\"calls\":[]}",
  };
  int models = 0;
  int tools_run = 0;
  std::vector<std::string> names;
  for (int guard = 0; guard < 12; guard += 1) {
    const auto step = drive(runtime, "multi-1");
    CHECK(step.code == LARKX_OK);
    if (step.request.kind == LARKX_REQUEST_COMPLETE) {
      break;
    }
    if (step.request.kind == LARKX_REQUEST_INVOKE_MODEL) {
      CHECK(models < 3);
      submit_model(runtime, "multi-1", step.request.request_id, responses[models]);
      models += 1;
    } else if (step.request.kind == LARKX_REQUEST_INVOKE_TOOL) {
      names.emplace_back(step.request.tool_name);
      CHECK(contains(step.detail, step.request.operation_id));
      submit_tool(runtime, "multi-1", step.request.request_id, "{\"text\":\"kept\"}");
      tools_run += 1;
    } else {
      CHECK(false);
      break;
    }
  }
  CHECK(models == 3);
  CHECK(tools_run == 2);
  CHECK(names.size() == 2);
  CHECK(names[0] == "get_note");
  CHECK(names[1] == "search_notes");
  const char* keys[] = {"model-0", "tool-0-0", "model-1", "tool-1-0", "model-2"};
  for (int32_t index = 0; index < 5; index += 1) {
    larkx_step_info info{};
    larkx_error error{};
    CHECK(larkx_run_step_at(runtime, "multi-1", index, &info, &error) == LARKX_OK);
    CHECK(std::strcmp(info.step_key, keys[index]) == 0);
    CHECK(std::strcmp(info.status, "COMPLETED") == 0);
  }
  larkx_runtime_close(runtime);
  std::remove(path.c_str());
}

void test_invalid_tools_do_not_ask_the_host_to_execute_them() {
  const auto path = temp_db();
  auto* runtime = open_runtime(path);
  larkx_tool_spec search{};
  search.name = "search_notes";
  search.description = "Search";
  search.input_schema_json =
      "{\"type\":\"object\",\"properties\":{\"query\":{\"type\":\"string\"}},\"required\":[\"query\"],\"additionalProperties\":false}";
  search.effects = "pure";
  search.initial_interval_ms = -1;
  search.max_interval_ms = -1;
  register_agent(runtime, "invalid-tools", 1, &search, 1);
  start_run(runtime, "invalid-tools", 1, "invalid-1");
  const char* responses[] = {
      "{\"message\":null,\"finish\":\"tool_calls\",\"calls\":[{\"id\":\"x\",\"name\":\"delete_everything\",\"arguments\":{}}]}",
      "{\"message\":null,\"finish\":\"tool_calls\",\"calls\":[{\"id\":\"y\",\"name\":\"search_notes\",\"arguments\":{\"query\":12}}]}",
      "{\"message\":\"corrected\",\"finish\":\"stop\",\"calls\":[]}",
  };
  int models = 0;
  int host_tools = 0;
  for (int guard = 0; guard < 8; guard += 1) {
    const auto step = drive(runtime, "invalid-1");
    if (step.request.kind == LARKX_REQUEST_COMPLETE) {
      CHECK(contains(step.detail, "corrected"));
      break;
    }
    CHECK(step.request.kind == LARKX_REQUEST_INVOKE_MODEL);
    submit_model(runtime, "invalid-1", step.request.request_id, responses[models]);
    models += 1;
  }
  CHECK(models == 3);
  CHECK(host_tools == 0);
  char output[1024];
  size_t needed = 0;
  larkx_error error{};
  CHECK(larkx_run_step_output(runtime, "invalid-1", "tool-0-0", output, sizeof(output), &needed, &error) == LARKX_OK);
  CHECK(contains(output, "Unknown tool"));
  CHECK(larkx_run_step_output(runtime, "invalid-1", "tool-1-0", output, sizeof(output), &needed, &error) == LARKX_OK);
  CHECK(contains(output, "Invalid arguments"));
  larkx_runtime_close(runtime);
  std::remove(path.c_str());
}

void test_malformed_model_response_fails_the_run() {
  const auto path = temp_db();
  auto* runtime = open_runtime(path);
  const auto tool = note_tool("pure");
  register_agent(runtime, "malformed", 1, &tool, 1);
  start_run(runtime, "malformed", 1, "bad-1");
  const auto first = drive(runtime, "bad-1");
  submit_model(runtime, "bad-1", first.request.request_id,
               "{\"message\":null,\"finish\":\"tool_calls\",\"calls\":[{\"id\":\"bad\",\"name\":\"get_note\",\"arguments\":\"nope\"}]}");
  const auto failed = drive(runtime, "bad-1");
  CHECK(failed.request.kind == LARKX_REQUEST_FAILED);
  larkx_run_info info{};
  larkx_error error{};
  CHECK(larkx_run_inspect(runtime, "bad-1", &info, &error) == LARKX_OK);
  CHECK(std::strcmp(info.status, "FAILED") == 0);
  const auto again = drive(runtime, "bad-1");
  CHECK(again.request.kind == LARKX_REQUEST_FAILED);
  larkx_runtime_close(runtime);
  std::remove(path.c_str());
}

void test_limits_stop_the_loop() {
  const auto path = temp_db();
  auto* runtime = open_runtime(path);
  const auto tool = note_tool("pure");
  register_agent(runtime, "limited", 1, &tool, 1, 2);
  start_run(runtime, "limited", 1, "limit-1");
  int models = 0;
  for (int guard = 0; guard < 10; guard += 1) {
    const auto step = drive(runtime, "limit-1");
    if (step.request.kind == LARKX_REQUEST_FAILED) {
      CHECK(contains(step.detail, "Agent iteration limit reached."));
      break;
    }
    if (step.request.kind == LARKX_REQUEST_INVOKE_MODEL) {
      models += 1;
      submit_model(runtime, "limit-1", step.request.request_id,
                   "{\"message\":null,\"finish\":\"tool_calls\",\"calls\":[{\"id\":\"n\",\"name\":\"get_note\",\"arguments\":{}}]}");
    } else {
      CHECK(step.request.kind == LARKX_REQUEST_INVOKE_TOOL);
      submit_tool(runtime, "limit-1", step.request.request_id, "{\"ok\":true}");
    }
  }
  CHECK(models == 2);
  larkx_runtime_close(runtime);

  auto* second = open_runtime(path);
  register_agent(second, "invalid-limit", 1, nullptr, 0, 6, 2);
  start_run(second, "invalid-limit", 1, "limit-2");
  models = 0;
  for (int guard = 0; guard < 8; guard += 1) {
    const auto step = drive(second, "limit-2");
    if (step.request.kind == LARKX_REQUEST_FAILED) {
      CHECK(contains(step.detail, "Invalid tool request limit reached."));
      break;
    }
    CHECK(step.request.kind == LARKX_REQUEST_INVOKE_MODEL);
    models += 1;
    submit_model(second, "limit-2", step.request.request_id,
                 "{\"message\":null,\"finish\":\"tool_calls\",\"calls\":[{\"id\":\"m\",\"name\":\"missing_tool\",\"arguments\":{}}]}");
  }
  CHECK(models == 2);
  larkx_runtime_close(second);
  std::remove(path.c_str());
}

void test_retries_keep_the_operation_id() {
  const auto path = temp_db();
  auto* runtime = open_runtime(path);
  const auto tool = note_tool("idempotent", 2, 0);
  register_agent(runtime, "retries", 1, &tool, 1, 0, 0, 0, 2, 0);
  start_run(runtime, "retries", 1, "retry-1");
  const auto model_first = drive(runtime, "retry-1", 100);
  CHECK(model_first.request.kind == LARKX_REQUEST_INVOKE_MODEL);
  CHECK(model_first.request.attempt == 1);
  submit_model(runtime, "retry-1", model_first.request.request_id, "{}", "transient_execution_failure", 1);
  const auto model_second = drive(runtime, "retry-1", 100);
  CHECK(model_second.request.kind == LARKX_REQUEST_INVOKE_MODEL);
  CHECK(std::strcmp(model_second.request.operation_id, model_first.request.operation_id) == 0);
  CHECK(model_second.request.attempt == 2);
  CHECK(std::strcmp(model_second.request.request_id, model_first.request.request_id) != 0);
  submit_model(runtime, "retry-1", model_second.request.request_id,
               "{\"message\":null,\"finish\":\"tool_calls\",\"calls\":[{\"id\":\"save\",\"name\":\"get_note\",\"arguments\":{}}]}");
  const auto tool_first = drive(runtime, "retry-1", 100);
  CHECK(tool_first.request.kind == LARKX_REQUEST_INVOKE_TOOL);
  CHECK(std::strcmp(tool_first.request.operation_id, model_first.request.operation_id) != 0);
  submit_tool(runtime, "retry-1", tool_first.request.request_id, "null", "transient_execution_failure", 1);
  const auto tool_second = drive(runtime, "retry-1", 100);
  CHECK(tool_second.request.kind == LARKX_REQUEST_INVOKE_TOOL);
  CHECK(std::strcmp(tool_second.request.operation_id, tool_first.request.operation_id) == 0);
  CHECK(tool_second.request.attempt == 2);
  submit_tool(runtime, "retry-1", tool_second.request.request_id, "{\"saved\":true}");
  const auto final_model = drive(runtime, "retry-1", 100);
  CHECK(final_model.request.kind == LARKX_REQUEST_INVOKE_MODEL);
  CHECK(std::strcmp(final_model.request.step_key, "model-1") == 0);
  submit_model(runtime, "retry-1", final_model.request.request_id, "{\"message\":\"saved\",\"finish\":\"stop\",\"calls\":[]}");
  const auto final_drive = drive(runtime, "retry-1", 100);
  CHECK(final_drive.request.kind == LARKX_REQUEST_COMPLETE);
  larkx_step_info model{};
  larkx_step_info tool_info{};
  larkx_error error{};
  CHECK(larkx_run_step_at(runtime, "retry-1", 0, &model, &error) == LARKX_OK);
  CHECK(larkx_run_step_at(runtime, "retry-1", 1, &tool_info, &error) == LARKX_OK);
  CHECK(model.attempt_count == 2);
  CHECK(tool_info.attempt_count == 2);
  CHECK(std::strcmp(model.operation_id, tool_info.operation_id) != 0);
  larkx_runtime_close(runtime);
  std::remove(path.c_str());
}

void test_pause_and_cancel() {
  const auto path = temp_db();
  auto* runtime = open_runtime(path);
  register_agent(runtime, "control", 1, nullptr, 0);
  start_run(runtime, "control", 1, "pause-1");
  larkx_error error{};
  CHECK(larkx_run_pause(runtime, "pause-1", 15, &error) == LARKX_OK);
  const auto paused = drive(runtime, "pause-1");
  CHECK(paused.request.kind == LARKX_REQUEST_PAUSED);
  CHECK(larkx_run_resume(runtime, "pause-1", 16, &error) == LARKX_OK);
  const auto resumed = drive(runtime, "pause-1");
  CHECK(resumed.request.kind == LARKX_REQUEST_INVOKE_MODEL);
  CHECK(larkx_run_pause(runtime, "pause-1", 17, &error) == LARKX_ERR_STATE);
  CHECK(larkx_run_cancel(runtime, "pause-1", 18, &error) == LARKX_OK);
  const auto cancel_drive = drive(runtime, "pause-1");
  CHECK(cancel_drive.request.kind == LARKX_REQUEST_INVOKE_MODEL);
  CHECK(cancel_drive.request.cancel_requested == 1);
  CHECK(larkx_run_submit_model(runtime, "pause-1", resumed.request.request_id, "null", "cancelled_execution", "Model call cancelled.", 0, 19,
                              &error) == LARKX_OK);
  larkx_run_info info{};
  CHECK(larkx_run_inspect(runtime, "pause-1", &info, &error) == LARKX_OK);
  CHECK(std::strcmp(info.status, "CANCELLED") == 0);
  larkx_runtime_close(runtime);

  auto* early = open_runtime(path);
  register_agent(early, "control", 1, nullptr, 0);
  start_run(early, "control", 1, "cancel-early");
  CHECK(larkx_run_cancel(early, "cancel-early", 12, &error) == LARKX_OK);
  const auto cancelled = drive(early, "cancel-early");
  CHECK(cancelled.request.kind == LARKX_REQUEST_CANCELLED);
  larkx_runtime_close(early);
  std::remove(path.c_str());
}

void test_recovery_replays_committed_work_and_blocks_non_idempotent_interrupts() {
  const auto path = temp_db();
  auto* runtime = open_runtime(path);
  const auto tool = note_tool("idempotent");
  register_agent(runtime, "replay-agent", 1, &tool, 1);
  start_run(runtime, "replay-agent", 1, "replay-1");
  const auto model = drive(runtime, "replay-1");
  const std::string operation = model.request.operation_id;
  submit_model(runtime, "replay-1", model.request.request_id,
               "{\"message\":null,\"finish\":\"tool_calls\",\"calls\":[{\"id\":\"save\",\"name\":\"get_note\",\"arguments\":{}}]}");
  larkx_runtime_close(runtime);

  auto* second = open_runtime(path);
  register_agent(second, "replay-agent", 1, &tool, 1);
  const auto tool_request = drive(second, "replay-1");
  CHECK(tool_request.request.kind == LARKX_REQUEST_INVOKE_TOOL);
  CHECK(std::strcmp(tool_request.request.operation_id, operation.c_str()) != 0);
  submit_tool(second, "replay-1", tool_request.request.request_id, "{\"id\":\"kept\"}");
  larkx_runtime_close(second);

  auto* third = open_runtime(path);
  register_agent(third, "replay-agent", 1, &tool, 1);
  const auto next_model = drive(third, "replay-1");
  CHECK(next_model.request.kind == LARKX_REQUEST_INVOKE_MODEL);
  CHECK(std::strcmp(next_model.request.step_key, "model-1") == 0);
  submit_model(third, "replay-1", next_model.request.request_id, "{\"message\":\"done\",\"finish\":\"stop\",\"calls\":[]}");
  larkx_runtime_close(third);
  auto* fourth = open_runtime(path);
  register_agent(fourth, "replay-agent", 1, &tool, 1);
  const auto complete = drive(fourth, "replay-1");
  CHECK(complete.request.kind == LARKX_REQUEST_COMPLETE);
  CHECK(contains(complete.detail, "done"));
  larkx_runtime_close(fourth);

  auto* charge_runtime = open_runtime(path);
  const auto charge = note_tool("non-idempotent");
  register_agent(charge_runtime, "charge-agent", 1, &charge, 1);
  start_run(charge_runtime, "charge-agent", 1, "charge-1");
  const auto asked = drive(charge_runtime, "charge-1");
  submit_model(charge_runtime, "charge-1", asked.request.request_id,
               "{\"message\":null,\"finish\":\"tool_calls\",\"calls\":[{\"id\":\"c\",\"name\":\"get_note\",\"arguments\":{}}]}");
  const auto running = drive(charge_runtime, "charge-1");
  CHECK(running.request.kind == LARKX_REQUEST_INVOKE_TOOL);
  const std::string charge_operation = running.request.operation_id;
  larkx_runtime_close(charge_runtime);
  auto* recovered = open_runtime(path);
  register_agent(recovered, "charge-agent", 1, &charge, 1);
  const auto blocked = drive(recovered, "charge-1");
  CHECK(blocked.request.kind == LARKX_REQUEST_RECONCILE);
  CHECK(blocked.request.operation_id == charge_operation);
  larkx_error error{};
  CHECK(larkx_run_submit_tool(recovered, "charge-1", running.request.request_id, "{\"charged\":true}", nullptr, nullptr, 0, 35, &error) ==
        LARKX_ERR_STATE);
  CHECK(larkx_run_submit_reconcile(recovered, "charge-1", blocked.request.request_id, "retry", "null", "safe to retry", 40, &error) ==
        LARKX_OK);
  const auto retried = drive(recovered, "charge-1", 40);
  CHECK(retried.request.kind == LARKX_REQUEST_INVOKE_TOOL);
  CHECK(retried.request.operation_id == charge_operation);
  larkx_runtime_close(recovered);
  std::remove(path.c_str());
}

void test_duplicate_and_stale_results_are_rejected() {
  const auto path = temp_db();
  auto* runtime = open_runtime(path);
  register_agent(runtime, "stale", 1, nullptr, 0);
  start_run(runtime, "stale", 1, "stale-1");
  const auto first = drive(runtime, "stale-1");
  submit_model(runtime, "stale-1", first.request.request_id, "{\"message\":\"once\",\"finish\":\"stop\",\"calls\":[]}");
  larkx_error error{};
  CHECK(larkx_run_submit_model(runtime, "stale-1", first.request.request_id, "{\"message\":\"twice\",\"finish\":\"stop\",\"calls\":[]}",
                              nullptr, nullptr, 0, 31, &error) == LARKX_ERR_STATE);
  CHECK(contains(error.message, "Stale"));
  larkx_store* thief = nullptr;
  CHECK(larkx_store_open(path.c_str(), 0, &thief, &error) == LARKX_OK);
  auto* second = open_runtime(path);
  const auto tool = note_tool("pure");
  register_agent(second, "stale", 1, &tool, 1);
  start_run(second, "stale", 1, "stale-2");
  const auto open_request = drive(second, "stale-2");
  larkx_claim_request claim{};
  claim.run_id = "stale-2";
  claim.owner_id = "owner-b";
  claim.now_ms = 50;
  claim.lease_ms = 1000;
  claim.may_steal = 1;
  larkx_claim_result stolen{};
  CHECK(larkx_ownership_claim(thief, &claim, &stolen, &error) == LARKX_OK);
  CHECK(stolen.acquired == 1);
  CHECK(larkx_run_submit_model(second, "stale-2", open_request.request.request_id, "{\"message\":\"late\",\"finish\":\"stop\",\"calls\":[]}",
                              nullptr, nullptr, 0, 60, &error) == LARKX_ERR_OWNERSHIP);
  larkx_store_close(thief);
  larkx_runtime_close(runtime);
  larkx_runtime_close(second);
  std::remove(path.c_str());
}

void test_agent_version_and_effect_compatibility() {
  const auto path = temp_db();
  auto* runtime = open_runtime(path);
  const auto tool = note_tool("idempotent");
  register_agent(runtime, "versioned", 1, &tool, 1);
  start_run(runtime, "versioned", 1, "version-1");
  larkx_runtime_close(runtime);
  auto* upgraded = open_runtime(path);
  register_agent(upgraded, "versioned", 2, &tool, 1);
  larkx_run_info info{};
  larkx_error error{};
  CHECK(larkx_agent_start(upgraded, "versioned", 2, "version-1", "{\"message\":\"Plan\"}", 11, &info, &error) == LARKX_ERR_STATE);
  const auto drive_code = drive(upgraded, "version-1");
  CHECK(drive_code.code == LARKX_ERR_STATE);
  CHECK(contains(drive_code.message, "Unknown agent version"));
  larkx_runtime_close(upgraded);

  auto* original = open_runtime(path);
  register_agent(original, "effects", 1, &tool, 1);
  start_run(original, "effects", 1, "effects-1");
  const auto model = drive(original, "effects-1");
  submit_model(original, "effects-1", model.request.request_id,
               "{\"message\":null,\"finish\":\"tool_calls\",\"calls\":[{\"id\":\"save\",\"name\":\"get_note\",\"arguments\":{}}]}");
  const auto invoked = drive(original, "effects-1");
  submit_tool(original, "effects-1", invoked.request.request_id, "{\"saved\":true}");
  larkx_runtime_close(original);
  auto* changed = open_runtime(path);
  const auto pure = note_tool("pure");
  register_agent(changed, "effects", 1, &pure, 1);
  const auto diverged = drive(changed, "effects-1");
  CHECK(diverged.code == LARKX_ERR_STATE);
  CHECK(contains(diverged.message, "effect"));
  larkx_runtime_close(changed);
  std::remove(path.c_str());
}

void test_open_attempt_can_be_submitted_after_reopen() {
  const auto path = temp_db();
  auto* runtime = open_runtime(path);
  register_agent(runtime, "resume-submit", 1, nullptr, 0);
  start_run(runtime, "resume-submit", 1, "resume-1");
  const auto model = drive(runtime, "resume-1");
  const std::string request = model.request.request_id;
  larkx_runtime_close(runtime);
  auto* recovered = open_runtime(path);
  register_agent(recovered, "resume-submit", 1, nullptr, 0);
  submit_model(recovered, "resume-1", request.c_str(), "{\"message\":\"kept\",\"finish\":\"stop\",\"calls\":[]}");
  const auto complete = drive(recovered, "resume-1");
  CHECK(complete.request.kind == LARKX_REQUEST_COMPLETE);
  CHECK(contains(complete.detail, "kept"));
  larkx_runtime_close(recovered);
  std::remove(path.c_str());
}

void test_run_list_returns_persisted_runs() {
  const std::string path = temp_db();
  larkx_runtime* runtime = open_runtime(path);
  register_agent(runtime, "listed", 1, nullptr, 0);
  start_run(runtime, "listed", 1, "listed-b");
  start_run(runtime, "listed", 1, "listed-a");
  int32_t count = 0;
  larkx_error error{};
  CHECK(larkx_run_count(runtime, &count, &error) == LARKX_OK);
  CHECK(count == 2);
  larkx_run_info first{};
  larkx_run_info second{};
  CHECK(larkx_run_at(runtime, 0, &first, &error) == LARKX_OK);
  CHECK(larkx_run_at(runtime, 1, &second, &error) == LARKX_OK);
  CHECK(std::strcmp(first.run_id, "listed-a") == 0 || std::strcmp(first.run_id, "listed-b") == 0);
  CHECK(std::strcmp(first.run_id, second.run_id) != 0);
  larkx_run_info missing{};
  CHECK(larkx_run_at(runtime, 2, &missing, &error) == LARKX_ERR_NOT_FOUND);
  larkx_runtime_close(runtime);
  std::remove(path.c_str());
}

larkx_remote_spec procurement(int dedupe, int lookup, int poll, int cancel) {
  larkx_remote_spec remote{};
  remote.name = "procurement-agent";
  remote.description = "Find compatible replacement parts.";
  remote.input_schema_json =
      "{\"additionalProperties\":false,\"properties\":{\"objective\":{\"type\":\"string\"}},\"required\":[\"objective\"],\"type\":\"object\"}";
  remote.endpoint = "http://127.0.0.1:8787";
  remote.dedupe = dedupe;
  remote.lookup = lookup;
  remote.durable_task = 1;
  remote.poll = poll;
  remote.cancel = cancel;
  remote.persistent = 1;
  remote.poll_interval_ms = 50;
  return remote;
}

void register_remote_agent(larkx_runtime* runtime, const larkx_remote_spec* remote, int count, const char* name = "field") {
  larkx_agent_spec spec{};
  spec.name = name;
  spec.version = 1;
  spec.instructions = "Inspect equipment.";
  spec.model_id = "scripted";
  spec.model_name = "scripted-1";
  spec.tool_calling = 1;
  spec.remote_agents = remote;
  spec.remote_count = count;
  spec.allow_remote = count > 0 ? 1 : 0;
  larkx_error error{};
  const auto code = larkx_agent_register(runtime, &spec, &error);
  if (code != LARKX_OK) {
    std::fprintf(stderr, "register remote: %s\n", error.message);
  }
  CHECK(code == LARKX_OK);
}

void submit_remote(larkx_runtime* runtime, const char* run_id, const char* request, const char* body, int64_t now = 40) {
  larkx_error error{};
  const auto code = larkx_run_submit_delegation(runtime, run_id, request, body, now, &error);
  if (code != LARKX_OK) {
    std::fprintf(stderr, "submit delegation: %s\n", error.message);
  }
  CHECK(code == LARKX_OK);
}

Drive delegate_after_model(larkx_runtime* runtime, const char* run_id) {
  const auto model = drive(runtime, run_id, 20);
  CHECK(model.request.kind == LARKX_REQUEST_INVOKE_MODEL);
  CHECK(contains(model.detail, "procurement-agent"));
  submit_model(runtime, run_id, model.request.request_id,
               "{\"message\":null,\"finish\":\"tool_calls\",\"calls\":[{\"id\":\"remote-1\",\"name\":\"procurement-agent\","
               "\"arguments\":{\"objective\":\"Find a seal\"}}]}");
  return drive(runtime, run_id, 30);
}

void test_remote_delegation_commits_before_the_parent_continues() {
  const auto path = temp_db();
  auto* runtime = open_runtime(path);
  const auto remote = procurement(1, 1, 1, 1);
  register_remote_agent(runtime, &remote, 1);
  const auto started = start_run(runtime, "field", 1, "field-1", "Inspect pump P-104");
  CHECK(std::strcmp(started.data_policy, "cloud-allowed") == 0);
  const auto request = delegate_after_model(runtime, "field-1");
  CHECK(request.request.kind == LARKX_REQUEST_DELEGATE);
  CHECK(contains(request.detail, "\"action\":\"submit\""));
  CHECK(contains(request.detail, "Find a seal"));
  CHECK(!contains(request.detail, "Inspect pump P-104"));
  CHECK(!contains(request.detail, "messages"));
  const std::string operation = request.request.operation_id;
  CHECK(!operation.empty());
  larkx_runtime_close(runtime);

  auto* recovered = open_runtime(path);
  register_remote_agent(recovered, &remote, 1);
  const auto again = drive(recovered, "field-1", 35);
  CHECK(again.request.kind == LARKX_REQUEST_DELEGATE);
  CHECK(std::strcmp(again.request.operation_id, operation.c_str()) == 0);
  CHECK(contains(again.detail, "\"action\":\"lookup\""));
  submit_remote(recovered, "field-1", again.request.request_id,
                "{\"action\":\"lookup\",\"outcome\":\"not_found\"}");
  const auto resubmit = drive(recovered, "field-1", 40);
  CHECK(resubmit.request.kind == LARKX_REQUEST_DELEGATE);
  CHECK(contains(resubmit.detail, "\"action\":\"submit\""));
  CHECK(std::strcmp(resubmit.request.operation_id, operation.c_str()) == 0);
  submit_remote(recovered, "field-1", resubmit.request.request_id,
                "{\"action\":\"submit\",\"outcome\":\"accepted\",\"taskId\":\"task-789\"}");
  const auto waiting = drive(recovered, "field-1", 40);
  CHECK(waiting.request.kind == LARKX_REQUEST_WAIT);
  CHECK(contains(waiting.detail, "remote"));
  const auto poll = drive(recovered, "field-1", 100);
  CHECK(poll.request.kind == LARKX_REQUEST_DELEGATE);
  CHECK(contains(poll.detail, "\"action\":\"poll\""));
  CHECK(contains(poll.detail, "task-789"));
  CHECK(!contains(poll.detail, "\"action\":\"submit\""));
  submit_remote(recovered, "field-1", poll.request.request_id,
                "{\"action\":\"poll\",\"outcome\":\"completed\",\"taskId\":\"task-789\",\"result\":{\"supplier\":\"Example Industrial Supply\"}}",
                110);
  const auto continued = drive(recovered, "field-1", 120);
  CHECK(continued.request.kind == LARKX_REQUEST_INVOKE_MODEL);
  CHECK(contains(continued.detail, "Example Industrial Supply"));
  submit_model(recovered, "field-1", continued.request.request_id, "{\"message\":\"Seal quoted.\",\"finish\":\"stop\",\"calls\":[]}");
  const auto done = drive(recovered, "field-1", 130);
  CHECK(done.request.kind == LARKX_REQUEST_COMPLETE);
  char listed[1024];
  size_t needed = 0;
  larkx_error error{};
  CHECK(larkx_run_delegations(recovered, "field-1", listed, sizeof(listed), &needed, &error) == LARKX_OK);
  CHECK(contains(listed, "\"state\":\"COMPLETED\""));
  CHECK(contains(listed, operation.c_str()));
  CHECK(contains(listed, "task-789"));
  int32_t events = 0;
  CHECK(larkx_run_event_count(recovered, "field-1", &events, &error) == LARKX_OK);
  bool saw_result_event = false;
  for (int32_t index = 0; index < events; index += 1) {
    char payload[1024];
    CHECK(larkx_run_event_payload(recovered, "field-1", index, payload, sizeof(payload), &needed, &error) == LARKX_OK);
    CHECK(!contains(payload, "Example Industrial Supply"));
    CHECK(!contains(payload, "Find a seal"));
    if (contains(payload, "task-789")) {
      saw_result_event = true;
    }
  }
  CHECK(saw_result_event);
  larkx_runtime_close(recovered);
  std::remove(path.c_str());
}

void test_remote_lost_ack_without_lookup_or_dedupe_blocks() {
  const auto path = temp_db();
  auto* runtime = open_runtime(path);
  const auto remote = procurement(0, 0, 1, 0);
  register_remote_agent(runtime, &remote, 1);
  start_run(runtime, "field", 1, "lost-1", "Inspect pump P-104");
  const auto request = delegate_after_model(runtime, "lost-1");
  CHECK(request.request.kind == LARKX_REQUEST_DELEGATE);
  larkx_runtime_close(runtime);
  auto* recovered = open_runtime(path);
  register_remote_agent(recovered, &remote, 1);
  const auto blocked = drive(recovered, "lost-1", 50);
  CHECK(blocked.request.kind == LARKX_REQUEST_RECONCILE);
  larkx_error error{};
  CHECK(larkx_run_submit_reconcile(recovered, "lost-1", blocked.request.request_id, "retry", "null", "try again", 60, &error) !=
        LARKX_OK);
  CHECK(larkx_run_submit_reconcile(recovered, "lost-1", blocked.request.request_id, "complete",
                                  "{\"saved\":true}", "resolved locally", 60, &error) == LARKX_OK);
  const auto model = drive(recovered, "lost-1", 70);
  CHECK(model.request.kind == LARKX_REQUEST_INVOKE_MODEL);
  larkx_runtime_close(recovered);
  std::remove(path.c_str());
}

void test_remote_cancel_and_stale_owner() {
  const auto path = temp_db();
  auto* runtime = open_runtime(path);
  const auto remote = procurement(1, 1, 1, 1);
  register_remote_agent(runtime, &remote, 1);
  start_run(runtime, "field", 1, "cancel-1", "Inspect pump P-104");
  const auto request = delegate_after_model(runtime, "cancel-1");
  submit_remote(runtime, "cancel-1", request.request.request_id,
                "{\"action\":\"submit\",\"outcome\":\"offline\"}");
  const auto waiting = drive(runtime, "cancel-1", 40);
  CHECK(waiting.request.kind == LARKX_REQUEST_WAIT);
  CHECK(contains(waiting.detail, "network"));
  larkx_error error{};
  CHECK(larkx_run_cancel(runtime, "cancel-1", 45, &error) == LARKX_OK);
  const auto cancelled = drive(runtime, "cancel-1", 45);
  CHECK(cancelled.request.kind == LARKX_REQUEST_CANCELLED);

  auto* second = open_runtime(path, "owner-b");
  register_remote_agent(second, &remote, 1);
  const auto denied = larkx_run_submit_delegation(second, "cancel-1", "stale", "{\"action\":\"poll\",\"outcome\":\"completed\"}", 50, &error);
  CHECK(denied == LARKX_ERR_OWNERSHIP);
  larkx_runtime_close(second);
  larkx_runtime_close(runtime);
  std::remove(path.c_str());
}

void test_remote_failure_is_not_a_successful_result() {
  const auto path = temp_db();
  auto* runtime = open_runtime(path);
  const auto remote = procurement(1, 1, 1, 0);
  register_remote_agent(runtime, &remote, 1);
  start_run(runtime, "field", 1, "fail-1", "Inspect pump P-104");
  const auto request = delegate_after_model(runtime, "fail-1");
  submit_remote(runtime, "fail-1", request.request.request_id,
                "{\"action\":\"submit\",\"outcome\":\"accepted\",\"taskId\":\"task-1\"}");
  const auto poll = drive(runtime, "fail-1", 100);
  CHECK(contains(poll.detail, "\"action\":\"poll\""));
  submit_remote(runtime, "fail-1", poll.request.request_id,
                "{\"action\":\"poll\",\"outcome\":\"failed\",\"taskId\":\"task-1\",\"message\":\"Supplier search failed.\"}", 110);
  const auto failed = drive(runtime, "fail-1", 120);
  CHECK(failed.request.kind == LARKX_REQUEST_FAILED);
  CHECK(contains(failed.detail, "Supplier search failed."));
  larkx_error error{};
  CHECK(larkx_run_cancel(runtime, "fail-1", 130, &error) != LARKX_OK);
  larkx_runtime_close(runtime);
  std::remove(path.c_str());
}

std::string listed_delegations(larkx_runtime* runtime, const char* run_id) {
  char listed[2048];
  size_t needed = 0;
  larkx_error error{};
  const auto code = larkx_run_delegations(runtime, run_id, listed, sizeof(listed), &needed, &error);
  CHECK(code == LARKX_OK);
  return listed;
}

bool register_remote_ok(larkx_runtime* runtime, const larkx_remote_spec* remote) {
  larkx_agent_spec spec{};
  spec.name = "field";
  spec.version = 1;
  spec.instructions = "Inspect equipment.";
  spec.model_id = "scripted";
  spec.model_name = "scripted-1";
  spec.tool_calling = 1;
  spec.remote_agents = remote;
  spec.remote_count = 1;
  spec.allow_remote = 1;
  larkx_error error{};
  return larkx_agent_register(runtime, &spec, &error) == LARKX_OK;
}

void expect_endpoint_rejected(const char* endpoint) {
  const auto path = temp_db();
  auto* runtime = open_runtime(path);
  auto remote = procurement(0, 0, 1, 0);
  remote.endpoint = endpoint;
  CHECK(!register_remote_ok(runtime, &remote));
  larkx_runtime_close(runtime);
  std::remove(path.c_str());
}

void test_remote_endpoint_identity() {
  expect_endpoint_rejected("http://user:pass@127.0.0.1:8787");
  expect_endpoint_rejected("http://127.0.0.1:8787?x=1");
  expect_endpoint_rejected("http://127.0.0.1:8787#frag");
  expect_endpoint_rejected("http://127.0.0.1:8787/a b");
  expect_endpoint_rejected("ftp://127.0.0.1:8787");
  expect_endpoint_rejected("http://127.0.0.1:8787\f");
  expect_endpoint_rejected("\vhttp://127.0.0.1:8787");

  const auto path = temp_db();
  auto* runtime = open_runtime(path);
  auto remote = procurement(0, 0, 1, 0);
  remote.endpoint = " http://127.0.0.1:8787/ ";
  register_remote_agent(runtime, &remote, 1);
  start_run(runtime, "field", 1, "endpoint-1", "Inspect pump P-104");
  const auto request = delegate_after_model(runtime, "endpoint-1");
  CHECK(contains(request.detail, "\"endpoint\":\"http://127.0.0.1:8787\""));
  CHECK(contains(request.detail, "\"transportId\":\"http:http://127.0.0.1:8787\""));
  CHECK(!contains(request.detail, "8787/"));
  CHECK(contains(request.detail, "\"dedupe\":false"));
  CHECK(contains(request.detail, "\"lookup\":false"));
  larkx_runtime_close(runtime);
  std::remove(path.c_str());
}

void test_remote_offline_lookup_preserves_uncertainty() {
  const auto path = temp_db();
  auto* runtime = open_runtime(path);
  const auto remote = procurement(0, 1, 1, 0);
  register_remote_agent(runtime, &remote, 1);
  start_run(runtime, "field", 1, "offline-1", "Inspect pump P-104");
  const auto request = delegate_after_model(runtime, "offline-1");
  const std::string operation = request.request.operation_id;
  submit_remote(runtime, "offline-1", request.request.request_id, "{\"action\":\"submit\",\"outcome\":\"network\"}", 40);
  const auto early = drive(runtime, "offline-1", 40);
  CHECK(early.request.kind == LARKX_REQUEST_WAIT);
  CHECK(contains(early.detail, "network"));
  const auto lookup = drive(runtime, "offline-1", 140);
  CHECK(lookup.request.kind == LARKX_REQUEST_DELEGATE);
  CHECK(contains(lookup.detail, "\"action\":\"lookup\""));
  CHECK(!contains(lookup.detail, "\"action\":\"submit\""));
  CHECK(std::strcmp(lookup.request.operation_id, operation.c_str()) == 0);
  submit_remote(runtime, "offline-1", lookup.request.request_id, "{\"action\":\"lookup\",\"outcome\":\"offline\"}", 140);
  const auto waiting = drive(runtime, "offline-1", 140);
  CHECK(waiting.request.kind == LARKX_REQUEST_WAIT);
  CHECK(contains(waiting.detail, "network"));
  const auto listed = listed_delegations(runtime, "offline-1");
  CHECK(contains(listed, "\"state\":\"SUBMITTING\""));
  CHECK(!contains(listed, "QUEUED"));
  larkx_runtime_close(runtime);

  auto* recovered = open_runtime(path);
  register_remote_agent(recovered, &remote, 1);
  const auto again = drive(recovered, "offline-1", 400);
  CHECK(again.request.kind == LARKX_REQUEST_DELEGATE);
  CHECK(contains(again.detail, "\"action\":\"lookup\""));
  CHECK(!contains(again.detail, "\"action\":\"submit\""));
  CHECK(std::strcmp(again.request.operation_id, operation.c_str()) == 0);
  submit_remote(recovered, "offline-1", again.request.request_id,
                "{\"action\":\"lookup\",\"outcome\":\"accepted\",\"taskId\":\"task-9\"}", 400);
  const auto poll_wait = drive(recovered, "offline-1", 400);
  CHECK(poll_wait.request.kind == LARKX_REQUEST_WAIT);
  CHECK(contains(poll_wait.detail, "remote"));
  const auto poll = drive(recovered, "offline-1", 460);
  CHECK(poll.request.kind == LARKX_REQUEST_DELEGATE);
  CHECK(contains(poll.detail, "\"action\":\"poll\""));
  CHECK(contains(poll.detail, "task-9"));
  larkx_runtime_close(recovered);
  std::remove(path.c_str());
}

void test_remote_omitted_dedupe_does_not_resubmit() {
  const auto path = temp_db();
  auto* runtime = open_runtime(path);
  const auto remote = procurement(0, 0, 1, 0);
  register_remote_agent(runtime, &remote, 1);
  start_run(runtime, "field", 1, "omit-1", "Inspect pump P-104");
  const auto request = delegate_after_model(runtime, "omit-1");
  const std::string operation = request.request.operation_id;
  submit_remote(runtime, "omit-1", request.request.request_id, "{\"action\":\"submit\",\"outcome\":\"network\"}", 40);
  const auto waiting = drive(runtime, "omit-1", 40);
  CHECK(waiting.request.kind == LARKX_REQUEST_WAIT);
  const auto blocked = drive(runtime, "omit-1", 140);
  CHECK(blocked.request.kind == LARKX_REQUEST_RECONCILE);
  CHECK(blocked.request.kind != LARKX_REQUEST_FAILED);
  CHECK(std::strcmp(blocked.request.operation_id, operation.c_str()) == 0);
  const auto listed = listed_delegations(runtime, "omit-1");
  CHECK(contains(listed, "\"state\":\"UNKNOWN_OUTCOME\""));
  larkx_error error{};
  CHECK(larkx_run_submit_reconcile(runtime, "omit-1", blocked.request.request_id, "retry", "null", "try again", 150, &error) !=
        LARKX_OK);
  larkx_runtime_close(runtime);
  std::remove(path.c_str());
}

void test_remote_invalid_responses_do_not_fail_a_possible_submission() {
  const auto path = temp_db();
  auto* runtime = open_runtime(path);
  const auto remote = procurement(0, 1, 1, 0);
  register_remote_agent(runtime, &remote, 1);
  start_run(runtime, "field", 1, "invalid-1", "Inspect pump P-104");
  const auto request = delegate_after_model(runtime, "invalid-1");
  submit_remote(runtime, "invalid-1", request.request.request_id, "{\"action\":\"submit\",\"outcome\":\"invalid\"}", 40);
  const auto lookup = drive(runtime, "invalid-1", 140);
  CHECK(lookup.request.kind == LARKX_REQUEST_DELEGATE);
  CHECK(contains(lookup.detail, "\"action\":\"lookup\""));
  submit_remote(runtime, "invalid-1", lookup.request.request_id, "{\"action\":\"lookup\",\"outcome\":\"invalid\"}", 140);
  const auto again = drive(runtime, "invalid-1", 340);
  CHECK(again.request.kind == LARKX_REQUEST_DELEGATE);
  CHECK(contains(again.detail, "\"action\":\"lookup\""));
  submit_remote(runtime, "invalid-1", again.request.request_id, "{\"action\":\"lookup\",\"outcome\":\"invalid\"}", 340);
  const auto blocked = drive(runtime, "invalid-1", 340);
  CHECK(blocked.request.kind == LARKX_REQUEST_RECONCILE);
  CHECK(blocked.request.kind != LARKX_REQUEST_FAILED);
  CHECK(contains(listed_delegations(runtime, "invalid-1"), "\"state\":\"UNKNOWN_OUTCOME\""));
  larkx_runtime_close(runtime);
  std::remove(path.c_str());
}

void test_remote_invalid_poll_does_not_fail_a_known_task() {
  const auto path = temp_db();
  auto* runtime = open_runtime(path);
  const auto remote = procurement(0, 1, 1, 0);
  register_remote_agent(runtime, &remote, 1);
  start_run(runtime, "field", 1, "working-1", "Inspect pump P-104");
  const auto request = delegate_after_model(runtime, "working-1");
  submit_remote(runtime, "working-1", request.request.request_id,
                "{\"action\":\"submit\",\"outcome\":\"accepted\",\"taskId\":\"task-4\"}", 40);
  const auto poll = drive(runtime, "working-1", 90);
  CHECK(contains(poll.detail, "\"action\":\"poll\""));
  submit_remote(runtime, "working-1", poll.request.request_id,
                "{\"action\":\"poll\",\"outcome\":\"invalid\",\"taskId\":\"task-4\"}", 90);
  const auto backed_off = drive(runtime, "working-1", 100);
  CHECK(backed_off.request.kind == LARKX_REQUEST_WAIT);
  const auto second = drive(runtime, "working-1", 190);
  CHECK(contains(second.detail, "\"action\":\"poll\""));
  submit_remote(runtime, "working-1", second.request.request_id,
                "{\"action\":\"poll\",\"outcome\":\"working\",\"taskId\":\"task-4\"}", 190);
  const auto steady = drive(runtime, "working-1", 200);
  CHECK(steady.request.kind == LARKX_REQUEST_WAIT);
  CHECK(contains(steady.detail, "remote"));
  const auto third = drive(runtime, "working-1", 240);
  CHECK(third.request.kind == LARKX_REQUEST_DELEGATE);
  CHECK(contains(third.detail, "\"action\":\"poll\""));
  CHECK(contains(listed_delegations(runtime, "working-1"), "\"state\":\"WORKING\""));
  larkx_runtime_close(runtime);
  std::remove(path.c_str());
}

void test_a2a_continuation_blocks_when_the_acknowledgement_is_lost() {
  const auto path = temp_db();
  auto* runtime = open_runtime(path);
  auto remote = procurement(1, 1, 1, 1);
  remote.transport = "a2a";
  larkx_agent_spec denied_spec{};
  denied_spec.name = "field";
  denied_spec.version = 1;
  denied_spec.instructions = "Inspect equipment.";
  denied_spec.model_id = "scripted";
  denied_spec.model_name = "scripted-1";
  denied_spec.tool_calling = 1;
  denied_spec.remote_agents = &remote;
  denied_spec.remote_count = 1;
  denied_spec.allow_remote = 1;
  larkx_error error{};
  CHECK(larkx_agent_register(runtime, &denied_spec, &error) == LARKX_ERR_INVALID_ARGUMENT);

  remote.dedupe = 0;
  remote.lookup = 0;
  register_remote_agent(runtime, &remote, 1, "a2a-field");
  start_run(runtime, "a2a-field", 1, "a2a-lost", "Inspect pump P-104");
  const auto lost = delegate_after_model(runtime, "a2a-lost");
  CHECK(contains(lost.detail, "\"transport\":\"a2a\""));
  submit_remote(runtime, "a2a-lost", lost.request.request_id, "{\"action\":\"submit\",\"outcome\":\"network\"}", 40);
  const auto waiting_lost = drive(runtime, "a2a-lost", 40);
  CHECK(waiting_lost.request.kind == LARKX_REQUEST_WAIT);
  const auto blocked_lost = drive(runtime, "a2a-lost", 140);
  CHECK(blocked_lost.request.kind == LARKX_REQUEST_RECONCILE);
  CHECK(larkx_run_submit_reconcile(runtime, "a2a-lost", blocked_lost.request.request_id, "retry", "null", "again", 55, &error) !=
        LARKX_OK);

  start_run(runtime, "a2a-field", 1, "a2a-1", "Inspect pump P-104");
  const auto request = delegate_after_model(runtime, "a2a-1");
  submit_remote(runtime, "a2a-1", request.request.request_id,
                "{\"action\":\"submit\",\"contextId\":\"ctx-a2a\",\"message\":\"What is the model number?\","
                "\"outcome\":\"input_required\",\"remoteIdentity\":\"Procurement\",\"remoteStatus\":\"TASK_STATE_INPUT_REQUIRED\","
                "\"taskId\":\"task-a2a\"}");
  const auto blocked = drive(runtime, "a2a-1", 60);
  CHECK(blocked.request.kind == LARKX_REQUEST_RECONCILE);
  CHECK(contains(blocked.detail, "remote_input_required"));
  CHECK(contains(blocked.detail, "What is the model number?"));
  CHECK(larkx_run_provide_input(runtime, "a2a-1", blocked.request.step_key, "Model 12", 70, &error) == LARKX_OK);
  const auto continuation = drive(runtime, "a2a-1", 80);
  CHECK(continuation.request.kind == LARKX_REQUEST_DELEGATE);
  CHECK(contains(continuation.detail, "\"action\":\"continue\""));
  CHECK(contains(continuation.detail, "ctx-a2a"));
  CHECK(contains(continuation.detail, "Model 12"));
  CHECK(!contains(continuation.detail, "Inspect pump"));
  submit_remote(runtime, "a2a-1", continuation.request.request_id, "{\"action\":\"continue\",\"outcome\":\"network\"}", 90);
  const auto unknown = drive(runtime, "a2a-1", 100);
  CHECK(unknown.request.kind == LARKX_REQUEST_RECONCILE);
  CHECK(larkx_run_submit_reconcile(runtime, "a2a-1", unknown.request.request_id, "retry", "null", "again", 110, &error) ==
        LARKX_OK);
  const auto polled = drive(runtime, "a2a-1", 120);
  CHECK(polled.request.kind == LARKX_REQUEST_DELEGATE);
  CHECK(contains(polled.detail, "\"action\":\"poll\""));
  CHECK(!contains(polled.detail, "\"action\":\"continue\""));
  CHECK(!contains(polled.detail, "\"action\":\"submit\""));

  start_run(runtime, "a2a-field", 1, "a2a-known", "Inspect pump P-104");
  const auto known = delegate_after_model(runtime, "a2a-known");
  submit_remote(runtime, "a2a-known", known.request.request_id,
                "{\"action\":\"submit\",\"contextId\":\"ctx-known\",\"outcome\":\"accepted\",\"remoteStatus\":\"TASK_STATE_SUBMITTED\","
                "\"taskId\":\"task-known\"}");
  larkx_runtime_close(runtime);
  auto* recovered = open_runtime(path);
  register_remote_agent(recovered, &remote, 1, "a2a-field");
  const auto poll = drive(recovered, "a2a-known", 200);
  CHECK(poll.request.kind == LARKX_REQUEST_DELEGATE);
  CHECK(contains(poll.detail, "\"action\":\"poll\""));
  CHECK(contains(poll.detail, "task-known"));
  CHECK(!contains(poll.detail, "\"action\":\"submit\""));
  larkx_runtime_close(recovered);
  std::remove(path.c_str());
}

void test_a2a_auth_required_is_not_remote_input() {
  const auto path = temp_db();
  auto* runtime = open_runtime(path);
  auto remote = procurement(0, 0, 1, 1);
  remote.transport = "a2a";
  register_remote_agent(runtime, &remote, 1, "a2a-field");
  start_run(runtime, "a2a-field", 1, "a2a-auth", "Inspect pump P-104");
  const auto request = delegate_after_model(runtime, "a2a-auth");
  submit_remote(runtime, "a2a-auth", request.request.request_id,
                "{\"action\":\"submit\",\"contextId\":\"ctx-auth\",\"message\":\"Sign in to the supplier.\","
                "\"outcome\":\"auth_required\",\"remoteStatus\":\"TASK_STATE_AUTH_REQUIRED\",\"taskId\":\"task-auth\"}");
  const auto blocked = drive(runtime, "a2a-auth", 60);
  CHECK(blocked.request.kind == LARKX_REQUEST_RECONCILE);
  CHECK(contains(blocked.detail, "remote_auth_required"));
  CHECK(!contains(blocked.detail, "remote_input_required"));
  larkx_error error{};
  CHECK(larkx_run_provide_input(runtime, "a2a-auth", blocked.request.step_key, "secret-token", 70, &error) != LARKX_OK);
  CHECK(contains(error.message, "credentials"));
  CHECK(!contains(listed_delegations(runtime, "a2a-auth"), "secret-token"));
  CHECK(larkx_run_submit_reconcile(runtime, "a2a-auth", blocked.request.request_id, "retry", "null",
                                  "Host refreshed authorization headers.", 80, &error) == LARKX_OK);
  const auto poll = drive(runtime, "a2a-auth", 90);
  CHECK(poll.request.kind == LARKX_REQUEST_DELEGATE);
  CHECK(contains(poll.detail, "\"action\":\"poll\""));
  CHECK(contains(poll.detail, "task-auth"));
  CHECK(!contains(poll.detail, "\"action\":\"continue\""));
  CHECK(!contains(poll.detail, "\"action\":\"submit\""));
  CHECK(!contains(poll.detail, "secret-token"));
  larkx_runtime_close(runtime);
  std::remove(path.c_str());
}

std::string read_text(auto&& call) {
  std::string buffer(4096, '\0');
  size_t needed = 0;
  larkx_error error{};
  larkx_code code = call(buffer.data(), buffer.size(), &needed, &error);
  if (code == LARKX_ERR_CAPACITY && needed > buffer.size()) {
    buffer.assign(needed, '\0');
    code = call(buffer.data(), buffer.size(), &needed, &error);
  }
  CHECK(code == LARKX_OK);
  return buffer.c_str();
}

void test_event_page_reads_a_bounded_slice() {
  const auto path = temp_db();
  auto* runtime = open_runtime(path);
  register_agent(runtime, "bulk", 1, nullptr, 0);
  start_run(runtime, "bulk", 1, "kept");
  larkx_runtime_close(runtime);

  sqlite3* database = nullptr;
  CHECK(sqlite3_open(path.c_str(), &database) == SQLITE_OK);
  char* sql_error = nullptr;
  CHECK(sqlite3_exec(database, "BEGIN", nullptr, nullptr, &sql_error) == SQLITE_OK);
  CHECK(sqlite3_exec(database,
                     "INSERT INTO workflow_runs (run_id, workflow_name, workflow_version, input_json, status, "
                     "created_at, updated_at, ownership_epoch, protocol_version, data_policy, cancel_requested) "
                     "VALUES ('bulk-history', 'bulk', 1, '{\"message\":\"SECRET_INPUT\"}', 'COMPLETED', 1, 9, 0, 1, "
                     "'device-only', 0)",
                     nullptr, nullptr, &sql_error) == SQLITE_OK);
  CHECK(sqlite3_exec(database,
                     "INSERT INTO workflow_steps (run_id, step_key, step_order, status, execution_target, "
                     "selected_target, effect_type, attempt_count, input_json, output_json, operation_id, "
                     "descriptor_json, created_at, updated_at) VALUES ('bulk-history', 'read', 0, 'COMPLETED', 'local', "
                     "'local', 'pure', 1, '{\"secret\":\"SECRET_STEP_INPUT\"}', '\"SECRET_STEP_OUTPUT\"', 'op-bulk', "
                     "'{\"effects\":\"pure\",\"execution\":\"local\"}', 1, 2)",
                     nullptr, nullptr, &sql_error) == SQLITE_OK);
  sqlite3_stmt* insert = nullptr;
  CHECK(sqlite3_prepare_v2(database,
                           "INSERT INTO workflow_events (event_id, run_id, sequence, event_type, payload_json, "
                           "created_at) VALUES (?, 'bulk-history', ?, 'STEP_COMPLETED', ?, 3)",
                           -1, &insert, nullptr) == SQLITE_OK);
  constexpr int kEvents = 2500;
  for (int sequence = 1; sequence <= kEvents; sequence += 1) {
    const std::string id = "ev-" + std::to_string(sequence);
    const std::string marker = sequence <= 2000 ? "OLD-PAYLOAD" : "NEW-PAYLOAD";
    const std::string payload = std::string("{\"stepKey\":\"read\",\"marker\":\"") + marker + "\"}";
    sqlite3_bind_text(insert, 1, id.c_str(), -1, SQLITE_TRANSIENT);
    sqlite3_bind_int(insert, 2, sequence);
    sqlite3_bind_text(insert, 3, payload.c_str(), -1, SQLITE_TRANSIENT);
    CHECK(sqlite3_step(insert) == SQLITE_DONE);
    sqlite3_reset(insert);
    sqlite3_clear_bindings(insert);
  }
  sqlite3_finalize(insert);
  CHECK(sqlite3_exec(database, "COMMIT", nullptr, nullptr, &sql_error) == SQLITE_OK);
  sqlite3_close(database);

  runtime = open_runtime(path);
  const std::string heads = read_text([&](char* data, size_t capacity, size_t* needed, larkx_error* error) {
    return larkx_run_journal_heads(runtime, data, capacity, needed, error);
  });
  CHECK(heads.find("SECRET_INPUT") == std::string::npos);
  CHECK(heads.find("OLD-PAYLOAD") == std::string::npos);
  CHECK(heads.find("\"maxSequence\":2500") != std::string::npos);
  CHECK(heads.find("bulk-history") != std::string::npos);

  size_t needed = 0;
  larkx_error error{};
  char small[64];
  const larkx_code too_small = larkx_run_event_page(runtime, "bulk-history", 2000, 10, small, sizeof(small), &needed, &error);
  CHECK(too_small == LARKX_ERR_CAPACITY);
  CHECK(needed > sizeof(small));
  CHECK(needed < 8000);
  const std::string page = read_text([&](char* data, size_t capacity, size_t* needed_out, larkx_error* page_error) {
    return larkx_run_event_page(runtime, "bulk-history", 2000, 10, data, capacity, needed_out, page_error);
  });
  CHECK(page.find("OLD-PAYLOAD") == std::string::npos);
  CHECK(page.find("SECRET_STEP_OUTPUT") == std::string::npos);
  CHECK(page.find("SECRET_STEP_INPUT") == std::string::npos);
  CHECK(page.find("SECRET_INPUT") == std::string::npos);
  int markers = 0;
  for (size_t cursor = 0; (cursor = page.find("NEW-PAYLOAD", cursor)) != std::string::npos; cursor += 11) {
    markers += 1;
  }
  CHECK(markers == 10);
  CHECK(page.find("\"sequence\":2001") != std::string::npos);
  CHECK(page.find("\"sequence\":2010") != std::string::npos);
  CHECK(page.find("\"sequence\":2011") == std::string::npos);
  CHECK(page.find("\"maxSequence\":2500") != std::string::npos);
  larkx_error invalid{};
  CHECK(larkx_run_event_page(runtime, "bulk-history", 0, 501, small, sizeof(small), &needed, &invalid) ==
        LARKX_ERR_INVALID_ARGUMENT);
  larkx_runtime_close(runtime);
  std::remove(path.c_str());
}

void test_context_limit_does_not_invoke_the_model() {
  const auto path = temp_db();
  auto* runtime = open_runtime(path);
  register_agent(runtime, "context", 1, nullptr, 0, 0, 0, 20);
  start_run(runtime, "context", 1, "context-1", "This message is longer than the context budget");
  const auto failed = drive(runtime, "context-1");
  CHECK(failed.request.kind == LARKX_REQUEST_FAILED);
  CHECK(contains(failed.detail, "Context limit exceeded."));
  larkx_runtime_close(runtime);
  std::remove(path.c_str());
}

}  // namespace

int main() {
  CHECK(larkx_abi_version() == 4);
  test_single_turn_persists_before_the_model_runs();
  test_dynamic_tool_calls_keep_stable_keys();
  test_invalid_tools_do_not_ask_the_host_to_execute_them();
  test_malformed_model_response_fails_the_run();
  test_limits_stop_the_loop();
  test_retries_keep_the_operation_id();
  test_pause_and_cancel();
  test_recovery_replays_committed_work_and_blocks_non_idempotent_interrupts();
  test_duplicate_and_stale_results_are_rejected();
  test_agent_version_and_effect_compatibility();
  test_open_attempt_can_be_submitted_after_reopen();
  test_event_page_reads_a_bounded_slice();
  test_context_limit_does_not_invoke_the_model();
  test_remote_delegation_commits_before_the_parent_continues();
  test_remote_lost_ack_without_lookup_or_dedupe_blocks();
  test_remote_cancel_and_stale_owner();
  test_remote_failure_is_not_a_successful_result();
  test_remote_endpoint_identity();
  test_remote_offline_lookup_preserves_uncertainty();
  test_remote_omitted_dedupe_does_not_resubmit();
  test_remote_invalid_responses_do_not_fail_a_possible_submission();
  test_remote_invalid_poll_does_not_fail_a_known_task();
  test_a2a_continuation_blocks_when_the_acknowledgement_is_lost();
  test_a2a_auth_required_is_not_remote_input();
  test_run_list_returns_persisted_runs();
  if (g_failed != 0) {
    std::fprintf(stderr, "%d checks failed\n", g_failed);
    return 1;
  }
  std::puts("larkx agent runtime tests passed");
  return 0;
}
