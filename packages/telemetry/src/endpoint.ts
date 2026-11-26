/**
 * Same shape rules as remote delegation: http or https, no userinfo, no query,
 * no fragment, no ASCII whitespace, at most 200 characters. A trailing slash is
 * removed only when the path is empty.
 *
 * HTTPS is the production scheme. HTTP is accepted only because the caller
 * passed it explicitly, for a development collector. The default Cloud origin
 * is HTTPS and is not rewritten to HTTP.
 */
export function normalizeTelemetryEndpoint(endpoint: string): string {
  let value = trimEndpoint(endpoint);
  if (!value.startsWith("https://") && !value.startsWith("http://")) {
    throw new Error("Telemetry endpoint must be an http or https URL.");
  }
  if (hasForbiddenCharacter(value)) {
    throw new Error("Telemetry endpoint cannot include whitespace, a query, or a fragment.");
  }
  const rest = value.slice(value.indexOf("://") + 3);
  if (rest.length === 0 || rest.includes("@") || rest.includes("\\")) {
    throw new Error("Telemetry endpoint cannot include URL credentials.");
  }
  const slash = rest.indexOf("/");
  const host = slash === -1 ? rest : rest.slice(0, slash);
  if (host.length === 0 || host.startsWith(":") || host.includes(" ")) {
    throw new Error("Telemetry endpoint is missing a host.");
  }
  if (slash !== -1 && slash + 1 === rest.length) {
    value = value.slice(0, -1);
  }
  if (value.length > 200) {
    throw new Error("Telemetry endpoint is too long.");
  }
  return value;
}

export function telemetryBatchUrl(endpoint: string): string {
  return `${normalizeTelemetryEndpoint(endpoint)}/v1/telemetry/batches`;
}

/**
 * A redirect response, an opaque redirect, or a final URL that is not the
 * authorized batch URL. The body is not an acknowledgement.
 */
export function telemetryResponseDisposition(input: {
  readonly requestedUrl: string;
  readonly status: number;
  readonly url?: string;
  readonly type?: string;
}): "redirect" | "response" {
  if (input.type === "opaqueredirect") {
    return "redirect";
  }
  if (input.status >= 300 && input.status < 400) {
    return "redirect";
  }
  if (
    typeof input.url === "string" &&
    input.url.length > 0 &&
    !sameUrl(input.url, input.requestedUrl)
  ) {
    return "redirect";
  }
  return "response";
}

export async function readTelemetryResponse(
  response: {
    readonly status: number;
    readonly url?: string;
    readonly type?: string;
    text(): Promise<string>;
  },
  requestedUrl: string,
): Promise<{ readonly status: number; text(): Promise<string> }> {
  if (
    telemetryResponseDisposition({
      requestedUrl,
      status: response.status,
      ...(response.url === undefined ? {} : { url: response.url }),
      ...(response.type === undefined ? {} : { type: response.type }),
    }) === "redirect"
  ) {
    return {
      status: 302,
      async text() {
        return "";
      },
    };
  }
  return { status: response.status, text: () => response.text() };
}

function sameUrl(left: string, right: string): boolean {
  return left.replace(/\/+$/, "") === right.replace(/\/+$/, "");
}

function hasForbiddenCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (
      code === 0x09 ||
      code === 0x0a ||
      code === 0x0b ||
      code === 0x0c ||
      code === 0x0d ||
      code === 0x20 ||
      code === 0x23 ||
      code === 0x3f
    ) {
      return true;
    }
  }
  return false;
}

function trimEndpoint(value: string): string {
  let begin = 0;
  let end = value.length;
  const trimmable = (code: number): boolean =>
    code === 0x09 || code === 0x0a || code === 0x0d || code === 0x20;
  while (begin < end && trimmable(value.charCodeAt(begin))) {
    begin += 1;
  }
  while (end > begin && trimmable(value.charCodeAt(end - 1))) {
    end -= 1;
  }
  return value.slice(begin, end);
}
