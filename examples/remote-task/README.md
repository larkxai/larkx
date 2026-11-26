# Reference remote task fixture

A small HTTP service for the current task transport. It is the test foundation for delegation, not a product protocol and not a LarkX hosting service. A2A is the planned standard. The fixture stores tasks in a JSON file. It does not run a model. Every supplier recommendation is simulated.

```bash
pnpm install
pnpm --filter @larkxai/example-remote-task build
node examples/remote-task/dist/main.js --port 8787 --data /tmp/larkx-tasks.json --delay-ms 2000
```

The process listens on all interfaces so a phone on the same network can reach it. From the phone, use this computer's LAN address, for example `http://192.168.1.20:8787`. `localhost` on the phone is the phone itself.

`POST /_control` accepts `{ "dropNextAck": true }`, `{ "failNext": true }`, and `{ "delayMs": 2000 }`. `GET /_tasks` lists stored tasks for tests. Those two routes are fixture controls, not the client protocol.

The client protocol is `POST /tasks`, `GET /tasks/{taskId}`, `GET /operations/{operationId}`, and `POST /tasks/{taskId}/cancel`.

This fixture supports dedupe, operation lookup, durable task ids, polling, cancel, and persistence. A client must declare that set. Leaving `dedupe` or `lookup` unset does not make a lost acknowledgement safe to submit again.
