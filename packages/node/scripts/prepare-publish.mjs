import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = join(packageRoot, "package.json");
const backup = join(packageRoot, "package.json.pack-backup");
const mode = process.argv[2];

if (mode === "strip") {
  const original = readFileSync(packageJson, "utf8");
  writeFileSync(backup, original);
  const pkg = JSON.parse(original);
  delete pkg.devDependencies;
  const dependencies = pkg.dependencies;
  if (dependencies !== undefined) {
    for (const name of Object.keys(dependencies)) {
      if (name.startsWith("@larkxai/") || dependencies[name] === "workspace:*") {
        delete dependencies[name];
      }
    }
    if (Object.keys(dependencies).length === 0) {
      delete pkg.dependencies;
    }
  }
  writeFileSync(packageJson, `${JSON.stringify(pkg, null, 2)}\n`);
} else if (mode === "restore") {
  if (!existsSync(backup)) process.exit(0);
  writeFileSync(packageJson, readFileSync(backup));
  unlinkSync(backup);
} else {
  console.error("Pass strip or restore.");
  process.exit(1);
}
