# A2A fixture

This process is a deterministic A2A 1.0 JSON-RPC peer for tests. It is not a LangGraph agent, and it does not deduplicate message ids. A lost acknowledgement cannot be looked up. Supplier text is simulated.

`GET /.well-known/agent-card.json` returns a card whose JSON-RPC interface is `http://127.0.0.1:<port>`. Discovery from a phone fails that check unless the card URL is the address the phone is allowed to call. Leave discovery off and pass the computer's LAN address explicitly.

`POST /` accepts `SendMessage`, `GetTask`, and `CancelTask`. `GET /_tasks` and `POST /_control` are test controls, not A2A methods.

```bash
pnpm --filter @larkxai/example-a2a-fixture build
node dist/main.js --port 8788 --data /tmp/a2a-tasks.json
```
