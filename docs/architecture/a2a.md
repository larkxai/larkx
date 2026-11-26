# A2A 1.0

LarkX integrates with an existing agent. It does not replace LangGraph, and it does not ship an A2A server framework.

An on-device agent keeps its loop, tools, and SQLite record on the phone. A mobile frontend for a server-side agent would send the conversation to that server and wait. Those are different products. Here the phone can keep working offline on local tools, and a remote delegation is one durable step to a peer that has its own runtime.

## What A2A provides

A2A 1.0 defines the agent card, `SendMessage`, `GetTask`, and `CancelTask`, plus task states such as submitted, working, input required, completed, failed, canceled, and rejected. The selected binding is JSON-RPC 2.0. The negotiated version is major.minor `1.0`. v0.3 method names and lowercase states are not used.

`@a2a-js/sdk` 1.3.0 implements that specification, including a server, gRPC, and database transports that depend on Node.js. The public React Native SDK does not import it. `@larkxai/host` speaks the JSON-RPC subset with `fetch`. The LangGraph example uses the official server SDK in that example only.

## What LarkX adds

The C++ runtime stores the delegation before the request, keeps the client operation id, stores the remote task id and context id after a valid acceptance, and decides whether recovery may poll, continue, or block. The host performs discovery, authentication headers, HTTP, and timeouts. The remote agent owns its reasoning and its task store.

A2A does not by itself make submission idempotent. Reusing `messageId` is not a guarantee. A context id does not identify one submission. There is no lookup by client operation id. This client therefore sets `dedupe` and `lookup` to false and does not send `Idempotency-Key`.

## State mapping

A2A states are not copied into the runtime as new delegation states. The host reports an existing outcome and stores the raw state in `remote_status`.

| A2A state                                               | Host outcome     | Local delegation |
| ------------------------------------------------------- | ---------------- | ---------------- |
| `TASK_STATE_SUBMITTED`                                  | `accepted`       | `ACCEPTED`       |
| `TASK_STATE_WORKING`                                    | `working`        | `WORKING`        |
| `TASK_STATE_INPUT_REQUIRED`, `TASK_STATE_AUTH_REQUIRED` | `input_required` | `INPUT_REQUIRED` |
| `TASK_STATE_COMPLETED`, or an immediate message         | `completed`      | `COMPLETED`      |
| `TASK_STATE_FAILED`, `TASK_STATE_REJECTED`              | `failed`         | `FAILED`         |
| `TASK_STATE_CANCELED`                                   | `cancelled`      | `CANCELLED`      |
| unknown, while a task id is known                       | `temporary`      | keep polling     |

The parent distinguishes waiting for the network, waiting on a known task, waiting for `provideInput`, an unknown outcome, a terminal remote failure, and a completed result. The completed result is committed before the next local model call. Remote text is data. It does not execute tools or download files.

## Recovery

- A known task id is retrieved with `GetTask`. It is not submitted again.
- No task id, and the attempt may have been transmitted: `UNKNOWN_OUTCOME`. The parent stays `BLOCKED`. Retry is rejected because this peer has no documented lookup or dedupe.
- `offline` or `not_sent` before transmission leaves the operation queued. A dropped connection after send does not erase that uncertainty.
- A continuation uses message id `operationId:continue` on the same task and context. If that response is lost, the delegation is `UNKNOWN_OUTCOME` even though `GetTask` exists. A later explicit retry polls the known task. It does not send the continuation again.
- An immediate message has no task id. Losing that response is `UNKNOWN_OUTCOME`.

## Input, cancellation, and authorization

`run.provideInput(text)` answers one A2A input or authentication request. The text is the continuation, not the local conversation. Credentials stay in `transport.headers` and are not stored. Authentication required is surfaced as input required so the application can refresh those headers and then continue. The client does not retry credentials by itself.

Cancellation of a never-sent request stays local. Cancellation of a known task calls `CancelTask`. An uncertain submission is not sent again. Cancelling the parent does not claim the remote effect was rolled back. A late result does not restart a terminal run.

`discover: true` fetches the agent card and requires a JSON-RPC `1.0` interface whose URL is exactly the authorized endpoint. Skills are not registered as tools. Required extensions are rejected. Production endpoints should be `https`. `http` is for the local fixture and the development server.

## LangGraph

`examples/langgraph-a2a-agent` runs a real LangGraph graph and the official A2A server. The deterministic model is the default. `LARKX_LANGGRAPH_MODEL=openai` plus `OPENAI_API_KEY` calls a cloud model from inside that graph. TypeScript `langgraph dev` does not expose A2A locally. Python `langgraph dev` and LangSmith Agent Server expose `/a2a/{assistant_id}`. This repository does not claim a partnership with LangGraph.

The React Native field-inspection screen can select HTTP or A2A. The private Node example is `examples/node-hybrid --transport a2a`. It is not a public SDK.

Physical-device checks for this path are listed in [on-device-agent.md](../validation/on-device-agent.md) and have not been run on a phone.
