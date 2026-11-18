import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createEngine, defineWorkflow, EngineTermination } from "@larkx/core";
import { importDurableArtifact, type DurableFileSystem } from "@larkx/react-native/artifacts";
import { createMemoryStorage } from "@larkx/storage-memory";
import { createAutoClock } from "@larkx/testing";
import { describe, expect, it } from "vitest";

describe("durable artifacts", () => {
  it("reuses the durable copy when recovery runs after the temporary source is gone", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-artifact-"));
    const source = join(directory, "camera-cache.txt");
    writeFileSync(source, "room photo");
    const files = nodeFiles(join(directory, "durable"));
    const storage = createMemoryStorage();
    let passes = 0;
    const workflow = defineWorkflow({
      name: "attach",
      version: 1,
      async run(ctx) {
        return ctx.step("attach", {
          execution: "local",
          effects: "idempotent",
          run: async ({ operationId }) => {
            passes += 1;
            const artifact = await importDurableArtifact({
              storage,
              files,
              sourceUri: source,
              artifactId: operationId,
              contentType: "text/plain",
              nowMs: 10,
              hash: sha256,
            });
            expect(readFileSync(artifact.localUri).toString()).toBe("room photo");
            if (passes === 1) {
              rmSync(source);
              throw new EngineTermination();
            }
            return { artifactId: artifact.artifactId, localUri: artifact.localUri };
          },
        });
      },
    });
    const first = createEngine({
      storage,
      workflows: [workflow],
      clock: createAutoClock(),
      leaseMs: 0,
      heartbeat: false,
    });
    await expect(
      (await first.start(workflow, { id: "attach-1", input: {} })).result(),
    ).rejects.toBeInstanceOf(Error);

    const second = createEngine({
      storage,
      workflows: [workflow],
      clock: createAutoClock(),
      leaseMs: 0,
      heartbeat: false,
    });
    const output = await (await second.resume("attach-1")).result();
    expect(output).toMatchObject({ artifactId: expect.any(String) });
    expect(files.writes).toBe(1);
    expect(passes).toBe(2);
    const stored = await storage.getArtifact(
      typeof output === "object" && output !== null && "artifactId" in output
        ? String(output.artifactId)
        : "",
    );
    expect(stored?.remoteReference).toBeNull();
    expect(readFileSync(stored?.localUri ?? "").toString()).toBe("room photo");
    await second.close();
    await first.close();
  });

  it("rejects a missing temporary source when no durable copy exists", async () => {
    await expect(
      importDurableArtifact({
        storage: createMemoryStorage(),
        files: nodeFiles(mkdtempSync(join(tmpdir(), "larkx-empty-"))),
        sourceUri: join(tmpdir(), "missing-larkx-source.txt"),
        artifactId: "photo-1",
        contentType: "text/plain",
        nowMs: 1,
        hash: sha256,
      }),
    ).rejects.toMatchObject({ code: "storage_failure" });
  });
});

function nodeFiles(directory: string): DurableFileSystem & { writes: number } {
  const files: DurableFileSystem & { writes: number } = {
    writes: 0,
    async read(uri: string) {
      return new Uint8Array(readFileSync(uri));
    },
    async exists(uri: string) {
      try {
        readFileSync(uri);
        return true;
      } catch {
        return false;
      }
    },
    async write(artifactId: string, bytes: Uint8Array) {
      files.writes += 1;
      mkdirSync(directory, { recursive: true });
      const path = join(directory, artifactId);
      writeFileSync(path, bytes);
      return path;
    },
  };
  return files;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", copy))]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
