#include "larkx.h"

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
  char detail[65536];
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
  CHECK(larkx_abi_version() == 3);
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
  test_context_limit_does_not_invoke_the_model();
  test_remote_delegation_commits_before_the_parent_continues();
  test_remote_lost_ack_without_lookup_or_dedupe_blocks();
  test_remote_cancel_and_stale_owner();
  test_remote_failure_is_not_a_successful_result();
  test_run_list_returns_persisted_runs();
  if (g_failed != 0) {
    std::fprintf(stderr, "%d checks failed\n", g_failed);
    return 1;
  }
  std::puts("larkx agent runtime tests passed");
  return 0;
}
