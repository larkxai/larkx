import {
  A2A_PROTOCOL_VERSION,
  A2A_REMOTE_CAPABILITIES,
  performA2aDelegation,
  remoteAgent,
} from "@larkxai/host";
import { describe, expect, it } from "vitest";

import type { RemoteA2aCall, RemoteHttpResponse } from "@larkxai/host";

const endpoint = "http://127.0.0.1:8790";

describe("A2A 1.0 client", () => {
  it("accepts only protocol 1.0 and does not claim dedupe or lookup", () => {
    expect(A2A_PROTOCOL_VERSION).toBe("1.0");
    expect(A2A_REMOTE_CAPABILITIES).toMatchObject({
      dedupe: false,
      lookup: false,
      taskId: true,
      poll: true,
      cancel: true,
      persistent: true,
    });
    expect(() =>
      remoteAgent({
        name: "procurement-agent",
        description: "Find parts.",
        transport: { type: "a2a", endpoint, protocolVersion: "0.3" as "1.0" },
      }),
    ).toThrow(/1\.0/);
  });

  it("validates an agent card and refuses a different endpoint or version", async () => {
    const calls: RemoteA2aCall[] = [];
    const discovered = await perform(
      calls,
      { action: "submit" },
      [cardResponse(endpoint), taskResponse("TASK_STATE_SUBMITTED", "task-1", "ctx-1")],
      true,
      true,
    );
    expect(discovered.remoteIdentity).toBe("procurement-agent");
    expect(discovered.outcome).toBe("accepted");
    expect(calls[0]?.url).toBe(`${endpoint}/.well-known/agent-card.json`);
    expect(calls[1]?.method).toBe("POST");
    expect(JSON.parse(calls[1]?.body ?? "{}").method).toBe("SendMessage");
    expect(calls[1]?.body).not.toContain("Idempotency-Key");

    const wrongVersion = await perform(
      [],
      { action: "submit" },
      [cardResponse(endpoint, "0.3")],
      true,
      true,
    );
    expect(wrongVersion.outcome).toBe("unauthorized");
    const wrongUrl = await perform(
      [],
      { action: "submit" },
      [cardResponse("https://other.example")],
      true,
      true,
    );
    expect(wrongUrl.outcome).toBe("unauthorized");
    const required = await perform(
      [],
      { action: "submit" },
      [cardResponse(endpoint, "1.0", true)],
      true,
      true,
    );
    expect(required.outcome).toBe("permanent");
    const invalid = await perform(
      [],
      { action: "submit" },
      [{ status: 200, body: "{" }],
      true,
      true,
    );
    expect(invalid.outcome).toBe("permanent");
  });

  it("maps messages, tasks, failures, and unsupported states", async () => {
    const message = await perform([], { action: "submit" }, [
      {
        status: 200,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "op",
          result: { message: { messageId: "m-1", role: "ROLE_AGENT", parts: [{ text: "done" }] } },
        }),
      },
    ]);
    expect(message).toMatchObject({ outcome: "completed", remoteStatus: "MESSAGE" });

    const working = await perform([], { action: "poll", taskId: "task-1" }, [
      taskResponse("TASK_STATE_WORKING", "task-1", "ctx-1"),
    ]);
    expect(working.outcome).toBe("working");
    const completed = await perform([], { action: "poll", taskId: "task-1" }, [
      taskResponse("TASK_STATE_COMPLETED", "task-1", "ctx-1", "Simulated supplier"),
    ]);
    expect(completed.outcome).toBe("completed");
    expect(JSON.stringify(completed.result)).toContain("Simulated supplier");
    const failed = await perform([], { action: "poll", taskId: "task-1" }, [
      taskResponse("TASK_STATE_FAILED", "task-1", "ctx-1", "nope"),
    ]);
    expect(failed.outcome).toBe("failed");
    const rejected = await perform([], { action: "poll", taskId: "task-1" }, [
      taskResponse("TASK_STATE_REJECTED", "task-1", "ctx-1"),
    ]);
    expect(rejected.outcome).toBe("failed");
    const canceled = await perform([], { action: "cancel", taskId: "task-1" }, [
      taskResponse("TASK_STATE_CANCELED", "task-1", "ctx-1"),
    ]);
    expect(canceled.outcome).toBe("cancelled");
    const input = await perform([], { action: "poll", taskId: "task-1" }, [
      taskResponse("TASK_STATE_INPUT_REQUIRED", "task-1", "ctx-1", "Need the model."),
    ]);
    expect(input).toMatchObject({
      outcome: "input_required",
      contextId: "ctx-1",
      message: "Need the model.",
    });
    const auth = await perform([], { action: "poll", taskId: "task-1" }, [
      taskResponse("TASK_STATE_AUTH_REQUIRED", "task-1", "ctx-1"),
    ]);
    expect(auth.outcome).toBe("input_required");
    const unknown = await perform([], { action: "poll", taskId: "task-1" }, [
      taskResponse("TASK_STATE_UNSPECIFIED", "task-1", "ctx-1"),
    ]);
    expect(unknown.outcome).toBe("temporary");
    const missing = await perform([], { action: "poll", taskId: "task-1" }, [
      { status: 200, body: JSON.stringify({ jsonrpc: "2.0", id: "op", result: {} }) },
    ]);
    expect(missing.outcome).toBe("invalid");
    const version = await perform([], { action: "submit" }, [
      {
        status: 200,
        body: JSON.stringify({ jsonrpc: "2.0", id: "op", error: { code: -32009, message: "no" } }),
      },
    ]);
    expect(version.outcome).toBe("permanent");
    const unsupported = await perform([], { action: "cancel", taskId: "task-1" }, [
      {
        status: 200,
        body: JSON.stringify({ jsonrpc: "2.0", id: "op", error: { code: -32004, message: "no" } }),
      },
    ]);
    expect(unsupported.outcome).toBe("unsupported");
  });

  it("does not follow redirects and does not send a continuation without a task", async () => {
    const redirect = await perform([], { action: "submit" }, [{ status: 302, body: "" }]);
    expect(redirect.outcome).toBe("temporary");
    const offline = await perform([], { action: "submit" }, [], false);
    expect(offline.outcome).toBe("offline");
    const continuation = await perform(
      [],
      { action: "continue", taskId: "task-1", contextId: "ctx-1", continuation: "Model P-104" },
      [taskResponse("TASK_STATE_WORKING", "task-1", "ctx-1")],
    );
    expect(continuation.outcome).toBe("working");
    const missingTask = await perform([], { action: "continue", continuation: "Model P-104" }, []);
    expect(missingTask.outcome).toBe("invalid");
    const huge = "x".repeat(70_000);
    const oversized = await perform([], { action: "poll", taskId: "task-1" }, [
      taskResponse("TASK_STATE_COMPLETED", "task-1", "ctx-1", huge),
    ]);
    expect(oversized.outcome).toBe("invalid");
  });
});

function cardResponse(url: string, version = "1.0", requiredExtension = false): RemoteHttpResponse {
  return {
    status: 200,
    body: JSON.stringify({
      name: "procurement-agent",
      description: "Find parts.",
      version: "1.0.0",
      supportedInterfaces: [{ url, protocolBinding: "JSONRPC", protocolVersion: version }],
      capabilities: {
        extensions: requiredExtension ? [{ uri: "example:ext", required: true }] : [],
      },
      skills: [],
    }),
  };
}

function taskResponse(
  state: string,
  taskId: string,
  contextId: string,
  text?: string,
): RemoteHttpResponse {
  return {
    status: 200,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "op",
      result: {
        task: {
          id: taskId,
          contextId,
          status: {
            state,
            ...(text === undefined
              ? {}
              : { message: { messageId: "status", role: "ROLE_AGENT", parts: [{ text }] } }),
          },
          ...(state === "TASK_STATE_COMPLETED"
            ? { artifacts: [{ artifactId: "a", parts: [{ text: text ?? "" }] }] }
            : {}),
        },
      },
    }),
  };
}

async function perform(
  calls: RemoteA2aCall[],
  command: {
    readonly action: string;
    readonly taskId?: string;
    readonly contextId?: string;
    readonly continuation?: string;
  },
  responses: readonly RemoteHttpResponse[],
  online = true,
  discover = false,
) {
  let index = 0;
  return performA2aDelegation({
    command: {
      action: command.action,
      endpoint,
      input: { objective: "Find a seal" },
      operationId: "op-1",
      pollIntervalMs: 50,
      remoteAgent: "procurement-agent",
      transport: "a2a",
      transportId: `a2a:${endpoint}`,
      ...(command.taskId !== undefined ? { taskId: command.taskId } : {}),
      ...(command.contextId !== undefined ? { contextId: command.contextId } : {}),
      ...(command.continuation !== undefined ? { continuation: command.continuation } : {}),
    },
    transport: {
      type: "a2a",
      endpoint,
      discover,
      async execute(request) {
        calls.push(request);
        const response = responses[index];
        index += 1;
        if (response === undefined) {
          throw new Error("No fixture response.");
        }
        return response;
      },
    },
    signal: new AbortController().signal,
    online: () => online,
  });
}
