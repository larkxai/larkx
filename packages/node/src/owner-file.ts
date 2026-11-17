import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

interface OwnerFile {
  pid: number;
  ownerId: string;
}

export function ownerFilePath(databasePath: string): string {
  return `${databasePath}.larkx-owner.json`;
}

export function readOwnerFile(databasePath: string): OwnerFile | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(ownerFilePath(databasePath), "utf8"));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("pid" in parsed) ||
      !("ownerId" in parsed) ||
      typeof parsed.pid !== "number" ||
      typeof parsed.ownerId !== "string"
    ) {
      return null;
    }
    return { pid: parsed.pid, ownerId: parsed.ownerId };
  } catch {
    return null;
  }
}

export function ownerProcessIsDead(pid: number): boolean {
  if (pid === process.pid) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH";
  }
}

export function writeOwnerFile(databasePath: string, ownerId: string): void {
  const path = ownerFilePath(databasePath);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${String(process.pid)}.tmp`;
  writeFileSync(temporary, JSON.stringify({ pid: process.pid, ownerId }));
  renameSync(temporary, path);
}
