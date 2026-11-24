import { randomUUID } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { dirname } from "node:path";

import { createEngine, defineWorkflow } from "@larkxai/core";
import { createNodeSqliteDriver } from "@larkxai/node";
import { importDurableArtifact, type DurableFileSystem } from "@larkxai/react-native/artifacts";
import { registerLiveOwner } from "@larkxai/react-native/ownership";
import { createMobileSqliteStorage } from "@larkxai/react-native/storage";

interface Args {
  database: string;
  log: string;
  workflow: "notes" | "charge" | "artifact";
  crashDuring?: string;
  artifactSource?: string;
  artifactDir?: string;
}

const args = parseArgs(process.argv.slice(2));
const storage = createMobileSqliteStorage(createNodeSqliteDriver(args.database));

const notes = defineWorkflow({
  name: "mobile-notes",
  version: 1,
  async run(ctx, input: { text: string }) {
    const normalized = await ctx.step("intake", {
      execution: "local",
      effects: "pure",
      run: () => {
        record("intake");
        crashIf("intake");
        return input.text.trim().toLowerCase();
      },
    });
    const total = await ctx.step("count", {
      execution: "local",
      effects: "pure",
      run: () => {
        record("count");
        crashIf("count");
        return normalized.length;
      },
    });
    await ctx.step("pause", {
      execution: "local",
      effects: "pure",
      run: () => {
        record("pause");
        crashIf("pause");
        return "paused";
      },
    });
    return ctx.step("record", {
      execution: "local",
      effects: "idempotent",
      run: ({ operationId }) => {
        record(`record ${operationId}`);
        crashIf("record");
        return { operationId, total, normalized };
      },
    });
  },
});

const charge = defineWorkflow({
  name: "mobile-charge",
  version: 1,
  async run(ctx) {
    return ctx.step("charge", {
      execution: "local",
      effects: "non-idempotent",
      run: ({ operationId }) => {
        record(`charge ${operationId}`);
        crashIf("charge");
        return { operationId, charged: true };
      },
    });
  },
});

const artifact = defineWorkflow({
  name: "mobile-artifact",
  version: 1,
  async run(ctx, input: { sourceUri: string; directory: string }) {
    return ctx.step("attach", {
      execution: "local",
      effects: "idempotent",
      run: async ({ operationId }) => {
        const stored = await importDurableArtifact({
          storage,
          files: nodeFiles(input.directory),
          sourceUri: input.sourceUri,
          artifactId: operationId,
          contentType: "text/plain",
          nowMs: Date.now(),
          hash: sha256,
        });
        record(`attach ${stored.artifactId}`);
        crashIf("attach");
        return {
          artifactId: stored.artifactId,
          localUri: stored.localUri,
          hash: stored.contentHash,
        };
      },
    });
  },
});

const ownerId = randomUUID();
registerLiveOwner(ownerId);
const engine = createEngine({
  storage,
  workflows: [notes, charge, artifact],
  ownerId,
  leaseMs: 60_000,
  heartbeat: false,
});

const runId = `${args.workflow}-run`;

try {
  const run =
    args.workflow === "charge"
      ? await engine.start(charge, { id: runId, input: {} })
      : args.workflow === "artifact"
        ? await engine.start(artifact, {
            id: runId,
            input: {
              sourceUri: required(args.artifactSource, "artifact-source"),
              directory: required(args.artifactDir, "artifact-dir"),
            },
          })
        : await engine.start(notes, { id: runId, input: { text: "Hello LarkX" } });
  const output = await run.result();
  writeResult({ status: "COMPLETED", output, steps: await engine.getSteps(run.id) });
  await engine.close();
} catch (error) {
  const snapshot = await engine.getRun(runId).catch(() => null);
  const steps = await engine.getSteps(runId).catch(() => []);
  writeResult({
    status: snapshot?.status ?? "FAILED",
    blockedReason: snapshot?.blockedReason ?? null,
    error: error instanceof Error ? error.message : "unknown error",
    steps,
  });
  await engine.close();
  process.exitCode = snapshot?.status === "BLOCKED" ? 2 : 1;
}

function crashIf(stepKey: string): void {
  if (args.crashDuring === stepKey) {
    process.kill(process.pid, "SIGKILL");
  }
}

function record(line: string): void {
  mkdirSync(dirname(args.log), { recursive: true });
  const file = openSync(args.log, "a");
  try {
    writeSync(file, `${line}\n`);
    fsyncSync(file);
  } finally {
    closeSync(file);
  }
}

function writeResult(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function nodeFiles(directory: string): DurableFileSystem {
  return {
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
      mkdirSync(directory, { recursive: true });
      const path = `${directory}/${artifactId}`;
      const temporary = `${path}.tmp`;
      writeFileSync(temporary, bytes);
      renameSync(temporary, path);
      return path;
    },
  };
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function parseArgs(argv: string[]): Args {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key?.startsWith("--") && value !== undefined) {
      values.set(key.slice(2), value);
    }
  }
  const database = values.get("database");
  const log = values.get("log");
  const workflow = values.get("workflow") ?? "notes";
  if (!database || !log) {
    throw new Error("--database and --log are required");
  }
  if (workflow !== "notes" && workflow !== "charge" && workflow !== "artifact") {
    throw new Error("--workflow must be notes, charge, or artifact");
  }
  const crashDuring = values.get("crash-during");
  const artifactSource = values.get("artifact-source");
  const artifactDir = values.get("artifact-dir");
  return {
    database,
    log,
    workflow,
    ...(crashDuring !== undefined ? { crashDuring } : {}),
    ...(artifactSource !== undefined ? { artifactSource } : {}),
    ...(artifactDir !== undefined ? { artifactDir } : {}),
  };
}

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`--${name} is required`);
  }
  return value;
}
