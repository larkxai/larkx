import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const registry = "https://npm.pkg.github.com";

export function isAlreadyPublished(output) {
  return /cannot publish over the previously published versions|cannot publish over existing version|EPUBLISHCONFLICT|previously published version|\bE409\b/i.test(
    output,
  );
}

export function libraryPackageDirs(root) {
  const packagesDir = join(root, "packages");
  return readdirSync(packagesDir)
    .map((name) => join(packagesDir, name))
    .filter((dir) => {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      return (
        pkg.private !== true && typeof pkg.name === "string" && pkg.name.startsWith("@larkxai/")
      );
    });
}

function publishOne(dir, userconfig) {
  const result = spawnSync(
    "npm",
    ["publish", "--ignore-scripts", "--access", "public", "--userconfig", userconfig],
    {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, NPM_CONFIG_PROVENANCE: "" },
    },
  );
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.status === 0 || isAlreadyPublished(output)) return;
  process.stderr.write(output);
  process.exit(result.status ?? 1);
}

function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    if (process.env.CI) {
      process.stderr.write("GITHUB_TOKEN is required to publish GitHub Packages.\n");
      process.exit(1);
    }
    process.stdout.write("Skipping GitHub Packages publish; GITHUB_TOKEN is not set.\n");
    return;
  }

  const userconfig = join(tmpdir(), `larkx-github-packages-${process.pid}.npmrc`);
  writeFileSync(
    userconfig,
    `@larkxai:registry=${registry}\n//npm.pkg.github.com/:_authToken=${token}\n`,
    { mode: 0o600 },
  );
  for (const dir of libraryPackageDirs(process.cwd())) {
    publishOne(dir, userconfig);
  }
}

if (process.argv[1]?.endsWith("publish-github-packages.mjs")) main();
