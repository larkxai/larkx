import { createEngine, defineWorkflow } from "@larkxai/core";
import { createMemoryStorage } from "@larkxai/storage-memory";
import {
  createCloudTelemetry,
  createMemoryTelemetryStore,
  journalFromEngine,
} from "@larkxai/telemetry";

import { describe, expect, it } from "vitest";

const endpoint = process.env.LARKX_CLOUD_ENDPOINT?.trim() ?? "";
const apiKey = process.env.LARKX_INGESTION_KEY?.trim() ?? "";
const live = endpoint.length > 0 && apiKey.length > 0;

describe.skipIf(!live)("LarkX Cloud ingestion", () => {
  it("delivers a real workflow journal and retries the same batch id", async () => {
    const defined = defineWorkflow({
      name: "telemetry-live",
      version: 1,
      async run(ctx, input: { label: string }) {
        return ctx.step("mark", {
          execution: "local",
          effects: "pure",
          run: () => ({ label: input.label }),
        });
      },
    });
    const engine = createEngine({
      storage: createMemoryStorage(),
      workflows: [defined],
      heartbeat: false,
    });
    const runId = `telemetry-live-${String(Date.now())}`;
    const secret = `live-secret-${runId}`;
    await engine
      .start(defined, { id: runId, input: { label: secret } })
      .then((handle) => handle.result());

    const seen: Array<{
      url: string;
      body: string;
      key: string;
      status: number;
      text: string;
    }> = [];
    const telemetry = createCloudTelemetry({
      endpoint,
      apiKey,
      journal: journalFromEngine(engine),
      state: createMemoryTelemetryStore(),
      appId: "larkx-live-test",
      runtime: "node",
      intervalMs: 0,
      requestTimeoutMs: 20_000,
      fetch: async (url, init) => {
        const key = init.headers["Idempotency-Key"] ?? "";
        if (seen.length === 0) {
          const response = await fetch(url, init);
          const text = await response.text();
          seen.push({ url, body: init.body, key, status: response.status, text });
          throw new Error("drop the acknowledgement");
        }
        const response = await fetch(url, init);
        const text = await response.text();
        seen.push({ url, body: init.body, key, status: response.status, text });
        return { status: response.status, text: async () => text };
      },
    });

    expect((await telemetry.flush()).error).toBe("offline");
    const second = await telemetry.flush();
    expect(seen).toHaveLength(2);
    const first = seen[0];
    const duplicate = seen[1];
    expect(first).toBeDefined();
    expect(duplicate).toBeDefined();
    if (!first || !duplicate) {
      return;
    }
    expect(first.url).toBe(`${endpoint.replace(/\/+$/, "")}/v1/telemetry/batches`);
    expect(first.body).not.toContain(secret);
    expect(first.status).toBe(200);
    const acknowledged = JSON.parse(first.text) as {
      batchId: string;
      results: Array<{ acceptedThroughSequence: number }>;
    };
    expect(acknowledged.batchId).toBe(first.key);
    expect(acknowledged.results[0]?.acceptedThroughSequence).toBeGreaterThan(0);
    expect(duplicate.key).toBe(first.key);
    expect(duplicate.body).toBe(first.body);
    expect(duplicate.status).toBe(200);
    expect(duplicate.text).not.toContain(secret);
    expect(second.delivered).toBe(true);
    expect(second.phase).toBe("idle");
    await telemetry.stop();
    await engine.close();
  });
});
