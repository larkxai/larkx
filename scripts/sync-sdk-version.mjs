import { readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("packages/telemetry/package.json", "utf8"));
if (typeof pkg.version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version)) {
  throw new Error(`Unexpected telemetry package version: ${String(pkg.version)}`);
}

const file = "packages/telemetry/src/project.ts";
const source = readFileSync(file, "utf8");
const pattern = /export const SDK_VERSION = "[^"]*";/;
if (!pattern.test(source)) {
  throw new Error(`Could not find SDK_VERSION in ${file}`);
}

const next = source.replace(pattern, `export const SDK_VERSION = "${pkg.version}";`);
if (next !== source) writeFileSync(file, next);
