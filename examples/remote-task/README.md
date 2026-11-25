# Reference remote task fixture

A small HTTP service for the delegation protocol. It stores tasks in a JSON file. It does not run a model, and it is not a LarkX hosting product. Every supplier recommendation is simulated.

```bash
pnpm install
pnpm --filter @larkxai/example-remote-task build
node examples/remote-task/dist/main.js --port 8787 --data /tmp/larkx-tasks.json --delay-ms 2000
```

The process listens on all interfaces so a phone on the same network can reach it. From the phone, use this computer's LAN address, for example `http://192.168.1.20:8787`. `localhost` on the phone is the phone itself.

`POST /_control` accepts `{ "dropNextAck": true }`, `{ "failNext": true }`, and `{ "delayMs": 2000 }`. `GET /_tasks` lists stored tasks for tests. Those two routes are fixture controls, not the client protocol.

The client protocol is `POST /tasks`, `GET /tasks/{taskId}`, `GET /operations/{operationId}`, and `POST /tasks/{taskId}/cancel`.
