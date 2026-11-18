import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createNodeSqliteDriver } from "@larkx/node";
import { registerLiveOwner } from "@larkx/react-native/ownership";
import { createMobileSqliteStorage } from "@larkx/react-native/storage";
import { storageConformanceCases } from "@larkx/testing";
import { describe, expect, it } from "vitest";

// These cases describe Node ownership: an active lease blocks every other owner,
// and an expired lease can be taken. Mobile storage steals only when the current
// owner is absent from this JavaScript realm, including before the lease expires.
const nodeOwnershipCases = new Set([
  "steals an expired lease and fences the previous epoch",
  "rejects a stale owner commit and keeps the winner",
  "serializes concurrent claims",
]);
const sharedCases = storageConformanceCases().filter(
  (testCase) => !nodeOwnershipCases.has(testCase.name),
);

describe("mobile sqlite storage", () => {
  for (const testCase of sharedCases) {
    it(testCase.name, async () => {
      const storage = open();
      try {
        await testCase.run(storage);
      } finally {
        await storage.close();
      }
    });
  }

  it("keeps an unexpired owner that is still live in this runtime", async () => {
    const storage = open();
    const release = registerLiveOwner("owner-a");
    try {
      await storage.createRun(run("live-owner"));
      const first = await storage.claimOwnership("live-owner", {
        ownerId: "owner-a",
        nowMs: 0,
        leaseMs: 60_000,
      });
      const second = await storage.claimOwnership("live-owner", {
        ownerId: "owner-b",
        nowMs: 1_000,
        leaseMs: 60_000,
      });
      expect(second.acquired).toBe(false);
      expect(second.epoch).toBe(first.epoch);
    } finally {
      release();
      await storage.close();
    }
  });

  it("lets one of two live owners win a concurrent claim", async () => {
    const storage = open();
    const leftOwner = randomUUID();
    const rightOwner = randomUUID();
    const releaseLeft = registerLiveOwner(leftOwner);
    const releaseRight = registerLiveOwner(rightOwner);
    try {
      await storage.createRun(run("live-race"));
      const [left, right] = await Promise.all([
        storage.claimOwnership("live-race", { ownerId: leftOwner, nowMs: 10, leaseMs: 60_000 }),
        storage.claimOwnership("live-race", { ownerId: rightOwner, nowMs: 10, leaseMs: 60_000 }),
      ]);
      expect([left, right].filter((result) => result.acquired)).toHaveLength(1);
    } finally {
      releaseLeft();
      releaseRight();
      await storage.close();
    }
  });

  it("replaces an owner that is gone from this runtime before the lease expires", async () => {
    const storage = open();
    const release = registerLiveOwner("owner-a");
    try {
      await storage.createRun(run("gone-owner"));
      const first = await storage.claimOwnership("gone-owner", {
        ownerId: "owner-a",
        nowMs: 0,
        leaseMs: 60_000,
      });
      release();
      const second = await storage.claimOwnership("gone-owner", {
        ownerId: "owner-b",
        nowMs: 1_000,
        leaseMs: 60_000,
      });
      expect(second.acquired).toBe(true);
      expect(second.epoch).toBe(first.epoch + 1);
      await expect(
        storage.apply({
          type: "begin-step",
          runId: "gone-owner",
          fence: { ownerId: "owner-a", epoch: first.epoch },
          nowMs: 2,
          stepKey: "a",
          stepOrder: 0,
          executionTarget: "local",
          selectedTarget: "local",
          effectType: "pure",
          operationId: "op-a",
          descriptorJson: "{}",
          inputJson: null,
          attemptId: "attempt-a",
          event: {
            eventId: "event-a",
            type: "STEP_STARTED",
            createdAt: 2,
            payload: { stepKey: "a" },
          },
        }),
      ).rejects.toMatchObject({ code: "execution_ownership_conflict" });
    } finally {
      await storage.close();
    }
  });
});

function open() {
  const directory = mkdtempSync(join(tmpdir(), "larkx-mobile-"));
  return createMobileSqliteStorage(createNodeSqliteDriver(join(directory, "larkx.db")));
}

function run(runId: string) {
  return {
    runId,
    workflowName: "room-analysis",
    workflowVersion: 1,
    inputJson: "{}",
    nowMs: 1,
    eventId: `created-${runId}`,
    protocolVersion: 1,
    dataPolicy: "device-only" as const,
  };
}
