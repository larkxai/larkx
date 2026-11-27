import { readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("packages/react-native/package.json", "utf8"));
if (typeof pkg.version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version)) {
  throw new Error(`Unexpected React Native SDK version: ${String(pkg.version)}`);
}

const file = "packages/telemetry/src/project.ts";
const source = readFileSync(file, "utf8");
const pattern = /export const SDK_VERSION = "[^"]*";/;
if (!pattern.test(source)) {
  throw new Error(`Could not find SDK_VERSION in ${file}`);
}

const next = source.replace(pattern, `export const SDK_VERSION = "${pkg.version}";`);
if (next !== source) writeFileSync(file, next);

const docsFile = "docs/docs.json";
const docs = readFileSync(docsFile, "utf8");
const docsPattern = /("sdkVersion": ")[^"]+(")/;
if (!docsPattern.test(docs)) {
  throw new Error(`Could not find variables.sdkVersion in ${docsFile}`);
}
const docsNext = docs.replace(docsPattern, `$1${pkg.version}$2`);
if (docsNext !== docs) writeFileSync(docsFile, docsNext);
