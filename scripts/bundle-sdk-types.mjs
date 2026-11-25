import { existsSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { rollup } from "rollup";
import dts from "rollup-plugin-dts";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const declarations = {
  "@larkxai/host": join(repo, "packages/host/dist/index.d.ts"),
  "@larkxai/protocol": join(repo, "packages/protocol/dist/index.d.ts"),
  "@larkxai/cactus": join(repo, "packages/cactus/dist/index.d.ts"),
  "@larkxai/cactus/adapter": join(repo, "packages/cactus/dist/adapter.d.ts"),
};

const entries = process.argv.slice(2);
if (entries.length === 0) {
  throw new Error("Pass declaration entry files, for example dist/index.d.ts.");
}

const external = [
  "react",
  "react-native",
  "expo-file-system",
  "cactus-react-native",
  "react-native-nitro-modules",
];

function resolveInternalTypes() {
  return {
    name: "resolve-internal-types",
    resolveId(source) {
      const target = declarations[source];
      return target !== undefined && existsSync(target) ? target : null;
    },
  };
}

for (const entry of entries) {
  const bundle = await rollup({
    input: entry,
    external,
    plugins: [resolveInternalTypes(), dts()],
  });
  const directory = dirname(entry);
  const file = join(directory, `.${entry.split("/").at(-1)}.bundle`);
  await bundle.write({ file, format: "es" });
  await bundle.close();
  renameSync(file, entry);
}
