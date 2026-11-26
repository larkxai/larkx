import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const { isAlreadyPublished, libraryPackageDirs } = createRequire(import.meta.url)(
  "../../scripts/publish-github-packages.mjs",
) as {
  isAlreadyPublished: (output: string) => boolean;
  libraryPackageDirs: (root: string) => string[];
};

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
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  exports?: Record<string, unknown>;
}

function readJson(path: string): PackageJson {
  return JSON.parse(readFileSync(path, "utf8")) as PackageJson;
}

function packageDirs(parent: string): string[] {
  return readdirSync(join(root, parent), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, parent, entry.name))
    .filter((dir) => existsSync(join(dir, "package.json")));
}

describe("npm publish layout", () => {
  const all = packageDirs("packages").map((dir) => ({
    dir,
    pkg: readJson(join(dir, "package.json")),
  }));
  const libraries = all.filter(({ pkg }) => pkg.private !== true);
  const internal = all.filter(({ pkg }) => pkg.private === true);
  const examples = packageDirs("examples").map((dir) => readJson(join(dir, "package.json")));
  const changeset = JSON.parse(readFileSync(join(root, ".changeset/config.json"), "utf8")) as {
    access?: string;
    fixed?: string[][];
    ignore?: string[];
  };
  const license = readFileSync(join(root, "LICENSE"));

  it("publishes only the React Native SDK", () => {
    expect(libraries.map(({ pkg }) => pkg.name)).toEqual(["@larkxai/react-native"]);
    for (const { dir, pkg } of libraries) {
      const directory = relative(root, dir);
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
          if (name.startsWith("@larkxai/")) expect(range).toBe("workspace:*");
        }
      }
      for (const name of Object.keys(pkg.dependencies ?? {})) {
        expect(name.startsWith("@larkxai/")).toBe(false);
      }
    }
    const reactNative = libraries.find(({ pkg }) => pkg.name === "@larkxai/react-native")?.pkg;
    expect(reactNative?.exports).toMatchObject({
      ".": expect.any(Object),
      "./cactus": expect.any(Object),
    });
    expect(reactNative?.peerDependenciesMeta).toMatchObject({
      "cactus-react-native": { optional: true },
    });
  });

  it("keeps the Node host and the other workspace packages private", () => {
    expect(internal.map(({ pkg }) => pkg.name).sort()).toEqual([
      "@larkxai/cactus",
      "@larkxai/host",
      "@larkxai/node",
      "@larkxai/protocol",
      "@larkxai/telemetry",
    ]);
    for (const { pkg } of internal) {
      expect(pkg.publishConfig).toBeUndefined();
    }
  });

  it("keeps the root package and examples off the registry", () => {
    const rootPackage = readJson(join(root, "package.json"));
    expect(rootPackage.name).toBe("larkx");
    expect(rootPackage.private).toBe(true);
    for (const [name, range] of Object.entries(rootPackage.devDependencies ?? {})) {
      if (name.startsWith("@larkxai/")) expect(range).toBe("workspace:*");
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

  it("keeps the telemetry sdk version aligned with the public SDK", () => {
    const reactNative = libraries.find(({ pkg }) => pkg.name === "@larkxai/react-native");
    if (!reactNative) throw new Error("missing @larkxai/react-native");
    const source = readFileSync(join(root, "packages/telemetry/src/project.ts"), "utf8");
    expect(source).toContain(`export const SDK_VERSION = "${reactNative.pkg.version}";`);
  });

  it("publishes the public libraries to GitHub Packages", () => {
    const names = libraryPackageDirs(root).map((dir) => basename(dir));
    expect(names).toEqual(["react-native"]);
    expect(changeset.fixed).toEqual([]);
    expect(isAlreadyPublished("You cannot publish over the previously published versions")).toBe(
      true,
    );
    expect(isAlreadyPublished("npm error code EPUBLISHCONFLICT")).toBe(true);
    expect(
      isAlreadyPublished(
        "npm error code E409\nnpm error 409 Conflict - PUT https://npm.pkg.github.com/@larkxai%2fagent - Cannot publish over existing version",
      ),
    ).toBe(true);
    expect(isAlreadyPublished("npm error code ENEEDAUTH")).toBe(false);
    expect(readFileSync(join(root, "package.json"), "utf8")).toContain(
      "node scripts/publish-github-packages.mjs",
    );
  });

  it("keeps the build status separate from publishing", () => {
    const build = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
    const release = readFileSync(join(root, ".github/workflows/release.yml"), "utf8");
    const readme = readFileSync(join(root, "README.md"), "utf8");
    expect(build).toContain("name: CI");
    expect(build).not.toContain("changesets/action");
    expect(release).toContain('workflows: ["CI"]');
    expect(release).toContain("changesets/action@v1");
    expect(release).toContain("publish: pnpm release");
    expect(release).toContain("version: pnpm version-packages");
    expect(release).toContain("createGithubReleases: true");
    expect(release).toContain("packages: write");
    expect(release).toContain("NPM_TOKEN:");
    expect(readme).toContain(
      "https://github.com/larkxai/larkx/actions/workflows/ci.yml/badge.svg?branch=main",
    );
  });
});
