import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  allowEventPayload,
  createCloudTelemetry,
  createMemoryTelemetryStore,
  createSqliteTelemetryStore,
  createTelemetryId,
  nodeInstallationMetadata,
  normalizeTelemetryEndpoint,
  sanitizeInstallationMetadata,
  type JournalDocument,
  type JournalSource,
  type TelemetryFetch,
  type TelemetrySql,
} from "@larkxai/telemetry";
import { describe, expect, it } from "vitest";

const ENDPOINT = "https://cloud.larkx.test";
const API_KEY = "lkx_ing_test_secret";
const SECRET = "secret-prompt-do-not-upload";

describe("cloud telemetry export", () => {
  it("sends one metadata batch and does not repeat it", async () => {
    const seen: string[] = [];
    const journal = mutableJournal();
    const telemetry = createCloudTelemetry({
      endpoint: ENDPOINT,
      apiKey: API_KEY,
      journal: journal.source,
      state: createMemoryTelemetryStore(),
      appId: "example-app",
      runtime: "node",
      intervalMs: 0,
      fetch: async (_url, init) => {
        seen.push(init.body);
        expect(init.headers.Authorization).toBe(`Bearer ${API_KEY}`);
        expect(init.body).not.toContain(SECRET);
        return accept(init.body);
      },
    });
    await telemetry.prepare();
    journal.documents.push(sampleJournal());
    expect((await telemetry.flush()).delivered).toBe(true);
    expect((await telemetry.flush({ manual: false })).delivered).toBe(false);
    expect(seen).toHaveLength(1);
    const body = JSON.parse(seen[0] ?? "{}") as { runs: Array<{ workflowName: string }> };
    expect(body.runs[0]?.workflowName).toBe("count-letters");
    await telemetry.stop();
  });

  it("keeps the batch id when the first send fails", async () => {
    const bodies: string[] = [];
    let calls = 0;
    const journal = mutableJournal();
    const telemetry = createCloudTelemetry({
      endpoint: ENDPOINT,
      apiKey: API_KEY,
      journal: journal.source,
      state: createMemoryTelemetryStore(),
      appId: "example-app",
      runtime: "node",
      intervalMs: 0,
      fetch: async (_url, init) => {
        calls += 1;
        bodies.push(init.body);
        if (calls === 1) {
          throw new Error("offline");
        }
        return accept(init.body);
      },
    });
    await telemetry.prepare();
    journal.documents.push(sampleJournal());
    expect((await telemetry.flush()).delivered).toBe(false);
    expect((await telemetry.flush({ manual: true })).delivered).toBe(true);
    expect(JSON.parse(bodies[0] ?? "{}").batchId).toBe(JSON.parse(bodies[1] ?? "{}").batchId);
    await telemetry.stop();
  });

  it("drops sensitive payload keys and remembers a sqlite cursor", async () => {
    expect(
      allowEventPayload("STEP_STARTED", {
        stepKey: "save",
        effects: "idempotent",
        execution: "local",
        operationId: "op-1",
        prompt: SECRET,
        input: "nope",
      }),
    ).toEqual({
      effects: "idempotent",
      execution: "local",
      operationId: "op-1",
      stepKey: "save",
    });
    const directory = mkdtempSync(join(tmpdir(), "larkx-telemetry-"));
    try {
      const database = new DatabaseSync(join(directory, "telemetry.sqlite"));
      const journal = mutableJournal();
      const telemetry = createCloudTelemetry({
        endpoint: ENDPOINT,
        apiKey: API_KEY,
        journal: journal.source,
        state: createSqliteTelemetryStore(sqlStore(database)),
        appId: "example-app",
        runtime: "node",
        intervalMs: 0,
        fetch: async (_url, init) => accept(init.body),
      });
      await telemetry.prepare();
      journal.documents.push(sampleJournal());
      expect((await telemetry.flush()).delivered).toBe(true);
      await telemetry.stop();
      const stored = database.prepare("SELECT document_json FROM larkx_telemetry_state").get() as {
        document_json: string;
      };
      expect(stored.document_json).not.toContain(API_KEY);
      expect(stored.document_json).not.toContain(ENDPOINT);
      database.close();
      const reopened = new DatabaseSync(join(directory, "telemetry.sqlite"));
      let calls = 0;
      const resumed = createCloudTelemetry({
        endpoint: ENDPOINT,
        apiKey: API_KEY,
        journal: journal.source,
        state: createSqliteTelemetryStore(sqlStore(reopened)),
        appId: "example-app",
        runtime: "node",
        intervalMs: 0,
        fetch: async () => {
          calls += 1;
          throw new Error("should not send");
        },
      });
      expect((await resumed.flush({ manual: false })).delivered).toBe(false);
      expect(calls).toBe(0);
      await resumed.stop();
      reopened.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("omits a UUID device model and does not invent one for Node", () => {
    expect(
      sanitizeInstallationMetadata({
        appName: "Notes",
        deviceModel: "11111111-1111-4111-8111-111111111111",
      }).deviceModel,
    ).toBeUndefined();
    expect(nodeInstallationMetadata({ appName: "Notes" }).deviceModel).toBeUndefined();
    expect(nodeInstallationMetadata({ appName: "Notes" }).platform).toBe("node");
  });

  it("rejects malformed endpoints and does not follow redirects", async () => {
    expect(normalizeTelemetryEndpoint(" https://cloud.larkx.ai/ ")).toBe("https://cloud.larkx.ai");
    expect(() => normalizeTelemetryEndpoint("http://user:secret@collector.example")).toThrow(
      /credentials/,
    );
    expect(() => normalizeTelemetryEndpoint("https://collector.example/path?token=secret")).toThrow(
      /query/,
    );
    expect(() => normalizeTelemetryEndpoint("ftp://collector.example")).toThrow(/http or https/);
    const calls: string[] = [];
    const journal = mutableJournal();
    const telemetry = createCloudTelemetry({
      endpoint: "http://127.0.0.1:9",
      apiKey: API_KEY,
      journal: journal.source,
      state: createMemoryTelemetryStore(),
      appId: "example-app",
      runtime: "node",
      intervalMs: 0,
      fetch: async (url, init) => {
        calls.push(url);
        expect(init.headers.Authorization).toBe(`Bearer ${API_KEY}`);
        expect(url).toBe("http://127.0.0.1:9/v1/telemetry/batches");
        return {
          status: 302,
          async text() {
            return "";
          },
        };
      },
    });
    await telemetry.prepare();
    journal.documents.push(sampleJournal());
    const flushed = await telemetry.flush();
    expect(flushed.delivered).toBe(false);
    expect(flushed.error).toBe("redirected");
    expect(calls).toEqual(["http://127.0.0.1:9/v1/telemetry/batches"]);
    calls.length = 0;
    expect((await telemetry.flush({ manual: false })).delivered).toBe(false);
    expect(calls).toEqual([]);
    await telemetry.stop();
  });

  it("does not acknowledge 302, 307, or 308, including a changed final URL", async () => {
    const cases = [
      { status: 302, url: "https://collector.example/v1/telemetry/batches" },
      { status: 307, url: "https://other.example/collect" },
      { status: 308, url: "http://collector.example/v1/telemetry/batches" },
    ];
    for (const item of cases) {
      const calls: string[] = [];
      const journal = mutableJournal();
      const telemetry = createCloudTelemetry({
        endpoint: ENDPOINT,
        apiKey: API_KEY,
        journal: journal.source,
        state: createMemoryTelemetryStore(),
        appId: "example-app",
        runtime: "node",
        intervalMs: 0,
        fetch: async (url, init) => {
          calls.push(url);
          expect(init.headers.Authorization).toBe(`Bearer ${API_KEY}`);
          expect(init.body?.length ?? 0).toBeGreaterThan(0);
          return {
            status: item.status,
            url: item.url,
            async text() {
              return "not-an-ack";
            },
          };
        },
      });
      await telemetry.prepare();
      journal.documents.push(sampleJournal());
      const flushed = await telemetry.flush();
      expect(flushed.delivered).toBe(false);
      expect(flushed.error).toBe("redirected");
      expect(calls).toEqual([`${ENDPOINT}/v1/telemetry/batches`]);
      await telemetry.stop();
    }
  });

  it("does not export runs that already existed when telemetry was enabled", async () => {
    const journal = mutableJournal([sampleJournal()]);
    const seen: string[] = [];
    const telemetry = createCloudTelemetry({
      endpoint: ENDPOINT,
      apiKey: API_KEY,
      journal: journal.source,
      state: createMemoryTelemetryStore(),
      appId: "example-app",
      runtime: "node",
      intervalMs: 0,
      fetch: async (_url, init) => {
        seen.push(init.body);
        return accept(init.body);
      },
    });
    await telemetry.prepare();
    expect((await telemetry.flush()).delivered).toBe(false);
    expect(seen).toEqual([]);
    journal.documents.push(sampleJournal("letters-2"));
    expect((await telemetry.flush()).delivered).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("letters-2");
    expect(seen[0]).not.toContain("letters-1");
    await telemetry.stop();

    const moved = createCloudTelemetry({
      endpoint: "https://other.larkx.test",
      apiKey: "lkx_ing_other",
      journal: journal.source,
      state: createMemoryTelemetryStore(),
      appId: "other-project",
      runtime: "node",
      intervalMs: 0,
      fetch: async (_url, init) => {
        seen.push(init.body);
        return accept(init.body);
      },
    });
    await moved.prepare();
    expect((await moved.flush()).delivered).toBe(false);
    expect(seen).toHaveLength(1);
    await moved.stop();
  });

  it("reads one bounded page from a large history", async () => {
    const pages: Array<{ runId: string; after: number; limit: number }> = [];
    const documents = [largeJournal("old-run", 1000), largeJournal("new-run", 800)];
    const source: JournalSource = {
      async listHeads() {
        return documents.map((document) => ({
          runId: document.run.runId,
          updatedAt: document.run.updatedAt,
          maxSequence: document.events.length,
        }));
      },
      async readSlice(runId, afterSequence, limit) {
        pages.push({ runId, after: afterSequence, limit });
        const document = documents.find((item) => item.run.runId === runId);
        if (!document) {
          return null;
        }
        return {
          run: document.run,
          steps: document.steps,
          attempts: document.attempts,
          events: document.events.filter((event) => event.sequence > afterSequence).slice(0, limit),
          maxSequence: document.events.length,
        };
      },
    };
    const telemetry = createCloudTelemetry({
      endpoint: ENDPOINT,
      apiKey: API_KEY,
      journal: source,
      state: createMemoryTelemetryStore(),
      appId: "example-app",
      runtime: "node",
      intervalMs: 0,
      maxEvents: 25,
      fetch: async (_url, init) => accept(init.body),
    });
    await telemetry.prepare();
    documents.push(largeJournal("live-run", 400));
    expect((await telemetry.flush()).delivered).toBe(true);
    expect(pages).toEqual(
      [0, 25, 50, 75, 100, 125, 150, 175].map((after) => ({
        runId: "live-run",
        after,
        limit: 25,
      })),
    );
    expect(telemetry.current().pendingEvents).toBe(200);
    expect((await telemetry.flush()).delivered).toBe(true);
    expect(pages[8]).toEqual({ runId: "live-run", after: 200, limit: 25 });
    await telemetry.stop();
  });

  it("does not move a cursor backward when two exporters share a store", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-telemetry-race-"));
    try {
      const database = new DatabaseSync(join(directory, "telemetry.sqlite"));
      const store = createSqliteTelemetryStore(sqlStore(database));
      const journal = mutableJournal();
      const seen: string[] = [];
      const options = {
        endpoint: ENDPOINT,
        apiKey: API_KEY,
        journal: journal.source,
        state: store,
        appId: "example-app" as const,
        runtime: "node" as const,
        intervalMs: 0,
        fetch: async (_url: string, init: { body: string }) => {
          seen.push(init.body);
          await new Promise((resolve) => setTimeout(resolve, 20));
          return accept(init.body);
        },
      };
      const first = createCloudTelemetry(options);
      const second = createCloudTelemetry(options);
      await Promise.all([first.prepare(), second.prepare()]);
      journal.documents.push(sampleJournal());
      await Promise.all([first.flush(), second.flush()]);
      const third = createCloudTelemetry({
        ...options,
        fetch: async () => {
          throw new Error("cursor should already cover the run");
        },
      });
      expect((await third.flush({ manual: false })).delivered).toBe(false);
      const stored = database.prepare("SELECT document_json FROM larkx_telemetry_state").get() as {
        document_json: string;
      };
      expect(stored.document_json).not.toContain(API_KEY);
      expect(stored.document_json).toContain("letters-1");
      await first.stop();
      await second.stop();
      await third.stop();
      database.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("requires an injected id when Web Crypto is missing", async () => {
    const cryptoApi = globalThis.crypto;
    const encoder = globalThis.TextEncoder;
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });
    Object.defineProperty(globalThis, "TextEncoder", { configurable: true, value: undefined });
    try {
      expect(() => createTelemetryId()).toThrow(/expo-crypto/);
      let sequence = 0;
      const journal = mutableJournal();
      const telemetry = createCloudTelemetry({
        endpoint: ENDPOINT,
        apiKey: API_KEY,
        journal: journal.source,
        state: createMemoryTelemetryStore(),
        appId: "example-app",
        runtime: "react-native",
        intervalMs: 0,
        createId: () => `00000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`,
        fetch: async (_url, init) => accept(init.body),
      });
      await telemetry.prepare();
      journal.documents.push(sampleJournal());
      expect((await telemetry.flush()).delivered).toBe(true);
      await telemetry.stop();
    } finally {
      Object.defineProperty(globalThis, "crypto", { configurable: true, value: cryptoApi });
      Object.defineProperty(globalThis, "TextEncoder", { configurable: true, value: encoder });
    }
  });

  it("stops without waiting for an unavailable collector", async () => {
    const journal = mutableJournal();
    const state = createMemoryTelemetryStore();
    let aborted = false;
    const telemetry = createCloudTelemetry({
      endpoint: ENDPOINT,
      apiKey: API_KEY,
      journal: journal.source,
      state,
      appId: "example-app",
      runtime: "node",
      intervalMs: 0,
      requestTimeoutMs: 30_000,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("aborted"));
          });
        }),
    });
    await telemetry.prepare();
    journal.documents.push(sampleJournal());
    const flushing = telemetry.flush();
    await new Promise((resolve) => setTimeout(resolve, 30));
    const started = Date.now();
    await telemetry.stop();
    expect(Date.now() - started).toBeLessThan(1000);
    expect(aborted).toBe(true);
    await flushing;
    const resumed = createCloudTelemetry({
      endpoint: ENDPOINT,
      apiKey: API_KEY,
      journal: journal.source,
      state,
      appId: "example-app",
      runtime: "node",
      intervalMs: 0,
      fetch: async (_url, init) => accept(init.body),
    });
    expect((await resumed.flush({ manual: true })).delivered).toBe(true);
    await resumed.stop();
  });

  it("exports a later run after Cloud permanently rejects one run", async () => {
    const seen: string[] = [];
    const journal = mutableJournal();
    const telemetry = createCloudTelemetry({
      endpoint: ENDPOINT,
      apiKey: API_KEY,
      journal: journal.source,
      state: createMemoryTelemetryStore(),
      appId: "example-app",
      runtime: "node",
      intervalMs: 0,
      fetch: async (_url, init) => {
        seen.push(init.body);
        const runId = runIdOf(init.body);
        if (runId === "run-a") {
          return {
            status: 400,
            async text() {
              return JSON.stringify({
                error: "quota_exceeded",
                limit: "monthly_observed_runs",
                allowance: 1,
              });
            },
          };
        }
        return accept(init.body);
      },
    });
    await telemetry.prepare();
    journal.documents.push(journalFor("run-a", 1), journalFor("run-b", 2));
    const flushed = await telemetry.flush({ manual: false });
    expect(flushed.delivered).toBe(true);
    expect(flushed.error).toBe("rejected");
    expect(seen.map((body) => runIdOf(body))).toEqual(["run-a", "run-b"]);
    expect(telemetry.current().rejectedRuns).toBe(1);
    const again = await telemetry.flush({ manual: false });
    expect(again.delivered).toBe(false);
    expect(seen).toHaveLength(2);
    await telemetry.stop();
  });

  it("keeps a permanent rejection across restart and still exports another run", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-telemetry-reject-"));
    const database = new DatabaseSync(join(directory, "cursor.sqlite"));
    const seen: string[] = [];
    try {
      const journal = mutableJournal();
      const state = createSqliteTelemetryStore(sqlStore(database));
      let rejectRunA = true;
      const fetch: TelemetryFetch = async (_url, init) => {
        seen.push(init.body);
        if (rejectRunA && runIdOf(init.body) === "run-a") {
          return {
            status: 409,
            async text() {
              return JSON.stringify({ error: "history_conflict", runId: "run-a", sequence: 1 });
            },
          };
        }
        return accept(init.body);
      };
      const telemetry = createCloudTelemetry({
        endpoint: ENDPOINT,
        apiKey: API_KEY,
        journal: journal.source,
        state,
        appId: "example-app",
        runtime: "node",
        intervalMs: 0,
        fetch,
      });
      await telemetry.prepare();
      journal.documents.push(journalFor("run-a", 1), journalFor("run-b", 2));
      expect((await telemetry.flush({ manual: false })).error).toBe("rejected");
      await telemetry.stop();
      const resumed = createCloudTelemetry({
        endpoint: ENDPOINT,
        apiKey: API_KEY,
        journal: journal.source,
        state,
        appId: "example-app",
        runtime: "node",
        intervalMs: 0,
        fetch,
      });
      await resumed.prepare();
      expect((await resumed.flush({ manual: false })).delivered).toBe(false);
      expect(seen.filter((body) => runIdOf(body) === "run-a")).toHaveLength(1);
      expect(seen.filter((body) => runIdOf(body) === "run-b")).toHaveLength(1);
      seen.length = 0;
      rejectRunA = false;
      expect((await resumed.flush({ manual: true })).delivered).toBe(true);
      expect(seen.map((body) => runIdOf(body))).toEqual(["run-a"]);
      await resumed.stop();
    } finally {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("does not treat an unknown HTTP 400 as delivered", async () => {
    const seen: string[] = [];
    const journal = mutableJournal();
    const telemetry = createCloudTelemetry({
      endpoint: ENDPOINT,
      apiKey: API_KEY,
      journal: journal.source,
      state: createMemoryTelemetryStore(),
      appId: "example-app",
      runtime: "node",
      intervalMs: 0,
      fetch: async (_url, init) => {
        seen.push(init.body);
        return {
          status: 400,
          async text() {
            return JSON.stringify({ error: "not_a_known_code" });
          },
        };
      },
    });
    await telemetry.prepare();
    journal.documents.push(journalFor("run-a", 1), journalFor("run-b", 2));
    const flushed = await telemetry.flush({ manual: false });
    expect(flushed.delivered).toBe(false);
    expect(flushed.error).toBe("invalid_batch");
    expect(seen).toHaveLength(1);
    expect((await telemetry.flush({ manual: false })).delivered).toBe(false);
    expect(seen).toHaveLength(1);
    await telemetry.stop();
  });

  it("waits for Retry-After on HTTP 429 and then delivers", async () => {
    let now = 1_000;
    let calls = 0;
    const journal = mutableJournal();
    const telemetry = createCloudTelemetry({
      endpoint: ENDPOINT,
      apiKey: API_KEY,
      journal: journal.source,
      state: createMemoryTelemetryStore(),
      appId: "example-app",
      runtime: "node",
      intervalMs: 0,
      clock: { now: () => now },
      fetch: async (_url, init) => {
        calls += 1;
        if (calls === 1) {
          return {
            status: 429,
            headers: {
              get(name: string) {
                return name.toLowerCase() === "retry-after" ? "30" : null;
              },
            },
            async text() {
              return JSON.stringify({ error: "rate_limited" });
            },
          };
        }
        return accept(init.body);
      },
    });
    await telemetry.prepare();
    journal.documents.push(sampleJournal());
    expect((await telemetry.flush({ manual: false })).error).toBe("rate_limited");
    now += 29_000;
    expect((await telemetry.flush({ manual: false })).delivered).toBe(false);
    expect(calls).toBe(1);
    now += 2_000;
    expect((await telemetry.flush({ manual: false })).delivered).toBe(true);
    expect(calls).toBe(2);
    await telemetry.stop();
  });

  it("retries an unauthorized destination after a manual flush", async () => {
    let status = 401;
    const journal = mutableJournal();
    const telemetry = createCloudTelemetry({
      endpoint: ENDPOINT,
      apiKey: API_KEY,
      journal: journal.source,
      state: createMemoryTelemetryStore(),
      appId: "example-app",
      runtime: "node",
      intervalMs: 0,
      fetch: async (_url, init) => {
        if (status === 401) {
          return {
            status: 401,
            async text() {
              return JSON.stringify({ error: "unauthorized" });
            },
          };
        }
        return accept(init.body);
      },
    });
    await telemetry.prepare();
    journal.documents.push(sampleJournal());
    expect((await telemetry.flush({ manual: false })).error).toBe("unauthorized");
    expect((await telemetry.flush({ manual: false })).delivered).toBe(false);
    status = 200;
    expect((await telemetry.flush({ manual: true })).delivered).toBe(true);
    await telemetry.stop();
  });
});

function journalFor(runId: string, updatedAt: number): JournalDocument {
  const document = sampleJournal(runId);
  return {
    ...document,
    run: { ...document.run, runId, updatedAt },
    events: document.events.map((event) => ({
      ...event,
      runId,
      eventId: `${runId}-${event.eventId}`,
    })),
  };
}

function runIdOf(body: string): string {
  const parsed = JSON.parse(body) as { runs: Array<{ runId: string }> };
  return parsed.runs[0]?.runId ?? "";
}

function sampleJournal(runId = "letters-1"): JournalDocument {
  return {
    run: {
      runId,
      workflowName: "count-letters",
      workflowVersion: 1,
      status: "COMPLETED",
      dataPolicy: "device-only",
      protocolVersion: 1,
      createdAt: 1,
      updatedAt: 5,
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
        eventId: "ev-1",
        runId: "letters-1",
        sequence: 1,
        type: "WORKFLOW_CREATED",
        createdAt: 1,
        payload: {
          workflowName: "count-letters",
          workflowVersion: 1,
          protocolVersion: 1,
          dataPolicy: "device-only",
        },
      },
      {
        eventId: "ev-2",
        runId: "letters-1",
        sequence: 2,
        type: "WORKFLOW_COMPLETED",
        createdAt: 5,
        payload: {},
      },
    ],
  };
}

function mutableJournal(initial: JournalDocument[] = []): {
  documents: JournalDocument[];
  source: JournalSource;
} {
  const documents = [...initial];
  return {
    documents,
    source: {
      async listHeads() {
        return documents.map((document) => ({
          runId: document.run.runId,
          updatedAt: document.run.updatedAt,
          maxSequence: document.events.reduce((max, event) => Math.max(max, event.sequence), 0),
        }));
      },
      async readSlice(runId, afterSequence, limit) {
        const document = documents.find((item) => item.run.runId === runId);
        if (!document) {
          return null;
        }
        const maxSequence = document.events.reduce(
          (max, event) => Math.max(max, event.sequence),
          0,
        );
        return {
          run: document.run,
          steps: document.steps,
          attempts: document.attempts,
          events: [...document.events]
            .filter((event) => event.sequence > afterSequence)
            .sort((left, right) => left.sequence - right.sequence)
            .slice(0, limit),
          maxSequence,
        };
      },
    },
  };
}

function largeJournal(runId: string, count: number): JournalDocument {
  const document = sampleJournal(runId);
  const events = Array.from({ length: count }, (_unused, index) => ({
    eventId: `${runId}-${String(index + 1)}`,
    runId,
    sequence: index + 1,
    type: index === count - 1 ? ("WORKFLOW_COMPLETED" as const) : ("WORKFLOW_STARTED" as const),
    createdAt: index + 1,
    payload: index === 0 ? document.events[0]!.payload : {},
  }));
  return {
    ...document,
    run: { ...document.run, updatedAt: count },
    events,
  };
}

function accept(body: string): Awaited<ReturnType<TelemetryFetch>> {
  const parsed = JSON.parse(body) as {
    batchId: string;
    runs: Array<{ runId: string; throughSequence: number }>;
  };
  const run = parsed.runs[0];
  if (run === undefined) {
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
            acceptedThroughSequence: run.throughSequence,
            duplicateSequences: [],
          },
        ],
      });
    },
  };
}

function sqlStore(database: DatabaseSync): TelemetrySql {
  return {
    exec(sql) {
      database.exec(sql);
    },
    get(sql) {
      return database.prepare(sql).get() as never;
    },
    run(sql, params = []) {
      database.prepare(sql).run(...(params as never[]));
    },
    transaction(work) {
      database.exec("BEGIN");
      try {
        work();
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
