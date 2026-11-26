# LangGraph procurement agent

This example is an independently deployed procurement agent. LangGraph runs the graph. `@a2a-js/sdk` exposes A2A protocol 1.0 JSON-RPC. LarkX is not in this process and does not store its tasks.

Tasks are kept in the SDK's `InMemoryTaskStore`. They survive a LarkX client crash while this process stays up. They do not survive a restart of this process. A production agent should use its own task store. The SDK ships `DatabaseTaskStore` from `@a2a-js/sdk/server/database` for PostgreSQL, MySQL, SQLite, and Cloudflare D1. This example does not implement one.

The catalog is fictional. Every recommendation is marked simulated.

## Deterministic mode

This is what CI uses. The graph still runs. No model credential is required.

```bash
pnpm --filter @larkxai/example-langgraph-a2a build
PORT=8791 node dist/server.js
```

The agent card is `GET http://127.0.0.1:8791/.well-known/agent-card.json`. The JSON-RPC endpoint is `http://127.0.0.1:8791`. `GET /_inspection` lists graph executions for local checks. It is not an A2A method.

If the request does not name a model, the graph asks for one and the task becomes `TASK_STATE_INPUT_REQUIRED`. A continuation on the same task that includes `Model P-104` searches the catalog.

`LARKX_LANGGRAPH_HOLD=1` pauses inside the LangGraph graph until `POST /_release`. That barrier is a demonstration control for the recovery test. The remote task exists, and the phone can be force-quit while it is outstanding. It is not an artificial delay inside the local model or a local tool. The field-inspection sequence is [docs/demo/flagship-mobile-demo.md](../../docs/demo/flagship-mobile-demo.md). `CancelTask` aborts the signal passed to `graph.invoke`. The server does not publish `TASK_STATE_COMPLETED` after that. A graph node that ignores the signal can still finish its current step. This example does not claim that a cloud model call is preempted.

## Cloud model

Set both variables before starting the server. The interpret node calls the OpenAI chat completions API. The catalog node still runs inside the same graph. Do not commit the key.

```bash
LARKX_LANGGRAPH_MODEL=openai OPENAI_API_KEY=... OPENAI_MODEL=gpt-4o-mini PORT=8791 node dist/server.js
```

## LangSmith Agent Server

Python `langgraph dev` and a deployed LangSmith Agent Server expose `/a2a/{assistant_id}` and speak A2A 1.0 JSON-RPC. Point `remoteAgent` at that URL. The card is `GET /.well-known/agent-card.json?assistant_id=...` on the server, or `GET {endpoint}/.well-known/agent-card.json` when the endpoint already includes the assistant id.

TypeScript `langgraph dev` does not expose A2A locally. Use this example, the Python server, or LangSmith Agent Server. This repository does not claim a LangGraph partnership.
