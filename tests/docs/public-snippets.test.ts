import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
});
