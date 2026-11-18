import { createNodeEngine, createNodeSqliteDriver } from "@larkx/node";
import { defineWorkflow } from "@larkx/core";
import {
  createCloudTelemetry,
  createSqliteTelemetryStore,
  journalFromEngine,
} from "@larkx/telemetry";
import { appendFileSync } from "node:fs";

const database = argument("--database");
const statePath = argument("--state");
const endpoint = argument("--endpoint");
const apiKey = argument("--api-key");
const log = argument("--log");
const phase = argument("--phase");
const secret = "secret-prompt-do-not-upload";

const workflow = defineWorkflow({
  name: "export-restart",
  version: 1,
  async run(ctx, input: { text: string }) {
    return ctx.step("save", {
      execution: "local",
      effects: "idempotent",
      run: ({ operationId }) => {
        appendFileSync(log, `${operationId}\n`);
        return { operationId, text: input.text };
      },
    });
  },
});

const engine = createNodeEngine({
  database,
  workflows: [workflow],
  heartbeat: false,
});
const telemetry = createCloudTelemetry({
  endpoint,
  apiKey,
  journal: journalFromEngine(engine),
  state: createSqliteTelemetryStore(createNodeSqliteDriver(statePath)),
  appId: "example-app",
  runtime: "node",
  intervalMs: 0,
  requestTimeoutMs: 30_000,
});

if (phase === "first") {
  const handle = await engine.start(workflow, { id: "export-restart", input: { text: secret } });
  await handle.result();
  await telemetry.flush();
} else {
  const flushed = await telemetry.flush();
  process.stdout.write(
    `${JSON.stringify({ delivered: flushed.delivered, error: flushed.error })}\n`,
  );
}

await telemetry.stop();
await engine.close();

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}
