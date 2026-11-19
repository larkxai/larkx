import { createAgent, createScriptedModel, defineTool, type ModelResponse } from "@larkx/agent";
import { createEngine, defineWorkflow, type JournalDocument } from "@larkx/core";
import { createNodeSqliteDriver } from "@larkx/node";
import { createMemoryStorage } from "@larkx/storage-memory";
import {
  allowEventPayload,
  createCloudTelemetry,
  createMemoryTelemetryStore,
  createSqliteTelemetryStore,
  journalFromEngine,
  type TelemetryFetch,
} from "@larkx/telemetry";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ENDPOINT = "https://cloud.larkx.test";
const API_KEY = "lkx_ing_test_secret";
const SECRET = "secret-prompt-do-not-upload";

describe("cloud telemetry export", () => {
  it("creates a destination without Web Crypto", async () => {
    const host = globalThis as { crypto?: Crypto };
    const previous = host.crypto;
    const saved: Array<{ installationId: string; destinations: Record<string, unknown> }> = [];
    Reflect.deleteProperty(host, "crypto");
    try {
      const telemetry = createCloudTelemetry({
        endpoint: ENDPOINT,
        apiKey: API_KEY,
        journal: {
          async listRuns() {
            return [];
          },
          async readJournal() {
            return null;
          },
        },
        state: {
          async load() {
            return null;
          },
          async save(document) {
            saved.push({
              installationId: document.installationId,
              destinations: document.destinations,
            });
          },
        },
        appId: "example-app",
        runtime: "react-native",
        intervalMs: 0,
        createId: () => "device-installation-1",
        sha256: async (data) => `expo:${data.byteLength}`,
        fetch: async () => {
          throw new Error("fetch should not run");
        },
      });
      const flushed = await telemetry.flush();
      expect(flushed.phase).toBe("idle");
      expect(flushed.delivered).toBe(false);
      const stored = saved.at(-1);
      expect(stored?.installationId).toBe("device-installation-1");
      const expected = new TextEncoder().encode(`${ENDPOINT}\n${API_KEY}`).byteLength;
      expect(stored?.destinations).toHaveProperty(`expo:${String(expected)}`);
      await telemetry.stop();
    } finally {
      host.crypto = previous;
    }
  });

  it("matches Web Crypto SHA-256 when subtle is missing", async () => {
    const expected = await sha256(`${ENDPOINT}\n${API_KEY}`);
    const host = globalThis as {
      crypto?: { getRandomValues?: Crypto["getRandomValues"] };
    };
    const previous = host.crypto;
    if (!previous?.getRandomValues) {
      throw new Error("test runtime has no crypto");
    }
    const saved: Array<{ destinations: Record<string, unknown> }> = [];
    host.crypto = { getRandomValues: previous.getRandomValues.bind(previous) };
    try {
      const telemetry = createCloudTelemetry({
        endpoint: ENDPOINT,
        apiKey: API_KEY,
        journal: {
          async listRuns() {
            return [];
          },
          async readJournal() {
            return null;
          },
        },
        state: {
          async load() {
            return null;
          },
          async save(document) {
            saved.push({ destinations: document.destinations });
          },
        },
        appId: "example-app",
        runtime: "react-native",
        intervalMs: 0,
        fetch: async () => {
          throw new Error("fetch should not run");
        },
      });
      expect((await telemetry.flush()).phase).toBe("idle");
      expect(Object.keys(saved.at(-1)?.destinations ?? {})).toEqual([expected]);
      await telemetry.stop();
    } finally {
      host.crypto = previous;
    }
  });

  it("exports a completed workflow and then stops", async () => {
    const seen: Recorded[] = [];
    const { engine, telemetry, defined } = await harness(async (_url, init) => {
      seen.push(record(init));
      return accept(init.body);
    });
    const handle = await engine.start(defined, { id: "letters-1", input: { text: SECRET } });
    expect(await handle.result()).toEqual({ total: SECRET.length });
    const flushed = await telemetry.flush();
    expect(flushed.phase).toBe("idle");
    expect(flushed.error).toBeNull();
    expect(seen).toHaveLength(1);
    expect(seen[0]?.headers["Idempotency-Key"]).toBe(seen[0]?.body.batchId);
    expect(seen[0]?.headers.Authorization).toBe(`Bearer ${API_KEY}`);
    expect(seen[0]?.body.mode).toBe("metadata-only");
    expect(seen[0]?.body.telemetryVersion).toBe(1);
    expect(seen[0]?.body.runs[0]?.workflowName).toBe("count-letters");
    expect(seen[0]?.body.runs[0]?.fromSequence).toBe(1);
    expect(seen[0]?.body.runs[0]?.events.map((event) => event.type)).toEqual([
      "WORKFLOW_CREATED",
      "WORKFLOW_STARTED",
      "STEP_STARTED",
      "STEP_COMPLETED",
      "WORKFLOW_COMPLETED",
    ]);
    expect(JSON.stringify(seen[0]?.body)).not.toContain(SECRET);
    const again = await telemetry.flush({ manual: false });
    expect(again.delivered).toBe(false);
    expect(seen).toHaveLength(1);
    await telemetry.stop();
    await engine.close();
  });

  it("keeps the same batch id when the network fails and when the server times out", async () => {
    let calls = 0;
    const bodies: string[] = [];
    const { engine, telemetry, defined } = await harness(
      async (_url, init) => {
        calls += 1;
        bodies.push(init.body);
        if (calls === 1) {
          throw new Error("offline");
        }
        if (calls === 2) {
          return new Promise((_resolve, reject) => {
            init.signal.addEventListener("abort", () => {
              reject(new Error("timeout"));
            });
          });
        }
        return accept(init.body, { duplicateSequences: [1] });
      },
      { requestTimeoutMs: 20 },
    );
    await engine
      .start(defined, { id: "letters-2", input: { text: "hi" } })
      .then((run) => run.result());
    expect((await telemetry.flush()).error).toBe("offline");
    expect((await telemetry.flush()).error).toBe("offline");
    const delivered = await telemetry.flush();
    expect(delivered.delivered).toBe(true);
    expect(calls).toBe(3);
    const ids = bodies.map((body) => (JSON.parse(body) as { batchId: string }).batchId);
    expect(new Set(ids).size).toBe(1);
    expect(bodies[0]).toBe(bodies[1]);
    expect(bodies[1]).toBe(bodies[2]);
    expect((await telemetry.flush()).delivered).toBe(false);
    expect(calls).toBe(3);
    await telemetry.stop();
    await engine.close();
  });

  it("does not advance on a malformed acknowledgement and retries that batch", async () => {
    let now = 5_000;
    let calls = 0;
    const ids: string[] = [];
    const { engine, telemetry, defined } = await harness(
      async (_url, init) => {
        calls += 1;
        ids.push(init.headers["Idempotency-Key"] ?? "");
        if (calls === 1) {
          return { status: 200, text: async () => "ok" };
        }
        return accept(init.body);
      },
      { clock: { now: () => now } },
    );
    await engine
      .start(defined, { id: "letters-3", input: { text: "hi" } })
      .then((run) => run.result());
    expect((await telemetry.flush()).error).toBe("malformed_ack");
    now = 5_000;
    expect((await telemetry.flush({ manual: false })).error).toBe("malformed_ack");
    expect(calls).toBe(1);
    now = 20_000;
    expect((await telemetry.flush({ manual: false })).delivered).toBe(true);
    expect(ids[0]).toBe(ids[1]);
    await telemetry.stop();
    await engine.close();
  });

  it("applies a partial acknowledgement and sends the remainder", async () => {
    const ranges: Array<[number, number]> = [];
    const { engine, telemetry, defined } = await harness(async (_url, init) => {
      const body = JSON.parse(init.body) as BatchBody;
      const run = body.runs[0];
      if (!run) {
        throw new Error("missing run");
      }
      ranges.push([run.fromSequence, run.throughSequence]);
      const through = run.fromSequence === 1 ? 2 : run.throughSequence;
      return accept(init.body, { through });
    });
    await engine
      .start(defined, { id: "letters-4", input: { text: "hi" } })
      .then((run) => run.result());
    expect((await telemetry.flush()).phase).toBe("idle");
    expect(ranges[0]).toEqual([1, 5]);
    expect(ranges[1]).toEqual([3, 5]);
    await telemetry.stop();
    await engine.close();
  });

  it("stops retrying an unauthorized key until a manual flush", async () => {
    let calls = 0;
    const { engine, telemetry, defined } = await harness(async () => {
      calls += 1;
      return { status: 401, text: async () => JSON.stringify({ error: "unauthorized" }) };
    });
    await engine
      .start(defined, { id: "letters-5", input: { text: "hi" } })
      .then((run) => run.result());
    expect((await telemetry.flush()).phase).toBe("unauthorized");
    expect((await telemetry.flush({ manual: false })).phase).toBe("unauthorized");
    expect(calls).toBe(1);
    expect((await telemetry.flush()).phase).toBe("unauthorized");
    expect(calls).toBe(2);
    expect(telemetry.current().phase).toBe("unauthorized");
    await telemetry.stop();
    await engine.close();
  });

  it("does not send a credential that is not an ingestion key", async () => {
    let calls = 0;
    const defined = workflow();
    const engine = createEngine({
      storage: createMemoryStorage(),
      workflows: [defined],
      heartbeat: false,
    });
    const telemetry = createCloudTelemetry({
      endpoint: ENDPOINT,
      apiKey: "revoked-looking-token",
      journal: journalFromEngine(engine),
      state: createMemoryTelemetryStore(),
      appId: "example-app",
      runtime: "node",
      intervalMs: 0,
      fetch: async () => {
        calls += 1;
        return { status: 200, text: async () => "{}" };
      },
    });
    await engine
      .start(defined, { id: "letters-bad-key", input: { text: "hi" } })
      .then((run) => run.result());
    expect((await telemetry.flush()).error).toBe("unauthorized");
    expect((await telemetry.flush({ manual: false })).error).toBe("unauthorized");
    expect(calls).toBe(0);
    await telemetry.stop();
    await engine.close();
  });

  it("holds a history conflict instead of looping", async () => {
    let calls = 0;
    const { engine, telemetry, defined } = await harness(async () => {
      calls += 1;
      return {
        status: 409,
        text: async () =>
          JSON.stringify({ error: "history_conflict", runId: "letters-6", sequence: 1 }),
      };
    });
    await engine
      .start(defined, { id: "letters-6", input: { text: "hi" } })
      .then((run) => run.result());
    expect((await telemetry.flush()).error).toBe("history_conflict");
    expect((await telemetry.flush({ manual: false })).error).toBe("history_conflict");
    expect(calls).toBe(1);
    await telemetry.stop();
    await engine.close();
  });

  it("rewinds to the cloud prefix after a sequence gap", async () => {
    const starts: number[] = [];
    const state = createMemoryTelemetryStore();
    const installationId = "11111111-1111-4111-8111-111111111111";
    const destination = await sha256(`${ENDPOINT}\n${API_KEY}`);
    await state.save({
      version: 1,
      installationId,
      destinations: {
        [destination]: {
          cursors: { "letters-7": 4 },
          snapshots: {},
          pending: null,
          backoffAttempt: 0,
          nextAttemptAt: 0,
          authBlocked: false,
          hold: null,
          lastSyncedAt: null,
          lastError: null,
        },
      },
    });
    const defined = workflow();
    const engine = createEngine({
      storage: createMemoryStorage(),
      workflows: [defined],
      heartbeat: false,
    });
    const telemetry = createCloudTelemetry({
      endpoint: ENDPOINT,
      apiKey: API_KEY,
      journal: journalFromEngine(engine),
      state,
      appId: "example-app",
      runtime: "node",
      installationId,
      intervalMs: 0,
      fetch: async (_url, init) => {
        const body = JSON.parse(init.body) as BatchBody;
        const run = body.runs[0];
        if (!run) {
          throw new Error("missing run");
        }
        starts.push(run.fromSequence);
        if (starts.length === 1) {
          return {
            status: 409,
            text: async () =>
              JSON.stringify({
                error: "sequence_gap",
                runId: run.runId,
                haveThroughSequence: 0,
                expectedSequence: 1,
              }),
          };
        }
        return accept(init.body);
      },
    });
    await engine
      .start(defined, { id: "letters-7", input: { text: "hi" } })
      .then((run) => run.result());
    expect((await telemetry.flush()).delivered).toBe(true);
    expect(starts[0]).toBe(5);
    expect(starts[1]).toBe(1);
    await telemetry.stop();
    await engine.close();
  });

  it("runs one flush at a time", async () => {
    let calls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { engine, telemetry, defined } = await harness(async (_url, init) => {
      calls += 1;
      await gate;
      return accept(init.body);
    });
    await engine
      .start(defined, { id: "letters-8", input: { text: "hi" } })
      .then((run) => run.result());
    const first = telemetry.flush();
    const second = telemetry.flush();
    await new Promise((resolve) => setTimeout(resolve, 10));
    release();
    await Promise.all([first, second]);
    expect(calls).toBe(1);
    await telemetry.stop();
    await engine.close();
  });

  it("keeps cursors separate for each ingestion key", async () => {
    const headers: string[] = [];
    const fetchImpl: TelemetryFetch = async (_url, init) => {
      headers.push(init.headers.Authorization ?? "");
      return accept(init.body);
    };
    const state = createMemoryTelemetryStore();
    const defined = workflow();
    const engine = createEngine({
      storage: createMemoryStorage(),
      workflows: [defined],
      heartbeat: false,
    });
    const first = createCloudTelemetry({
      endpoint: ENDPOINT,
      apiKey: API_KEY,
      journal: journalFromEngine(engine),
      state,
      appId: "example-app",
      runtime: "node",
      intervalMs: 0,
      fetch: fetchImpl,
    });
    const second = createCloudTelemetry({
      endpoint: ENDPOINT,
      apiKey: "lkx_ing_other_secret",
      journal: journalFromEngine(engine),
      state,
      appId: "example-app",
      runtime: "node",
      intervalMs: 0,
      fetch: fetchImpl,
    });
    await engine
      .start(defined, { id: "letters-9", input: { text: SECRET } })
      .then((run) => run.result());
    await first.flush();
    await second.flush();
    expect(headers).toEqual([`Bearer ${API_KEY}`, "Bearer lkx_ing_other_secret"]);
    expect(first.current().installationId).toBe(second.current().installationId);
    await first.flush({ manual: false });
    await second.flush({ manual: false });
    expect(headers).toHaveLength(2);
    await first.stop();
    await second.stop();
    await engine.close();
  });

  it("persists the cursor in sqlite and does not upload step output", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-telemetry-"));
    try {
      const driver = createNodeSqliteDriver(join(directory, "telemetry.sqlite"));
      const state = createSqliteTelemetryStore(driver);
      let calls = 0;
      const defined = workflow();
      const engine = createEngine({
        storage: createMemoryStorage(),
        workflows: [defined],
        heartbeat: false,
      });
      const telemetry = createCloudTelemetry({
        endpoint: ENDPOINT,
        apiKey: API_KEY,
        journal: journalFromEngine(engine),
        state,
        appId: "example-app",
        runtime: "node",
        intervalMs: 0,
        fetch: async (_url, init) => {
          calls += 1;
          expect(init.body).not.toContain(SECRET);
          expect(init.body).not.toContain("tool-output");
          return accept(init.body);
        },
      });
      const marked = defineWorkflow({
        name: "marked",
        version: 1,
        async run(ctx, input: { text: string }) {
          return ctx.step("save", {
            execution: "local",
            effects: "idempotent",
            run: () => ({ text: input.text, output: "tool-output" }),
          });
        },
      });
      engine.register(marked);
      await engine
        .start(marked, { id: "marked-1", input: { text: SECRET } })
        .then((run) => run.result());
      const journal = await engine.readJournal("marked-1");
      expect(JSON.stringify(journal)).not.toContain(SECRET);
      expect(JSON.stringify(journal)).not.toContain("tool-output");
      expect((await telemetry.flush()).delivered).toBe(true);
      await telemetry.stop();
      driver.close();

      const reopened = createSqliteTelemetryStore(
        createNodeSqliteDriver(join(directory, "telemetry.sqlite")),
      );
      const resumed = createCloudTelemetry({
        endpoint: ENDPOINT,
        apiKey: API_KEY,
        journal: journalFromEngine(engine),
        state: reopened,
        appId: "example-app",
        runtime: "node",
        intervalMs: 0,
        fetch: async () => {
          calls += 1;
          throw new Error("should not send");
        },
      });
      expect((await resumed.flush({ manual: false })).delivered).toBe(false);
      expect(calls).toBe(1);
      await resumed.stop();
      await engine.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("completes an agent when cloud is absent and omits model text when it is present", async () => {
    const engine = engineWith();
    const agent = createAgent({
      engine,
      name: "renovation-agent",
      version: 1,
      model: createScriptedModel({
        respond(): ModelResponse {
          return { message: SECRET, finish: "stop", calls: [] };
        },
      }),
      instructions: SECRET,
      tools: [
        defineTool({
          name: "save_plan",
          description: "Save",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
          effects: "idempotent",
          run: () => ({ note: SECRET }),
        }),
      ],
    });
    const offline = await agent.start({ id: "agent-offline", input: { message: SECRET } });
    expect((await offline.result()).message).toBe(SECRET);
    await engine.close();

    const connected = engineWith();
    let body = "";
    const telemetry = createCloudTelemetry({
      endpoint: ENDPOINT,
      apiKey: API_KEY,
      journal: journalFromEngine(connected),
      state: createMemoryTelemetryStore(),
      appId: "example-app",
      runtime: "node",
      intervalMs: 0,
      fetch: async (_url, init) => {
        body = init.body;
        return accept(init.body);
      },
    });
    const synced = createAgent({
      engine: connected,
      name: "renovation-agent",
      version: 1,
      model: createScriptedModel({
        respond(request): ModelResponse {
          if (request.messages.some((message) => message.role === "tool")) {
            return { message: SECRET, finish: "stop", calls: [] };
          }
          return {
            message: null,
            finish: "tool_calls",
            calls: [{ id: "call-1", name: "save_plan", arguments: {} }],
          };
        },
      }),
      instructions: SECRET,
      tools: [
        defineTool({
          name: "save_plan",
          description: "Save",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
          effects: "idempotent",
          run: () => ({ note: SECRET }),
        }),
      ],
    });
    await synced
      .start({ id: "agent-sync", input: { message: SECRET } })
      .then((run) => run.result());
    expect((await telemetry.flush()).delivered).toBe(true);
    expect(body).not.toContain(SECRET);
    expect(body).toContain("model-0");
    expect(body).toContain("tool-0-0");
    expect(body).not.toContain("save_plan");
    await telemetry.stop();
    await connected.close();
  });

  it("drops sensitive and unknown payload keys", () => {
    const payload = allowEventPayload("STEP_STARTED", {
      stepKey: "save",
      effects: "idempotent",
      execution: "local",
      operationId: "op-1",
      prompt: SECRET,
      input: "nope",
      output: { text: SECRET },
      messages: [],
      toolResult: "nope",
      content: SECRET,
      note: "not on the allowlist",
    });
    expect(payload).toEqual({
      effects: "idempotent",
      execution: "local",
      operationId: "op-1",
      stepKey: "save",
    });
  });

  it("rejects a poisoned journal event before it can leave the device", async () => {
    const poisoned: JournalDocument = {
      run: {
        runId: "poison-1",
        workflowName: "count-letters",
        workflowVersion: 1,
        status: "COMPLETED",
        dataPolicy: "device-only",
        protocolVersion: 1,
        createdAt: 1,
        updatedAt: 1,
        cancelRequested: false,
        ownershipEpoch: 1,
        ownerPresent: false,
        errorCode: null,
        errorRetryable: null,
        blockedReasonCode: null,
      },
      steps: [],
      attempts: [],
      events: [
        {
          eventId: "22222222-2222-4222-8222-222222222222",
          runId: "poison-1",
          sequence: 1,
          type: "WORKFLOW_COMPLETED",
          createdAt: 1,
          payload: { prompt: SECRET, content: SECRET, input: SECRET },
        },
      ],
    };
    let body = "";
    const telemetry = createCloudTelemetry({
      endpoint: ENDPOINT,
      apiKey: API_KEY,
      journal: {
        async listRuns() {
          return [{ runId: poisoned.run.runId, updatedAt: 1 }];
        },
        async readJournal() {
          return poisoned;
        },
      },
      state: createMemoryTelemetryStore(),
      appId: "example-app",
      runtime: "node",
      intervalMs: 0,
      fetch: async (_url, init) => {
        body = init.body;
        return accept(init.body);
      },
    });
    expect((await telemetry.flush()).delivered).toBe(true);
    expect(body).not.toContain(SECRET);
    expect(body).not.toContain("prompt");
    await telemetry.stop();
  });
});

function engineWith() {
  return createEngine({
    storage: createMemoryStorage(),
    workflows: [],
    heartbeat: false,
  });
}

function workflow() {
  return defineWorkflow({
    name: "count-letters",
    version: 1,
    async run(ctx, input: { text: string }) {
      return ctx.step("count", {
        execution: "local",
        effects: "pure",
        run: () => ({ total: input.text.length }),
      });
    },
  });
}

async function harness(
  fetchImpl: TelemetryFetch,
  options?: { readonly requestTimeoutMs?: number; readonly clock?: { now(): number } },
) {
  const defined = workflow();
  const engine = createEngine({
    storage: createMemoryStorage(),
    workflows: [defined],
    heartbeat: false,
  });
  const telemetry = createCloudTelemetry({
    endpoint: ENDPOINT,
    apiKey: API_KEY,
    journal: journalFromEngine(engine),
    state: createMemoryTelemetryStore(),
    appId: "example-app",
    runtime: "node",
    intervalMs: 0,
    fetch: fetchImpl,
    ...(options?.requestTimeoutMs ? { requestTimeoutMs: options.requestTimeoutMs } : {}),
    ...(options?.clock ? { clock: options.clock } : {}),
  });
  return { engine, telemetry, defined };
}

interface Recorded {
  headers: Record<string, string>;
  body: BatchBody;
}

interface BatchBody {
  telemetryVersion: number;
  batchId: string;
  mode: string;
  runs: Array<{
    runId: string;
    workflowName: string;
    fromSequence: number;
    throughSequence: number;
    events: Array<{ type: string }>;
  }>;
}

function record(init: { headers: Readonly<Record<string, string>>; body: string }): Recorded {
  return {
    headers: { ...init.headers },
    body: JSON.parse(init.body) as BatchBody,
  };
}

function accept(
  body: string,
  options?: { readonly through?: number; readonly duplicateSequences?: number[] },
) {
  const parsed = JSON.parse(body) as BatchBody;
  const run = parsed.runs[0];
  if (!run) {
    throw new Error("missing run");
  }
  return {
    status: 200,
    async text() {
      return JSON.stringify({
        telemetryVersion: 1,
        batchId: parsed.batchId,
        results: [
          {
            runId: run.runId,
            status: "accepted",
            acceptedThroughSequence: options?.through ?? run.throughSequence,
            duplicateSequences: options?.duplicateSequences ?? [],
          },
        ],
      });
    },
  };
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
