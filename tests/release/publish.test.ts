import { readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));

interface PackageJson {
  name: string;
  version: string;
  private?: boolean;
  license?: string;
  files?: string[];
  publishConfig?: { access?: string };
  repository?: { type?: string; url?: string; directory?: string };
  homepage?: string;
  bugs?: { url?: string };
  engines?: { node?: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

function readJson(path: string): PackageJson {
  return JSON.parse(readFileSync(path, "utf8")) as PackageJson;
}

function packageDirs(parent: string): string[] {
  return readdirSync(join(root, parent))
    .map((name) => join(root, parent, name))
    .filter((dir) => readFileSync(join(dir, "package.json"), "utf8").length > 0);
}

describe("npm publish layout", () => {
  const libraries = packageDirs("packages").map((dir) => ({
    dir,
    pkg: readJson(join(dir, "package.json")),
  }));
  const examples = packageDirs("examples").map((dir) => readJson(join(dir, "package.json")));
  const changeset = JSON.parse(readFileSync(join(root, ".changeset/config.json"), "utf8")) as {
    access?: string;
    ignore?: string[];
  };
  const license = readFileSync(join(root, "LICENSE"));

  it("publishes library packages publicly from the @larkx scope", () => {
    expect(libraries.length).toBeGreaterThan(0);
    for (const { dir, pkg } of libraries) {
      const directory = relative(root, dir);
      expect(pkg.private).not.toBe(true);
      expect(pkg.name).toBe(`@larkx/${basename(directory)}`);
      expect(pkg.license).toBe("Apache-2.0");
      expect(pkg.publishConfig).toEqual({ access: "public" });
      expect(pkg.files).toEqual(expect.arrayContaining(["dist", "README.md", "LICENSE"]));
      expect(pkg.repository).toEqual({
        type: "git",
        url: "git+https://github.com/larkxai/larkx.git",
        directory,
      });
      expect(pkg.homepage).toBe(`https://github.com/larkxai/larkx/tree/main/${directory}#readme`);
      expect(pkg.bugs).toEqual({ url: "https://github.com/larkxai/larkx/issues" });
      expect(readFileSync(join(dir, "LICENSE"))).toEqual(license);
      for (const dependencies of [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies]) {
        for (const [name, range] of Object.entries(dependencies ?? {})) {
          if (name.startsWith("@larkx/")) expect(range).toBe("workspace:*");
        }
      }
    }
    expect(libraries.find(({ pkg }) => pkg.name === "@larkx/node")?.pkg.engines).toEqual({
      node: ">=22.13.0",
    });
  });

  it("keeps the root package and examples off the registry", () => {
    const rootPackage = readJson(join(root, "package.json"));
    expect(rootPackage.name).toBe("larkx");
    expect(rootPackage.private).toBe(true);
    for (const [name, range] of Object.entries(rootPackage.devDependencies ?? {})) {
      if (name.startsWith("@larkx/")) expect(range).toBe("workspace:*");
    }
    expect(examples.length).toBeGreaterThan(0);
    for (const pkg of examples) {
      expect(pkg.private).toBe(true);
      expect(changeset.ignore).toContain(pkg.name);
    }
  });

  it("publishes the fixed group with public access", () => {
    expect(changeset.access).toBe("public");
  });

  it("keeps the telemetry sdk version aligned with the package", () => {
    const telemetry = libraries.find(({ pkg }) => pkg.name === "@larkx/telemetry");
    if (!telemetry) throw new Error("missing @larkx/telemetry");
    const source = readFileSync(join(root, "packages/telemetry/src/project.ts"), "utf8");
    expect(source).toContain(`export const SDK_VERSION = "${telemetry.pkg.version}";`);
  });

  it("releases from main after the check job", () => {
    const workflow = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
    expect(workflow).toContain("changesets/action@v1");
    expect(workflow).toContain("publish: pnpm release");
    expect(workflow).toContain("version: pnpm version-packages");
    expect(workflow).toContain("NPM_TOKEN:");
    expect(workflow).toContain("needs: check");
  });
});
