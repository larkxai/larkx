import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { RemoteA2aCall, RemoteHttpResponse } from "@larkxai/host";
import { createRuntime, remoteAgent, scriptedModel, sqlite } from "@larkxai/node";
import { describe, expect, it } from "vitest";

describe("A2A authentication", () => {
  it("blocks for host-managed credentials and does not store provideInput text", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-a2a-auth-"));
    const database = join(directory, "agent.db");
    const endpoint = "http://127.0.0.1:8794";
    const actions: string[] = [];
    const runtime = await createRuntime({
      storage: sqlite(database),
      ownerId: "field-assistant",
      leaseMs: 0,
    });
    let sawAuth = false;
    runtime.observe((event) => {
      if (event.type === "remote-auth-required") {
        sawAuth = true;
      }
    });
    const agent = runtime.createAgent({
      name: "field-assistant",
      version: 1,
      model: scriptedModel([
        {
          message: null,
          finish: "tool_calls",
          calls: [
            {
              id: "remote-1",
              name: "procurement-agent",
              arguments: { objective: "Find a seal" },
            },
          ],
        },
        { message: "Saved the simulated supplier recommendation.", finish: "stop", calls: [] },
      ]),
      instructions: "Inspect equipment.",
      remoteAgents: [
        remoteAgent({
          name: "procurement-agent",
          description: "Find compatible replacement parts.",
          transport: {
            type: "a2a",
            endpoint,
            headers: () => ({ authorization: "Bearer host-managed" }),
            async execute(request) {
              return responseFor(actions, request);
            },
          },
        }),
      ],
    });
    const run = await agent.start({ message: "Inspect pump P-104." });
    const pending = run.result();
    const started = Date.now();
    while (!sawAuth && Date.now() - started < 5_000) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(sawAuth).toBe(true);
    await expect(run.provideInput("secret-token")).rejects.toThrow(/authorization headers/);
    expect(readFileSync(database).includes(Buffer.from("secret-token"))).toBe(false);
    await reconcileWhenReady(run);
    const result = await pending;
    expect(result.message).toContain("simulated supplier");
    expect(actions).toEqual(["submit", "poll"]);
    const delegation = (await run.getDelegations())[0];
    expect(delegation?.state).toBe("COMPLETED");
    expect(delegation?.taskId).toBe("task-auth");
    expect(delegation?.remoteStatus).toBe("TASK_STATE_COMPLETED");
    expect(readFileSync(database).includes(Buffer.from("secret-token"))).toBe(false);
    await runtime.close();
  });
});

function responseFor(actions: string[], request: RemoteA2aCall): RemoteHttpResponse {
  actions.push(request.action);
  const sent = JSON.parse(request.body ?? "{}") as { readonly id?: unknown };
  const id = typeof sent.id === "string" ? sent.id : "";
  const state = request.action === "submit" ? "TASK_STATE_AUTH_REQUIRED" : "TASK_STATE_COMPLETED";
  return {
    status: 200,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      result: {
        task: {
          id: "task-auth",
          contextId: "ctx-auth",
          status: {
            state,
            ...(state === "TASK_STATE_AUTH_REQUIRED"
              ? {
                  message: {
                    messageId: "status",
                    role: "ROLE_AGENT",
                    parts: [{ text: "Sign in to the supplier." }],
                  },
                }
              : {}),
          },
          ...(state === "TASK_STATE_COMPLETED"
            ? { artifacts: [{ artifactId: "a", parts: [{ text: "Simulated supplier" }] }] }
            : {}),
        },
      },
    }),
  };
}

async function reconcileWhenReady(run: {
  reconcile(input: { resolution: "retry"; message: string }): Promise<void>;
}): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    try {
      await run.reconcile({
        resolution: "retry",
        message: "Host refreshed authorization headers.",
      });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("not waiting")) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error("The run did not wait for reconciliation.");
}
