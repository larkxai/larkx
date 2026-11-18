import { Directory, File, Paths } from "expo-file-system";

import type { DurableFileSystem } from "./artifacts.js";

/** Application document directory. The operating system does not treat this as a cache. */
export function createExpoDurableFiles(): DurableFileSystem {
  const directory = new Directory(Paths.document, "larkx-artifacts");
  return {
    async read(uri: string): Promise<Uint8Array> {
      return new Uint8Array(new File(uri).bytesSync());
    },
    async exists(uri: string): Promise<boolean> {
      return new File(uri).exists;
    },
    async write(artifactId: string, bytes: Uint8Array): Promise<string> {
      if (!directory.exists) {
        directory.create();
      }
      const temporary = new File(directory, `${artifactId}.tmp`);
      if (temporary.exists) {
        temporary.delete();
      }
      temporary.create();
      temporary.write(bytes);
      const target = new File(directory, artifactId);
      if (target.exists) {
        target.delete();
      }
      temporary.rename(artifactId);
      return new File(directory, artifactId).uri;
    },
  };
}
