import Foundation

/// Host for the ABI 3 agent runtime.
///
/// The process drives `larkx_run_drive` and submits results. It does not link a
/// model SDK. Closing the runtime leaves the SQLite file in place. Reopening
/// with the same owner id continues the same run.

func fail(_ label: String, _ error: larkx_error) -> Never {
  var copy = error
  let message = withUnsafePointer(to: &copy.message) {
    $0.withMemoryRebound(to: CChar.self, capacity: 384) { String(cString: $0) }
  }
  fputs("\(label): \(message)\n", stderr)
  exit(1)
}

func must(_ code: larkx_code, _ error: larkx_error, _ label: String) {
  if larkx_example_ok(code) == 0 {
    fail(label, error)
  }
}

func text<T>(_ value: T) -> String {
  var copy = value
  return withUnsafePointer(to: &copy) {
    $0.withMemoryRebound(to: CChar.self, capacity: MemoryLayout<T>.size) { String(cString: $0) }
  }
}

func pointer(_ literal: StaticString) -> UnsafePointer<CChar> {
  UnsafeRawPointer(literal.utf8Start).assumingMemoryBound(to: CChar.self)
}

func expect(_ condition: Bool, _ label: String) {
  if !condition {
    fputs("\(label)\n", stderr)
    exit(1)
  }
}

func openRuntime(_ path: String) -> OpaquePointer {
  var runtime: OpaquePointer?
  var error = larkx_error()
  let code = path.withCString { pathPointer in
    larkx_runtime_open(pathPointer, 0, pointer("swift-host"), 0, &runtime, &error)
  }
  must(code, error, "runtime open")
  return runtime!
}

func registerAgent(_ runtime: OpaquePointer) {
  var tool = larkx_tool_spec()
  tool.name = pointer("get_note")
  tool.description = pointer("Read a note")
  tool.input_schema_json = pointer("{\"type\":\"object\",\"properties\":{},\"additionalProperties\":false}")
  tool.effects = pointer("pure")
  tool.max_attempts = 0
  tool.initial_interval_ms = -1
  tool.max_interval_ms = -1
  tool.backoff = pointer("fixed")
  var agent = larkx_agent_spec()
  agent.name = pointer("swift-notes")
  agent.version = 1
  agent.instructions = pointer("Remember one note.")
  agent.model_id = pointer("scripted")
  agent.model_name = pointer("scripted-1")
  agent.tool_calling = 1
  agent.tool_count = 1
  agent.max_iterations = 0
  agent.max_tool_calls = 0
  agent.max_invalid_tool_requests = 0
  agent.max_context_chars = 0
  agent.model_max_attempts = 0
  agent.model_initial_interval_ms = -1
  agent.model_max_interval_ms = -1
  agent.model_backoff = pointer("fixed")
  var error = larkx_error()
  let code = withUnsafePointer(to: &tool) { toolPointer in
    agent.tools = toolPointer
    return withUnsafePointer(to: &agent) { agentPointer in
      larkx_agent_register(runtime, agentPointer, &error)
    }
  }
  must(code, error, "register")
}

func drive(_ runtime: OpaquePointer, _ runId: StaticString, _ now: Int64) -> (larkx_exec_request, String) {
  var request = larkx_exec_request()
  var detail = [CChar](repeating: 0, count: 65536)
  var needed: Int = 0
  var error = larkx_error()
  let code = larkx_run_drive(runtime, pointer(runId), now, &request, &detail, detail.count, &needed, &error)
  must(code, error, "drive")
  return (request, String(cString: detail))
}

let template = strdup("/tmp/larkx-swift-XXXXXX")!
let fd = mkstemp(template)
expect(fd >= 0, "Could not create a temporary database.")
close(fd)
let database = String(cString: template)
free(template)

var runtime = openRuntime(database)
registerAgent(runtime)

var info = larkx_run_info()
var error = larkx_error()
let started = "{\"message\":\"Remember\"}".withCString { input in
  larkx_agent_start(runtime, pointer("swift-notes"), 1, pointer("swift-run-1"), input, 10, &info, &error)
}
must(started, error, "start")
expect(text(info.status) == "RUNNING", "Start did not persist a running run.")

let model = drive(runtime, "swift-run-1", 20)
expect(model.0.kind == larkx_example_kind_model(), "The first request was not a model invocation.")
expect(model.1.contains("Remember"), "The model request did not include the user message.")
let modelRequest = text(model.0.request_id)
let modelResponse =
  "{\"message\":null,\"finish\":\"tool_calls\",\"calls\":[{\"id\":\"note\",\"name\":\"get_note\",\"arguments\":{}}]}"
must(
  modelRequest.withCString { request in
    modelResponse.withCString { response in
      larkx_run_submit_model(runtime, pointer("swift-run-1"), request, response, nil, nil, 0, 21, &error)
    }
  }, error, "submit model")
larkx_runtime_close(runtime)

runtime = openRuntime(database)
registerAgent(runtime)
let tool = drive(runtime, "swift-run-1", 30)
expect(tool.0.kind == larkx_example_kind_tool(), "Recovery did not continue at the tool call.")
expect(text(tool.0.step_key) == "tool-0-0", "Recovered tool step key changed.")
let operation = text(tool.0.operation_id)
expect(!operation.isEmpty, "The tool request has no operation id.")
let toolRequest = text(tool.0.request_id)
must(
  toolRequest.withCString { request in
    "{\"kept\":true}".withCString { output in
      larkx_run_submit_tool(runtime, pointer("swift-run-1"), request, output, nil, nil, 0, 31, &error)
    }
  }, error, "submit tool")
let follow = drive(runtime, "swift-run-1", 32)
expect(follow.0.kind == larkx_example_kind_model(), "The loop did not return to the model.")
expect(text(follow.0.step_key) == "model-1", "The second model step key changed.")
let followRequest = text(follow.0.request_id)
must(
  followRequest.withCString { request in
    "{\"message\":\"noted\",\"finish\":\"stop\",\"calls\":[]}".withCString { response in
      larkx_run_submit_model(runtime, pointer("swift-run-1"), request, response, nil, nil, 0, 33, &error)
    }
  }, error, "submit final model")
larkx_runtime_close(runtime)

runtime = openRuntime(database)
registerAgent(runtime)
let complete = drive(runtime, "swift-run-1", 40)
expect(complete.0.kind == larkx_example_kind_complete(), "Reopen repeated work instead of completing.")
expect(complete.1.contains("noted"), "The completed result was not stored.")
var result = [CChar](repeating: 0, count: 512)
var needed: Int = 0
must(larkx_run_result(runtime, pointer("swift-run-1"), &result, result.count, &needed, &error), error, "result")
expect(String(cString: result).contains("noted"), "Run result did not contain the committed message.")
larkx_runtime_close(runtime)
unlink(database)
fputs("swift agent example recovered \(operation)\n", stdout)
