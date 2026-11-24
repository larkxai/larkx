import { readFileSync } from "node:fs";

import {
  createEngine,
  defineWorkflow,
  EngineTermination,
  LarkxError,
  type ExecutionEventRecord,
} from "@larkxai/core";
import { EVENT_TYPES, SENSITIVE_EVENT_KEYS } from "@larkxai/protocol";
import { createMemoryStorage } from "@larkxai/storage-memory";
import { createAutoClock } from "@larkxai/testing";
import { describe, expect, it } from "vitest";

interface FixtureEvent {
  eventId: string;
  sequence: number;
  type: string;
  payload: Record<string, unknown>;
}

interface FixtureDocument {
  classification: { journal: string; telemetryBatches: string };
  journal: { events: FixtureEvent[] };
  telemetryBatches: Array<{
    purpose: string;
    body: {
      telemetryVersion: number;
      mode: string;
      runs: Array<{ events: FixtureEvent[] }>;
    };
  }>;
}

const directory = new URL("../../docs/fixtures/cloud-observability/", import.meta.url);
const files = [
  "successful-workflow.json",
  "interrupted-recovered-workflow.json",
  "failed-workflow.json",
  "retried-idempotent-operation.json",
  "blocked-non-idempotent-operation.json",
];

function load(name: string): FixtureDocument {
  return JSON.parse(readFileSync(new URL(name, directory), "utf8")) as FixtureDocument;
}

function types(events: readonly { type: string }[]): string[] {
  return events.map((event) => event.type);
}

describe("cloud observability fixtures", () => {
  it("projects implemented journals into metadata-only batches", () => {
    const sensitive = new Set<string>(SENSITIVE_EVENT_KEYS);
    for (const name of files) {
      const fixture = load(name);
      expect(fixture.classification).toEqual({
        journal: "implemented",
        telemetryBatches: "proposed",
      });
      const events = fixture.journal.events;
      expect(events.map((event) => event.sequence)).toEqual(events.map((_, index) => index + 1));
      for (const event of events) {
        expect(EVENT_TYPES).toContain(event.type);
        for (const key of Object.keys(event.payload)) {
          expect(sensitive.has(key)).toBe(false);
        }
      }
      const serialized = JSON.stringify(fixture);
      expect(serialized).not.toContain("bad input");
      expect(serialized).not.toContain("hello larkx");
      for (const batch of fixture.telemetryBatches) {
        expect(batch.body.telemetryVersion).toBe(1);
        expect(batch.body.mode).toBe("metadata-only");
        const batchTypes = types(batch.body.runs[0]?.events ?? []);
        if (batch.purpose === "full-resync") {
          expect(batchTypes).toEqual(types(events));
        }
        if (batch.purpose === "checkpoint-suffix") {
          expect(types(events).slice(-batchTypes.length)).toEqual(batchTypes);
        }
      }
    }
  });

  it("matches the permanent-failure journal the engine writes", async () => {
    const fixture = load("failed-workflow.json");
    const history = await runPermanentFailure();
    expect(history.map((event) => ({ type: event.type, payload: event.payload }))).toEqual(
      fixture.journal.events.map((event) => ({ type: event.type, payload: event.payload })),
    );
    expect(history.map((event) => event.eventId)).toEqual(
      fixture.journal.events.map((event) => event.eventId),
    );
  });

  it("matches the recovery event sequences from the M2 crash paths", async () => {
    const interrupted = await recoverCount("count");
    const idempotent = await recoverCount("summarize");
    const blocked = await recoverCharge();
    expect(types(interrupted)).toEqual(
      types(load("interrupted-recovered-workflow.json").journal.events),
    );
    expect(types(idempotent)).toEqual(
      types(load("retried-idempotent-operation.json").journal.events),
    );
    expect(types(blocked)).toEqual(
      types(load("blocked-non-idempotent-operation.json").journal.events),
    );

    const summarize = idempotent.filter(
      (event) => event.type === "STEP_STARTED" && event.payload["stepKey"] === "summarize",
    );
    expect(summarize).toHaveLength(2);
    expect(summarize[0]?.payload["operationId"]).toBe(summarize[1]?.payload["operationId"]);
    expect(blocked.at(-1)?.type).toBe("WORKFLOW_BLOCKED");
    expect(blocked.at(-2)?.payload["reason"]).toBe("interrupted");
  });
});

async function runPermanentFailure(): Promise<ExecutionEventRecord[]> {
  let next = 0x3000;
  const workflow = defineWorkflow({
    name: "permanent",
    version: 1,
    async run(ctx) {
      return ctx.step("work", {
        execution: "local",
        effects: "pure",
        run: () => {
          throw new LarkxError({
            code: "permanent_execution_failure",
            message: "bad input",
            retryable: false,
          });
        },
      });
    },
  });
  const engine = createEngine({
    storage: createMemoryStorage(),
    workflows: [workflow],
    clock: createAutoClock(1_700_000_000_000),
    leaseMs: 0,
    ownerId: "owner-a",
    createId: () => {
      next += 1;
      return `00000000-0000-4000-8000-${next.toString(16).padStart(12, "0")}`;
    },
  });
  const handle = await engine.start(workflow, { id: "perm-1", input: {} });
  await handle.result().catch((error: unknown) => error);
  const history = await engine.getHistory("perm-1");
  await engine.close();
  return history;
}

async function recoverCount(crashAt: "count" | "summarize"): Promise<ExecutionEventRecord[]> {
  const seen = new Map<string, number>();
  const workflow = defineWorkflow({
    name: "count-letters",
    version: 1,
    async run(ctx, input: { text: string }) {
      const normalized = await ctx.step("normalize", {
        execution: "local",
        effects: "pure",
        run: () => input.text.trim().toLowerCase(),
      });
      const total = await ctx.step("count", {
        execution: "local",
        effects: "pure",
        run: () => {
          const count = (seen.get("count") ?? 0) + 1;
          seen.set("count", count);
          if (crashAt === "count" && count === 1) {
            throw new EngineTermination();
          }
          return normalized.length;
        },
      });
      return ctx.step("summarize", {
        execution: "local",
        effects: "idempotent",
        run: () => {
          const count = (seen.get("summarize") ?? 0) + 1;
          seen.set("summarize", count);
          if (crashAt === "summarize" && count === 1) {
            throw new EngineTermination();
          }
          return total;
        },
      });
    },
  });
  const storage = createMemoryStorage();
  const first = createEngine({
    storage,
    workflows: [workflow],
    clock: createAutoClock(),
    leaseMs: 0,
    ownerId: "owner-a",
  });
  const started = await first.start(workflow, { id: "letters-run", input: { text: " AbC " } });
  await started.result().catch((error: unknown) => error);
  const second = createEngine({
    storage,
    workflows: [workflow],
    clock: createAutoClock(),
    leaseMs: 0,
    ownerId: "owner-b",
  });
  const resumed = await second.resume("letters-run");
  await resumed.result();
  const history = await second.getHistory("letters-run");
  await second.close();
  return history;
}

async function recoverCharge(): Promise<ExecutionEventRecord[]> {
  const workflow = defineWorkflow({
    name: "charge-once",
    version: 1,
    async run(ctx) {
      return ctx.step("charge", {
        execution: "local",
        effects: "non-idempotent",
        run: () => {
          throw new EngineTermination();
        },
      });
    },
  });
  const storage = createMemoryStorage();
  const first = createEngine({
    storage,
    workflows: [workflow],
    clock: createAutoClock(),
    leaseMs: 0,
    ownerId: "owner-a",
  });
  const started = await first.start(workflow, { id: "charge-run", input: { amount: 1 } });
  await started.result().catch((error: unknown) => error);
  const second = createEngine({
    storage,
    workflows: [workflow],
    clock: createAutoClock(),
    leaseMs: 0,
    ownerId: "owner-b",
  });
  const resumed = await second.resume("charge-run");
  await resumed.result().catch((error: unknown) => error);
  const history = await second.getHistory("charge-run");
  await second.close();
  return history;
}
