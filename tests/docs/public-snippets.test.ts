import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  A2A_PROTOCOL_VERSION,
  A2A_REMOTE_CAPABILITIES,
  createRuntime,
  defineTool,
  larkxCloud,
  remoteAgent,
  scriptedModel,
  sqlite,
  ToolFailure,
} from "@larkxai/node";
import { describe, expect, it } from "vitest";

const reactNativeEntry = readFileSync(
  new URL("../../packages/react-native/src/index.ts", import.meta.url),
  "utf8",
);

describe("public documentation snippets", () => {
  it("re-exports the documented React Native names", () => {
    for (const name of [
      "createRuntime",
      "defineTool",
      "scriptedModel",
      "sqlite",
      "remoteAgent",
      "larkxCloud",
      "bindNativeAppState",
      "ToolFailure",
      "A2A_PROTOCOL_VERSION",
      "A2A_REMOTE_CAPABILITIES",
    ]) {
      expect(reactNativeEntry).toContain(name);
    }
    expect(
      readFileSync(new URL("../../packages/react-native/src/cactus.ts", import.meta.url), "utf8"),
    ).toContain("export function cactusModel");
  });

  it("runs the quickstart against the shared runtime", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-docs-quickstart-"));
    try {
      const runtime = await createRuntime({
        storage: sqlite(join(directory, "larkx.db")),
        ownerId: "notes",
      });
      const agent = runtime.createAgent({
        name: "notes",
        version: 1,
        instructions: "Read the note and answer in one line.",
        model: scriptedModel([
          {
            message: null,
            finish: "tool_calls",
            calls: [{ id: "call-1", name: "read_notes", arguments: {} }],
          },
          { message: "Seal needs service.", finish: "stop", calls: [] },
        ]),
        tools: [
          defineTool({
            name: "read_notes",
            description: "Read the local inspection notes.",
            effects: "pure",
            schema: { type: "object", properties: {} },
            handler: () => ({ notes: ["Seal weeps above 80 psi."] }),
          }),
        ],
      });
      const run = await agent.start({ message: "Inspect pump 12", runId: "notes-1" });
      const result = await run.result();
      expect(result.message).toBe("Seal needs service.");
      expect(result.finish).toBe("stop");
      await runtime.close();

      const resumed = await createRuntime({
        storage: sqlite(join(directory, "larkx.db")),
        ownerId: "notes",
      });
      resumed.createAgent({
        name: "notes",
        version: 1,
        instructions: "Read the note and answer in one line.",
        model: scriptedModel([]),
        tools: [
          defineTool({
            name: "read_notes",
            description: "Read the local inspection notes.",
            effects: "pure",
            schema: { type: "object", properties: {} },
            handler: () => ({ notes: ["should not run"] }),
          }),
        ],
      });
      const saved = await resumed.listRuns();
      const interrupted = saved.find((item) => item.runId === "notes-1");
      expect(interrupted?.status).toBe("COMPLETED");
      await resumed.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("accepts the documented remote agent and telemetry shapes", () => {
    const httpAgent = remoteAgent({
      name: "procurement-agent",
      description: "Find compatible replacement parts and suppliers.",
      transport: {
        type: "http",
        endpoint: "http://192.168.1.20:8787",
        capabilities: {
          dedupe: true,
          lookup: true,
          taskId: true,
          poll: true,
          cancel: true,
          persistent: true,
        },
        headers: () => ({ authorization: "Bearer example" }),
      },
    });
    const a2aAgent = remoteAgent({
      name: "supplier-research",
      description: "Find a replacement part and a supplier.",
      transport: {
        type: "a2a",
        endpoint: "https://procurement.example.com",
        protocolVersion: A2A_PROTOCOL_VERSION,
      },
    });
    expect(httpAgent.transport.type).toBe("http");
    expect(a2aAgent.transport.type).toBe("a2a");
    expect(A2A_PROTOCOL_VERSION).toBe("1.0");
    expect(A2A_REMOTE_CAPABILITIES.dedupe).toBe(false);
    expect(A2A_REMOTE_CAPABILITIES.lookup).toBe(false);
    const telemetry = larkxCloud({
      projectId: "my-project",
      apiKey: "lkx_ing_example",
      appId: "field-inspection",
    });
    expect(telemetry.kind).toBe("larkx-cloud");
    expect(telemetry.endpoint).toBeUndefined();
    expect(new ToolFailure("The note store is locked.", { retryable: true }).retryable).toBe(true);
  });

  it("does not repeat a committed tool when a new runtime opens the same database", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-docs-recovery-"));
    const database = sqlite(join(directory, "larkx.db"));
    try {
      const first = await createRuntime({ storage: database, ownerId: "notes" });
      let firstCalls = 0;
      const agent = first.createAgent({
        name: "notes",
        version: 1,
        instructions: "Read the note and answer in one line.",
        model: scriptedModel([
          {
            message: null,
            finish: "tool_calls",
            calls: [{ id: "call-1", name: "read_notes", arguments: {} }],
          },
          { message: "Seal needs service.", finish: "stop", calls: [] },
        ]),
        tools: [
          defineTool({
            name: "read_notes",
            description: "Read the local inspection notes.",
            effects: "pure",
            schema: { type: "object", properties: {} },
            handler: () => {
              firstCalls += 1;
              return { notes: ["Seal weeps above 80 psi."] };
            },
          }),
        ],
      });
      const run = await agent.start({ message: "Inspect pump 12", runId: "notes-1" });
      expect((await run.result()).message).toBe("Seal needs service.");
      await first.close();

      const restarted = await createRuntime({ storage: database, ownerId: "notes" });
      let repeated = 0;
      restarted.createAgent({
        name: "notes",
        version: 1,
        instructions: "Read the note and answer in one line.",
        model: scriptedModel([]),
        tools: [
          defineTool({
            name: "read_notes",
            description: "Read the local inspection notes.",
            effects: "pure",
            schema: { type: "object", properties: {} },
            handler: () => {
              repeated += 1;
              return { notes: ["this call means a committed step ran again"] };
            },
          }),
        ],
      });
      const saved = await restarted.listRuns();
      const existing = saved.find((item) => item.runId === "notes-1");
      expect(existing?.status).toBe("COMPLETED");
      expect(firstCalls).toBe(1);
      expect(repeated).toBe(0);
      await restarted.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("keeps the published version and the public imports in one place", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../../packages/react-native/package.json", import.meta.url), "utf8"),
    ) as { version: string };
    const docs = JSON.parse(
      readFileSync(new URL("../../docs/docs.json", import.meta.url), "utf8"),
    ) as { variables: { sdkVersion: string } };
    expect(docs.variables.sdkVersion).toBe(packageJson.version);

    const docsRoot = fileURLToPath(new URL("../../docs/", import.meta.url));
    const pages = mdxFiles(docsRoot);
    const forbidden = [
      "@larkxai/node",
      "@larkxai/host",
      "@larkxai/protocol",
      "@larkxai/telemetry",
      "@larkxai/cactus",
    ];
    const stale = [
      "are on the default branch and are not in that changelog",
      "was published before that module",
      "holds the destination on those responses",
      "still accepts schema 1 only",
    ];
    for (const page of pages) {
      const source = readFileSync(page, "utf8");
      expect(source, page).not.toContain(packageJson.version);
      for (const name of forbidden) {
        expect(source.includes(`"${name}"`) || source.includes(`'${name}'`), page).toBe(false);
      }
      for (const phrase of stale) {
        expect(source, page).not.toContain(phrase);
      }
    }
  });
});

function mdxFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...mdxFiles(path));
    } else if (entry.endsWith(".mdx")) {
      files.push(path);
    }
  }
  return files;
}
