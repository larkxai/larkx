import { AgentEvent, DefaultRequestHandler, InMemoryTaskStore } from "@a2a-js/sdk/server";
import type { AgentExecutor, ExecutionEventBus, RequestContext } from "@a2a-js/sdk/server";
import { agentCardHandler, jsonRpcHandler, UserBuilder } from "@a2a-js/sdk/server/express";
import { Role, TaskState, type AgentCard, type Part } from "@a2a-js/sdk";
import express from "express";

import { armProcurementHold, releaseProcurementHold, runProcurement } from "./graph.js";

/**
 * LangGraph procurement agent exposed with the official A2A JavaScript server.
 * LarkX does not own this process. Task state is the SDK's in-memory task store.
 * CancelTask aborts the signal passed into the graph. A cancelled task is not
 * later published as completed. A node that ignores the signal can finish its step.
 *
 * TypeScript `langgraph dev` does not expose `/a2a/{assistant_id}`.
 * Python `langgraph dev` and LangSmith Agent Server do. This process is the
 * local TypeScript path: the graph is LangGraph, and the endpoint is A2A 1.0
 * JSON-RPC from `@a2a-js/sdk`.
 */

const port = Number(process.env.PORT ?? "8791");
const publicUrl = process.env.PUBLIC_URL ?? `http://127.0.0.1:${String(port)}`;
const executions: { taskId: string; graph: "langgraph" }[] = [];
let phase: "idle" | "holding" | "running" | "input" | "completed" | "canceled" = "idle";
const holdEnabled = process.env.LARKX_LANGGRAPH_HOLD === "1";
if (holdEnabled) {
  armProcurementHold(() => {
    phase = "holding";
  });
}
const controllers = new Map<string, AbortController>();
const contexts = new Map<string, string>();
const settled = new Set<string>();

const agentCard: AgentCard = {
  name: "procurement-agent",
  description: "Find compatible replacement parts in a simulated supplier catalog.",
  version: "1.0.0",
  supportedInterfaces: [
    {
      url: publicUrl,
      protocolBinding: "JSONRPC",
      protocolVersion: "1.0",
      tenant: "",
    },
  ],
  provider: undefined,
  capabilities: {
    streaming: false,
    pushNotifications: false,
    extensions: [],
    extendedAgentCard: false,
  },
  securitySchemes: {},
  securityRequirements: [],
  defaultInputModes: ["text/plain"],
  defaultOutputModes: ["text/plain"],
  skills: [
    {
      id: "supplier-search",
      name: "Supplier search",
      description: "Search the simulated catalog. Data is fictional.",
      tags: ["procurement"],
      examples: ["Find a mechanical seal for model P-104"],
      inputModes: ["text/plain"],
      outputModes: ["text/plain"],
      securityRequirements: [],
    },
  ],
  signatures: [],
};

const executor: AgentExecutor = {
  async execute(context: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const text = context.userMessage.parts
      .map(partText)
      .filter((part) => part.length > 0)
      .join("\n");
    const controller = new AbortController();
    controllers.set(context.taskId, controller);
    contexts.set(context.taskId, context.contextId);
    executions.push({ taskId: context.taskId, graph: "langgraph" });
    phase = "running";
    eventBus.publish(
      AgentEvent.task({
        id: context.taskId,
        contextId: context.contextId,
        status: status(TaskState.TASK_STATE_WORKING),
        artifacts: [],
        history: [],
        metadata: undefined,
      }),
    );
    try {
      if (controller.signal.aborted) {
        publishTerminal(context.taskId, eventBus, TaskState.TASK_STATE_CANCELED, context);
        return;
      }
      const result = await runProcurement(text, controller.signal);
      if (controller.signal.aborted || settled.has(context.taskId)) {
        publishTerminal(context.taskId, eventBus, TaskState.TASK_STATE_CANCELED, context);
        return;
      }
      if (result.needsInput) {
        if (settled.has(context.taskId) || controller.signal.aborted) {
          publishTerminal(context.taskId, eventBus, TaskState.TASK_STATE_CANCELED, context);
          return;
        }
        eventBus.publish(
          AgentEvent.statusUpdate({
            taskId: context.taskId,
            contextId: context.contextId,
            status: status(TaskState.TASK_STATE_INPUT_REQUIRED, result.answer, context),
            metadata: undefined,
          }),
        );
        phase = "input";
        return;
      }
      if (!claim(context.taskId)) {
        return;
      }
      eventBus.publish(
        AgentEvent.artifactUpdate({
          taskId: context.taskId,
          contextId: context.contextId,
          append: false,
          lastChunk: true,
          metadata: undefined,
          artifact: {
            artifactId: `${context.taskId}:result`,
            name: "supplier-recommendation",
            description: "Simulated catalog recommendation.",
            parts: [textPart(result.answer)],
            metadata: undefined,
            extensions: [],
          },
        }),
      );
      eventBus.publish(
        AgentEvent.statusUpdate({
          taskId: context.taskId,
          contextId: context.contextId,
          status: status(TaskState.TASK_STATE_COMPLETED, result.answer, context),
          metadata: undefined,
        }),
      );
      phase = "completed";
    } catch (error) {
      if (controller.signal.aborted || settled.has(context.taskId)) {
        publishTerminal(context.taskId, eventBus, TaskState.TASK_STATE_CANCELED, context);
        return;
      }
      throw error;
    } finally {
      controllers.delete(context.taskId);
      eventBus.finished();
    }
  },
  async cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void> {
    controllers.get(taskId)?.abort();
    publishTerminal(taskId, eventBus, TaskState.TASK_STATE_CANCELED);
    eventBus.finished();
  },
};

const handler = new DefaultRequestHandler(agentCard, new InMemoryTaskStore(), executor);
const app = express();
app.use(express.json());
app.get("/_inspection", (_request, response) => {
  response.json({
    engine: "langgraph",
    protocol: "1.0",
    simulatedCatalog: true,
    taskStore: "InMemoryTaskStore",
    phase,
    executions,
  });
});
app.post("/_release", (_request, response) => {
  releaseProcurementHold();
  response.json({ released: true });
});
app.use(
  "/.well-known/agent-card.json",
  agentCardHandler({ agentCardProvider: async () => agentCard }),
);
app.use(jsonRpcHandler({ requestHandler: handler, userBuilder: UserBuilder.noAuthentication }));

app.listen(port, "0.0.0.0", () => {
  process.stdout.write(
    `${JSON.stringify({ ready: true, port, url: publicUrl, engine: "langgraph" })}\n`,
  );
});

function claim(taskId: string): boolean {
  if (settled.has(taskId)) {
    return false;
  }
  settled.add(taskId);
  return true;
}

function publishTerminal(
  taskId: string,
  eventBus: ExecutionEventBus,
  state: TaskState,
  context?: RequestContext,
): void {
  if (!claim(taskId)) {
    return;
  }
  if (state === TaskState.TASK_STATE_CANCELED) {
    phase = "canceled";
  }
  eventBus.publish(
    AgentEvent.statusUpdate({
      taskId,
      contextId: context?.contextId ?? contexts.get(taskId) ?? taskId,
      status: status(state),
      metadata: undefined,
    }),
  );
}

function textPart(text: string): Part {
  return {
    content: { $case: "text", value: text },
    metadata: undefined,
    filename: "",
    mediaType: "text/plain",
  };
}

function partText(part: Part): string {
  return part.content?.$case === "text" ? part.content.value : "";
}

function status(state: TaskState, text?: string, context?: RequestContext) {
  return {
    state,
    timestamp: new Date().toISOString(),
    message:
      text === undefined || context === undefined
        ? undefined
        : {
            messageId: `${context.taskId}:${state}`,
            contextId: context.contextId,
            taskId: context.taskId,
            role: Role.ROLE_AGENT,
            parts: [textPart(text)],
            metadata: undefined,
            extensions: [],
            referenceTaskIds: [],
          },
  };
}
