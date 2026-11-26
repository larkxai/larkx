# LangGraph procurement agent

This example is an independently deployed procurement agent. LangGraph runs the graph. `@a2a-js/sdk` exposes A2A protocol 1.0 JSON-RPC. LarkX is not in this process and does not store its tasks.

The catalog is fictional. Every recommendation is marked simulated.

## Deterministic mode

This is what CI uses. The graph still runs. No model credential is required.

```bash
pnpm --filter @larkxai/example-langgraph-a2a build
PORT=8791 node dist/server.js
```

The agent card is `GET http://127.0.0.1:8791/.well-known/agent-card.json`. The JSON-RPC endpoint is `http://127.0.0.1:8791`. `GET /_inspection` lists graph executions for local checks. It is not an A2A method.

If the request does not name a model, the graph asks for one and the task becomes `TASK_STATE_INPUT_REQUIRED`. A continuation on the same task that includes `Model P-104` searches the catalog.

## Cloud model

Set both variables before starting the server. The interpret node calls the OpenAI chat completions API. The catalog node still runs inside the same graph. Do not commit the key.

```bash
LARKX_LANGGRAPH_MODEL=openai OPENAI_API_KEY=... OPENAI_MODEL=gpt-4o-mini PORT=8791 node dist/server.js
```

## LangSmith Agent Server

Python `langgraph dev` and a deployed LangSmith Agent Server expose `/a2a/{assistant_id}` and speak A2A 1.0 JSON-RPC. Point `remoteAgent` at that URL. The card is `GET /.well-known/agent-card.json?assistant_id=...` on the server, or `GET {endpoint}/.well-known/agent-card.json` when the endpoint already includes the assistant id.

TypeScript `langgraph dev` does not expose A2A locally. Use this example, the Python server, or LangSmith Agent Server. This repository does not claim a LangGraph partnership.
