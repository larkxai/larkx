import { LarkxError, isJsonObject, type JsonObject, type JsonValue } from "@larkx/protocol";

function jsonError(message: string): LarkxError {
  return new LarkxError({
    code: "serialization_failure",
    message,
    retryable: false,
  });
}

function normalize(value: unknown, path: string): JsonValue {
  if (value === null) {
    return null;
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw jsonError(`${path} must be a finite number.`);
    }
    return value;
  }
  if (value === undefined) {
    throw jsonError(`${path} is undefined and cannot be stored.`);
  }
  if (typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") {
    throw jsonError(`${path} is not a JSON value.`);
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => normalize(item, `${path}[${String(index)}]`));
  }
  if (typeof value === "object") {
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw jsonError(`${path} must be a plain object.`);
    }
    const record = value as Record<string, unknown>;
    const normalized: { [key: string]: JsonValue } = {};
    for (const key of Object.keys(record).sort()) {
      normalized[key] = normalize(record[key], `${path}.${key}`);
    }
    return normalized;
  }
  throw jsonError(`${path} is not a JSON value.`);
}

/** Canonical JSON. Object keys are sorted. `undefined` becomes an error, not a dropped field. */
export function encodeJson(value: unknown): string {
  return JSON.stringify(normalize(value, "$"));
}

export function decodeJson(encoded: string): JsonValue {
  let parsed: unknown;
  try {
    parsed = JSON.parse(encoded);
  } catch (cause) {
    throw new LarkxError({
      code: "storage_failure",
      message: "Stored JSON could not be parsed.",
      retryable: false,
      cause,
    });
  }
  return normalize(parsed, "$");
}

export function encodePayload(value: unknown): JsonObject {
  const json = normalize(value, "$");
  if (!isJsonObject(json)) {
    throw jsonError("Event payload must be a JSON object.");
  }
  return json;
}
