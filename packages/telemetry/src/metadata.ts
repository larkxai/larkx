/**
 * Technical fields an installation may report. Each value is included only
 * when the caller actually has it. Permanent hardware identifiers are not
 * fields of this type and are dropped if a caller spreads them in.
 */
export interface InstallationMetadata {
  readonly appName?: string;
  readonly appVersion?: string;
  readonly platform?: string;
  readonly osName?: string;
  readonly osVersion?: string;
  readonly deviceModel?: string;
  readonly sdkVersion?: string;
}

const METADATA_KEYS = [
  "appName",
  "appVersion",
  "platform",
  "osName",
  "osVersion",
  "deviceModel",
  "sdkVersion",
] as const;

const UUID_TEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sanitizeInstallationMetadata(
  input: object | null | undefined,
): InstallationMetadata {
  if (!input) {
    return {};
  }
  const source = input as Record<string, unknown>;
  const result: Partial<Record<(typeof METADATA_KEYS)[number], string>> = {};
  for (const key of METADATA_KEYS) {
    const label = cleanLabel(source[key]);
    if (!label) {
      continue;
    }
    if (key === "deviceModel" && UUID_TEXT.test(label)) {
      continue;
    }
    result[key] = label;
  }
  return result;
}

/**
 * Node installation metadata. `platform` is `node`. Pass `osName` and
 * `osVersion` from `node:os` when the process can read them. This helper does
 * not read a hostname or invent a device model. Omit `osName` or `osVersion`
 * when they are unavailable.
 */
export function nodeInstallationMetadata(
  input: {
    readonly appName?: string | null;
    readonly appVersion?: string | null;
    readonly sdkVersion?: string | null;
    readonly osName?: string | null;
    readonly osVersion?: string | null;
  } = {},
): InstallationMetadata {
  return sanitizeInstallationMetadata({
    appName: input.appName ?? undefined,
    appVersion: input.appVersion ?? undefined,
    sdkVersion: input.sdkVersion ?? undefined,
    platform: "node",
    osName: input.osName ?? undefined,
    osVersion: input.osVersion ?? undefined,
  });
}

/**
 * Metadata a React Native app already read from `Platform` and a model-name
 * API such as `expo-device` `modelName`. Pass the marketing name, not a
 * serial, advertising id, or Android id. An unknown `os` is omitted.
 */
export function reactNativeInstallationMetadata(input: {
  readonly os?: string | null;
  readonly version?: string | number | null;
  readonly modelName?: string | null;
  readonly appName?: string | null;
  readonly appVersion?: string | null;
  readonly sdkVersion?: string | null;
}): InstallationMetadata {
  const os = typeof input.os === "string" ? input.os.trim().toLowerCase() : "";
  const platform = os === "ios" || os === "android" ? os : undefined;
  return sanitizeInstallationMetadata({
    appName: input.appName ?? undefined,
    appVersion: input.appVersion ?? undefined,
    sdkVersion: input.sdkVersion ?? undefined,
    platform,
    osVersion: input.version == null ? undefined : String(input.version),
    deviceModel: input.modelName ?? undefined,
  });
}

function cleanLabel(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return cleanLabel(String(value));
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 80) {
    return null;
  }
  for (let index = 0; index < trimmed.length; index += 1) {
    const code = trimmed.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) {
      return null;
    }
  }
  return trimmed;
}
