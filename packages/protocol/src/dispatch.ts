import {
  validateHandlerName,
  validateRunId,
  validateStepKey,
  validateWorkflowName,
  validateWorkflowVersion,
} from "./ids.js";
import type { JsonValue } from "./payload.js";
import { PROTOCOL_VERSION } from "./version.js";
import type { DataPolicy } from "./effects.js";
import { isDataPolicy } from "./effects.js";

/**
 * Earlier remote-dispatch shapes. The HTTP task protocol used by remote
 * delegation is documented in docs/architecture/remote-delegation.md and is
 * not this type. These fields are not the request the host sends.
 */
export interface RemoteDispatchRequest {
  readonly protocolVersion: number;
  readonly tenantId: string;
  readonly appId: string;
  readonly runId: string;
  readonly workflowName: string;
  readonly workflowVersion: number;
  readonly stepKey: string;
  readonly operationId: string;
  readonly handler: string;
  readonly handlerVersion: number;
  readonly attempt: number;
  readonly input: JsonValue;
  readonly dataPolicy: DataPolicy;
}

export interface RemoteDispatchAcceptance {
  readonly protocolVersion: number;
  readonly operationId: string;
  readonly accepted: true;
  readonly deduplicated: boolean;
}

export interface RemoteTaskResult {
  readonly protocolVersion: number;
  readonly operationId: string;
  readonly status: "completed" | "failed" | "unknown";
  readonly output?: JsonValue;
  readonly errorCode?: string;
}

export interface DispatchValidation {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

function identityError(value: string, label: string): string | undefined {
  if (value.length === 0 || value.length > 200) {
    return `${label} must be 1-200 characters.`;
  }
  return undefined;
}

export function validateRemoteDispatchRequest(request: RemoteDispatchRequest): DispatchValidation {
  const errors: string[] = [];
  const push = (message: string | undefined): void => {
    if (message !== undefined) {
      errors.push(message);
    }
  };
  if (request.protocolVersion !== PROTOCOL_VERSION) {
    errors.push(`protocolVersion must be ${String(PROTOCOL_VERSION)}.`);
  }
  push(identityError(request.tenantId, "tenantId"));
  push(identityError(request.appId, "appId"));
  push(validateRunId(request.runId));
  push(validateWorkflowName(request.workflowName));
  push(validateWorkflowVersion(request.workflowVersion));
  push(validateStepKey(request.stepKey));
  push(identityError(request.operationId, "operationId"));
  push(validateHandlerName(request.handler));
  push(validateWorkflowVersion(request.handlerVersion));
  if (!Number.isInteger(request.attempt) || request.attempt < 1) {
    errors.push("attempt must be an integer greater than or equal to 1.");
  }
  if (!isDataPolicy(request.dataPolicy)) {
    errors.push("dataPolicy is invalid.");
  }
  if (request.dataPolicy === "device-only") {
    errors.push("device-only data policy forbids remote dispatch.");
  }
  return { ok: errors.length === 0, errors };
}
