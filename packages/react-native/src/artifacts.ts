import type { ArtifactRecord, WorkflowStorage } from "@larkx/core";
import { LarkxError } from "@larkx/protocol";

const ARTIFACT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export interface DurableFileSystem {
  read(uri: string): Promise<Uint8Array>;
  exists(uri: string): Promise<boolean>;
  /**
   * Write `bytes` so a later `read` of the returned URI returns those bytes.
   * The URI must stay valid for the life of the application install.
   */
  write(artifactId: string, bytes: Uint8Array): Promise<string>;
}

export interface ImportArtifactInput {
  readonly storage: WorkflowStorage;
  readonly files: DurableFileSystem;
  readonly sourceUri: string;
  readonly artifactId: string;
  readonly contentType: string;
  readonly nowMs: number;
  readonly hash: (bytes: Uint8Array) => Promise<string>;
}

/**
 * Copy a temporary file into durable storage, then record it.
 * The metadata row is inserted only after the durable bytes are readable.
 * A later call with the same id reuses that row when the durable file still matches.
 * Nothing here uploads the file or deletes it. The application owns cleanup.
 */
export async function importDurableArtifact(input: ImportArtifactInput): Promise<ArtifactRecord> {
  if (!ARTIFACT_ID.test(input.artifactId)) {
    throw new LarkxError({
      code: "invalid_workflow_definition",
      message: "Artifact id must match /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.",
      retryable: false,
    });
  }
  const existing = await input.storage.getArtifact(input.artifactId);
  if (existing && (await durableCopyMatches(input, existing))) {
    return existing;
  }
  const source = await readSource(input);
  const contentHash = await input.hash(source);
  if (existing && existing.contentHash !== contentHash) {
    throw new LarkxError({
      code: "storage_failure",
      message: `Artifact ${input.artifactId} already exists with a different content hash.`,
      retryable: false,
    });
  }
  const localUri = await input.files.write(input.artifactId, source);
  const written = await input.files.read(localUri);
  const writtenHash = await input.hash(written);
  if (writtenHash !== contentHash || written.byteLength !== source.byteLength) {
    throw new LarkxError({
      code: "storage_failure",
      message: `Durable copy of artifact ${input.artifactId} did not match the source bytes.`,
      retryable: true,
    });
  }
  const record: ArtifactRecord = {
    artifactId: input.artifactId,
    localUri,
    remoteReference: null,
    contentHash,
    contentType: input.contentType,
    sizeBytes: source.byteLength,
    createdAt: existing?.createdAt ?? input.nowMs,
  };
  if (!existing) {
    await input.storage.insertArtifact(record);
  }
  return record;
}

async function durableCopyMatches(
  input: ImportArtifactInput,
  existing: ArtifactRecord,
): Promise<boolean> {
  if (!(await input.files.exists(existing.localUri))) {
    return false;
  }
  const durable = await input.files.read(existing.localUri);
  const durableHash = await input.hash(durable);
  return durableHash === existing.contentHash && durable.byteLength === existing.sizeBytes;
}

async function readSource(input: ImportArtifactInput): Promise<Uint8Array> {
  try {
    return await input.files.read(input.sourceUri);
  } catch (error) {
    throw new LarkxError({
      code: "storage_failure",
      message: `Temporary artifact source ${input.sourceUri} is not readable. Import it before that file disappears.`,
      retryable: false,
      cause: error,
    });
  }
}
