import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createNodeSqliteStorage } from "@larkx/node";
import { createMemoryStorage } from "@larkx/storage-memory";
import { storageConformanceCases } from "@larkx/testing";
import { describe, expect, it } from "vitest";

const cases = storageConformanceCases();

describe("memory storage conformance", () => {
  for (const testCase of cases) {
    it(testCase.name, async () => {
      const storage = createMemoryStorage();
      try {
        await testCase.run(storage);
      } finally {
        await storage.close();
      }
    });
  }

  it("steals when the storage says the current owner is gone", async () => {
    let steal = false;
    const storage = createMemoryStorage({ mayStealFrom: () => steal });
    const { encodeJson } = await import("@larkx/core");
    const { PROTOCOL_VERSION } = await import("@larkx/protocol");
    await storage.createRun({
      runId: "steal-me",
      workflowName: "room-analysis",
      workflowVersion: 1,
      inputJson: encodeJson({ ok: true }),
      nowMs: 1,
      eventId: "created-steal",
      protocolVersion: PROTOCOL_VERSION,
      dataPolicy: "device-only",
    });
    const first = await storage.claimOwnership("steal-me", {
      ownerId: "owner-a",
      nowMs: 10,
      leaseMs: 5_000,
    });
    const blocked = await storage.claimOwnership("steal-me", {
      ownerId: "owner-b",
      nowMs: 20,
      leaseMs: 5_000,
    });
    expect(blocked.acquired).toBe(false);
    steal = true;
    const stolen = await storage.claimOwnership("steal-me", {
      ownerId: "owner-b",
      nowMs: 30,
      leaseMs: 5_000,
    });
    expect(stolen.acquired).toBe(true);
    expect(stolen.epoch).toBe(first.epoch + 1);
    await storage.close();
  });
});

describe("sqlite storage conformance", () => {
  for (const testCase of cases) {
    it(testCase.name, async () => {
      const directory = mkdtempSync(join(tmpdir(), "larkx-sqlite-"));
      const storage = createNodeSqliteStorage({ database: join(directory, "larkx.db") });
      try {
        await testCase.run(storage);
      } finally {
        await storage.close();
      }
    });
  }

  it("reopens a database and keeps committed state", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-reopen-"));
    const database = join(directory, "larkx.db");
    const first = createNodeSqliteStorage({ database });
    await cases[0]?.run(first);
    await first.close();
    const second = createNodeSqliteStorage({ database });
    const run = await second.loadRun("run-1");
    expect(run?.status).toBe("CREATED");
    expect(run?.workflowName).toBe("room-analysis");
    await second.close();
  });
});
