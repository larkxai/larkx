import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const root = realpathSync(join(import.meta.dirname, "../.."));

describe("packed Node SDK", () => {
  it("runs outside the monorepo", () => {
    const packed = mkdtempSync(join(tmpdir(), "larkx-pack-"));
    const build = spawnSync("pnpm", ["--filter", "@larkxai/node", "build"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(build.status, build.stderr).toBe(0);
    const pack = spawnSync(
      "pnpm",
      ["--filter", "@larkxai/node", "pack", "--pack-destination", packed],
      {
        cwd: root,
        encoding: "utf8",
      },
    );
    try {
      expect(pack.status, pack.stderr).toBe(0);
      const tarball = join(packed, "larkxai-node-0.1.2.tgz");
      const project = mkdtempSync(join(tmpdir(), "larkx-install-"));
      writeFileSync(
        join(project, "package.json"),
        JSON.stringify({ name: "larkx-install-check", private: true, type: "module" }),
      );
      const install = spawnSync("npm", ["install", tarball, "--no-fund", "--no-audit"], {
        cwd: project,
        encoding: "utf8",
      });
      expect(install.status, install.stderr).toBe(0);
      const manifest = JSON.parse(
        readFileSync(join(project, "node_modules/@larkxai/node/package.json"), "utf8"),
      ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      expect(manifest.dependencies ?? {}).toEqual({});
      expect(manifest.devDependencies).toBeUndefined();
      const nativeBuild = spawnSync("sh", ["node_modules/@larkxai/node/scripts/build-native.sh"], {
        cwd: project,
        encoding: "utf8",
      });
      expect(nativeBuild.status, nativeBuild.stderr).toBe(0);
      const addon = realpathSync(
        join(project, "node_modules/@larkxai/node/build/larkx_native.node"),
      );
      expect(addon.startsWith(realpathSync(project))).toBe(true);
      expect(addon.includes(`${root}/packages/react-native`)).toBe(false);
      writeFileSync(join(project, "run.mjs"), agentScript);
      const run = spawnSync(process.execPath, ["run.mjs", project], {
        cwd: project,
        encoding: "utf8",
      });
      expect(run.status, run.stderr).toBe(0);
      expect(JSON.parse(run.stdout)).toEqual({ first: "stored", second: "stored", toolCalls: 1 });
      const bundled = readFileSync(
        join(project, "node_modules/@larkxai/node/dist/index.js"),
        "utf8",
      );
      expect(bundled).not.toContain("@larkxai/host");
      expect(bundled).not.toContain("@larkxai/protocol");
      expect(bundled).not.toContain("react-native/build");
    } finally {
      spawnSync("node", ["packages/node/scripts/prepare-publish.mjs", "restore"], { cwd: root });
    }
  }, 180_000);
});

const agentScript = `
import { createRuntime, defineTool, scriptedModel, sqlite } from "@larkxai/node";

const directory = process.argv[2];
const database = directory + "/agent.db";
const tool = defineTool({
  name: "note",
  description: "Store a note",
  effects: "idempotent",
  schema: { type: "object", properties: {} },
  handler: () => ({ ok: true }),
});
const runtime = await createRuntime({ storage: sqlite(database), ownerId: "pack", leaseMs: 0 });
const agent = runtime.createAgent({
  name: "packed",
  version: 1,
  model: scriptedModel([
    { message: null, finish: "tool_calls", calls: [{ id: "c1", name: "note", arguments: {} }] },
    { message: "stored", finish: "stop", calls: [] },
  ]),
  instructions: "Remember.",
  tools: [tool],
});
const run = await agent.start({ message: "Remember this", runId: "packed-1" });
const first = await run.result();
await runtime.close();

const again = await createRuntime({ storage: sqlite(database), ownerId: "pack", leaseMs: 0 });
again.createAgent({
  name: "packed",
  version: 1,
  model: scriptedModel([{ message: "stored", finish: "stop", calls: [] }]),
  instructions: "Remember.",
  tools: [tool],
});
const recovered = await again.resume("packed-1");
const second = await recovered.result();
await again.close();
process.stdout.write(JSON.stringify({ first: first.message, second: second.message, toolCalls: second.toolCalls }));
`;
