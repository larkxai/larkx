import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  allowEventPayload,
  createCloudTelemetry,
  createMemoryTelemetryStore,
  createSqliteTelemetryStore,
  nodeInstallationMetadata,
  sanitizeInstallationMetadata,
  type JournalDocument,
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
    const telemetry = createCloudTelemetry({
      endpoint: ENDPOINT,
      apiKey: API_KEY,
      journal: journalOf(sampleJournal()),
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
    const telemetry = createCloudTelemetry({
      endpoint: ENDPOINT,
      apiKey: API_KEY,
      journal: journalOf(sampleJournal()),
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
      const telemetry = createCloudTelemetry({
        endpoint: ENDPOINT,
        apiKey: API_KEY,
        journal: journalOf(sampleJournal()),
        state: createSqliteTelemetryStore(sqlStore(database)),
        appId: "example-app",
        runtime: "node",
        intervalMs: 0,
        fetch: async (_url, init) => accept(init.body),
      });
      expect((await telemetry.flush()).delivered).toBe(true);
      await telemetry.stop();
      database.close();
      const reopened = new DatabaseSync(join(directory, "telemetry.sqlite"));
      let calls = 0;
      const resumed = createCloudTelemetry({
        endpoint: ENDPOINT,
        apiKey: API_KEY,
        journal: journalOf(sampleJournal()),
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
});

function sampleJournal(): JournalDocument {
  return {
    run: {
      runId: "letters-1",
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

function journalOf(document: JournalDocument) {
  return {
    async listRuns() {
      return [{ runId: document.run.runId, updatedAt: document.run.updatedAt }];
    },
    async readJournal() {
      return document;
    },
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
