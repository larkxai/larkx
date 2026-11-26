# Remote delegation

A local agent can delegate one step to an independently deployed remote agent. The C++ runtime stores the delegation before any network request. The host performs HTTP. The remote agent owns its own reasoning, tools, and task store. LarkX does not run that agent and does not claim exactly-once remote execution.

A2A is the planned standard for talking to an independently deployed agent, including a LangGraph, Google ADK, or OpenAI Agents SDK service. This HTTP task protocol stays as a generic transport and as the test foundation. It is not a proprietary agent ecosystem, and it is not A2A.

## Three different setups

- A local agent using a local model keeps the model call and the tools on the device. Cactus is one local model adapter.
- A local agent using a cloud model still runs the agent loop here. Only the model request leaves the device. That path is not this feature.
- A local agent delegating to an independent remote agent keeps the parent run here and sends one task to a remote agent that has its own runtime. The remote result comes back as an observation for the next local model call.

## Public API

`remoteAgent` is exported from `@larkxai/react-native`, the public SDK. The private Node host exports the same function for tests. There is no third package.

```typescript
import { createRuntime, defineTool, remoteAgent, sqlite } from "@larkxai/react-native";

const procurement = remoteAgent({
  name: "procurement-agent",
  description: "Find compatible replacement parts and suppliers.",
  transport: {
    type: "http",
    endpoint: "https://agents.example.com/procurement",
  },
});

const runtime = await createRuntime({ storage: sqlite("./agent.db") });
const agent = runtime.createAgent({
  name: "field-assistant",
  version: 1,
  model,
  instructions: "Inspect equipment and identify replacement parts.",
  tools: [readInspectionNotes, getEquipmentDetails, saveReport],
  remoteAgents: [procurement],
});
```

Registering at least one remote agent authorizes remote delegation for that agent and stores the run as `cloud-allowed`. With no remote agents the run stays `device-only`. The model sees each remote agent as a tool. The runtime does not execute it as a local handler.

`run.getDelegations()` returns the operation id, remote task id, state, endpoint, and cancel intent. It does not return the outbound arguments.

Credentials belong in `transport.headers`. That callback runs in the host. Its return value is not passed to the runtime and is not written to SQLite.

## Transport contract

An adapter declares the capabilities it will honor. The runtime stores that declaration with the delegation and uses the stored copy after a restart. Turning a capability on later does not make an old delegation safe.

| Capability   | Meaning                                                                   |
| ------------ | ------------------------------------------------------------------------- |
| `dedupe`     | The same operation id and the same request will not create a second task. |
| `lookup`     | `GET /operations/{operationId}` returns the accepted task.                |
| `taskId`     | The peer assigns a durable task id.                                       |
| `poll`       | `GET /tasks/{taskId}` returns status.                                     |
| `cancel`     | `POST /tasks/{taskId}/cancel` asks the peer to cancel.                    |
| `persistent` | The peer keeps the task after this client disconnects.                    |

`dedupe` and `lookup` default to false. An arbitrary endpoint is not assumed to deduplicate submissions or to answer an operation lookup. Declare both when the peer implements them. `taskId`, `poll`, `cancel`, and `persistent` default to true because this task protocol defines them; set one to false when the peer does not honor it. Sending `Idempotency-Key` does not prove the peer deduplicates. A partial declaration does not turn `dedupe` or `lookup` back on.

Actions are `submit`, `lookup`, `poll`, and `cancel`.

## HTTP task protocol

Endpoint rules match in TypeScript and C++: `http` or `https`, no userinfo, no query, no fragment, no ASCII whitespace, at most 200 characters after normalization. A trailing slash is removed only when the path is empty. `http` exists so the local fixture and Node tests can run. A phone must use the computer's LAN address, not `localhost`.

```http
POST /tasks
Idempotency-Key: op-123
Content-Type: application/json
```

```json
{ "operationId": "op-123", "input": { "objective": "Find a seal" } }
```

Acceptance is HTTP 200 or 202:

```json
{ "taskId": "task-789", "status": "accepted" }
```

Status values are `accepted`, `working`, `input_required`, `completed`, `failed`, and `cancelled`. Task ids match `^[A-Za-z0-9._:-]{1,128}$`. The stored input is at most 32768 canonical bytes. A result is at most 65536 canonical bytes.

`GET /tasks/{taskId}` polls. `GET /operations/{operationId}` reconciles a lost acceptance. `POST /tasks/{taskId}/cancel` cancels. The HTTP connection is not held open for the life of the task. The host polls at the configured interval (50 to 60000 ms, default 1000). Transport failures back off by doubling that interval, capped at 30 seconds. A later `accepted` or `working` status is a live task and clears that backoff. The host does not use `AbortSignal.timeout` or `AbortSignal.any`. Each request uses an `AbortController` and a timer, so the same driver runs on Node.js and the documented React Native host. `timeoutMs` defaults to 15000 and must be from 1 to 120000.

`input_required` keeps the task and blocks the parent with `remote_input_required`. Reconcile can complete or fail that run locally. Sending the missing input to the remote agent is not implemented.

## Delegation states

`QUEUED`, `SUBMITTING`, `ACCEPTED`, `WORKING`, `INPUT_REQUIRED`, `COMPLETED`, `FAILED`, `CANCELLED`, `UNKNOWN_OUTCOME`.

The parent step uses the existing step statuses. `WAITING_REMOTE` means the parent is waiting on the remote task. That is not the workflow `WAITING` pause and not a blocked unknown outcome. A completed remote result is stored as the step output before the next model call. A remote failure fails the parent. It is not rewritten as a successful tool result.

Terminal delegation states do not start another remote task.

## What is stored before the request

In one transaction, before the host is asked to send anything:

- parent run id and agent identity
- delegation step id
- remote agent name and normalized endpoint
- stable client operation id
- the authorized arguments
- transport id `http:` plus the endpoint
- the declared capabilities
- delegation state `SUBMITTING`
- an outbox row

The client operation id stays the same across retries. The remote task id is a different id, stored only after acceptance. The event journal records ids and the endpoint. It does not record the arguments, the result, or credentials.

SQLite `application_id` stays `0x4C585254`. Fresh files are storage schema 2. An owned schema 1 file gains the `delegations` table. A newer schema is rejected. Files with any other application id are rejected and left unchanged.

The C ABI is version 3. Request kind 10 is `LARKX_REQUEST_DELEGATE`. The host submits the outcome with `larkx_run_submit_delegation`. A stale owner cannot commit that outcome.

## Recovery

A crash before the acceptance is stored looks the same as a crash before the request was sent. The runtime does not guess that the task was never created.

- A stored task id is polled. It is not submitted again. If polling was not declared, the delegation is `UNKNOWN_OUTCOME`.
- No task id, and lookup was declared: look the operation up. `not_found` plus dedupe allows the original submission. `not_found` without dedupe is `UNKNOWN_OUTCOME`.
- No task id, no lookup, and dedupe was declared: submit the original operation id again.
- Neither lookup nor dedupe: `UNKNOWN_OUTCOME`, the parent is `BLOCKED`, and nothing is submitted. `run.reconcile` can complete or fail it. Retry is rejected.
- The host reports `offline` or `not_sent` only when that attempt did not transmit. A dropped connection after send is `network` or `timeout`, which is uncertain.
- `offline` on the first submission, before any transport result, stores `QUEUED` and waits for a network. `offline` during lookup, polling, or a later submission keeps the existing state. It does not turn `SUBMITTING` back into `QUEUED`.
- Waiting with no stored task id is waiting for a network. Waiting with a task id is waiting on the remote task. Coming back online does not clear an uncertain submission.
- After a task id is known, a later network failure waits and polls. It does not create another task.
- Repeated invalid responses before a task id is stored become `UNKNOWN_OUTCOME`. They do not fail the parent. Invalid responses after a task id is known keep polling with the capped backoff. Exhausting that backoff does not mark an uncertain or accepted task as safely failed.

`run.reconcile({ resolution: "complete" })` stores the supplied output as the local observation. It does not contact the remote agent.

## Cancellation

`run.cancel()` is the API. There is no separate call that cancels only the remote task and continues the parent.

- A queued request that was never sent is cancelled locally.
- A known task is cancelled over HTTP when `cancel` is true.
- An uncertain submission is looked up when lookup is declared. Otherwise it becomes `UNKNOWN_OUTCOME` and is not submitted again, even when dedupe is true.
- If the adapter cannot cancel, the local run still becomes `CANCELLED` and the history says the remote task may still be active.
- Cancelling the local run does not roll back a remote effect that already happened.
- A result that arrives after the parent is terminal does not start the parent again.

## Authorization

The default is local-only. Remote delegation runs only for a registered remote agent, only to that agent's endpoint, and only with the arguments the model put on that call. The conversation, local history, files, images, and artifacts are not added. The same check runs on retries and after restart. A re-registered agent with a different endpoint fails closed and does not send.

The host rejects redirects. `fetch` is called with `redirect: "manual"`, and a 3xx response is a temporary transport result. Delegation arguments and credential headers are not sent to the redirect location. Endpoint parsing is the same in TypeScript and C++: `http` or `https`, no userinfo, no query, no fragment, no ASCII whitespace, at most 200 characters after normalization, and a trailing slash is removed only when the path is empty. The stored transport id is `http:` plus that normalized endpoint. A recovery whose registered endpoint or transport id differs from the stored row is unauthorized.

These checks do not sandbox arbitrary application tools. A local tool can still use the network on its own.

## Reference fixture and example

`examples/remote-task` is a development HTTP fixture with a JSON file, delayed completion, dedupe, lookup, cancel, a simulated failure, and a dropped acceptance. Callers that use it declare all six capabilities. The fixture does not advertise them, and omitting `dedupe` or `lookup` on the client does not make this process a safe retry peer. Its supplier recommendations are marked `simulated: true`. It is not a hosting product.

`examples/node-hybrid` is the field-inspection agent. It reads local notes, calls the fixture, and saves a local report. `--crash-during` stops the local process with `SIGKILL` while the fixture keeps the task. `--resume` continues the parent. No LarkX Cloud account is required.

See those directories for the commands. Physical-device steps are in [on-device-agent.md](../validation/on-device-agent.md). This repository has not run them on a phone.
