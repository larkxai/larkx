import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import type { CactusModel } from "@larkxai/react-native/cactus";
import {
  applicationDatabase,
  createRuntime,
  remoteAgent,
  sqlite,
  type HostEvent,
  type ModelRequest,
  type ReconcileInput,
  type Agent,
  type Run,
  type RunStatus,
  type Runtime,
  type RuntimeDiagnostics,
} from "@larkxai/react-native";

import {
  AGENT_VERSION,
  agentNameForMode,
  recoveryMismatch,
  type FieldMode,
} from "./agent-identity";
import { FAILURE_BOUNDARIES, FailureGate, type FailureBoundary } from "./failure-gate";
import { fieldTools, storedFieldEffect } from "./field-tools";
import { scriptedInspectionResponse } from "./scripted-inspection";

const SDK_VERSION = "0.1.2";

const DATABASE = applicationDatabase("larkx-field.db");
const INSTRUCTIONS = [
  "You are a field inspector working offline on this device.",
  "Read the local inspection notes, look up the equipment specification, and decide whether maintenance is needed.",
  "Save one inspection report with the tool save_inspection_report.",
  "Call record_part_replacement only when a physical part must be issued. Do not repeat a tool call that already succeeded.",
].join(" ");

type Mode = FieldMode;

export function FieldInspection() {
  const runtimeRef = useRef<Runtime | null>(null);
  const runRef = useRef<Run | null>(null);
  const gateRef = useRef(new FailureGate());
  const registeredMode = useRef<Mode | null>(null);
  const agentRef = useRef<Agent | null>(null);
  const cactusRef = useRef<CactusModel | null>(null);
  const [lines, setLines] = useState<readonly string[]>(["Native runtime is not open."]);
  const [message, setMessage] = useState("Inspect pump 12 and prepare a report.");
  const [mode, setMode] = useState<Mode>("scripted");
  const [modelStatus, setModelStatus] = useState("Scripted model. No download.");
  const [runs, setRuns] = useState<readonly RunStatus[]>([]);
  const [boundary, setBoundary] = useState<FailureBoundary | null>(null);
  const [held, setHeld] = useState<FailureBoundary | null>(null);
  const [busy, setBusy] = useState(false);
  const [endpoint, setEndpoint] = useState("");
  const [transport, setTransport] = useState<"http" | "a2a">("http");
  const [remoteInput, setRemoteInput] = useState("");
  const [online, setOnline] = useState(true);
  const onlineRef = useRef(true);
  const endpointRef = useRef("");
  const transportRef = useRef<"http" | "a2a">("http");
  const registeredEndpoint = useRef("");
  const registeredTransport = useRef<"http" | "a2a">("http");

  useEffect(() => {
    let active = true;
    void open()
      .then((runtime) => {
        if (!active) {
          void runtime.close();
          return;
        }
        runtimeRef.current = runtime;
        return refresh(runtime);
      })
      .catch((error: unknown) => {
        if (active) {
          setLines([textOf(error)]);
        }
      });
    return () => {
      active = false;
      void runtimeRef.current?.close();
      runtimeRef.current = null;
      const model = cactusRef.current;
      cactusRef.current = null;
      if (model !== null) {
        void model.destroy().catch(() => undefined);
      }
    };
  }, []);

  async function open(): Promise<Runtime> {
    registeredMode.current = null;
    agentRef.current = null;
    const started = Date.now();
    const runtime = await createRuntime({
      storage: sqlite(DATABASE),
      isOnline: () => onlineRef.current,
    });
    push(`Runtime opened in ${String(Date.now() - started)} ms.`);
    runtime.observe((event) => {
      push(formatEvent(event));
    });
    runtime.holdExecution(async (event) => {
      const boundaryForEvent = boundaryOf(event.type);
      if (boundaryForEvent !== null) {
        await gateRef.current.reach(boundaryForEvent);
        setHeld(gateRef.current.heldBoundary());
      }
    });
    return runtime;
  }

  async function refresh(runtime: Runtime): Promise<void> {
    const listed = await runtime.listRuns();
    setRuns(listed);
    push(
      listed.length === 0
        ? "No persisted runs."
        : `Persisted runs: ${listed.map((run) => `${run.runId} ${run.status}`).join(", ")}`,
    );
  }

  function push(line: string): void {
    setLines((current) => [...current, line].slice(-24));
  }

  async function prepareModel(): Promise<void> {
    if (mode === "scripted") {
      setModelStatus("Scripted model. No download. Tool calls are predetermined for this mode.");
      return;
    }
    setBusy(true);
    try {
      // Load Cactus after Nitro has installed its JSI runtime.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { cactusModel } = require("@larkxai/react-native/cactus") as {
        cactusModel(options?: { readonly model?: string }): CactusModel;
      };
      const previous = cactusRef.current;
      cactusRef.current = null;
      if (previous !== null) {
        await previous.destroy();
      }
      const model = cactusModel({ model: "qwen3-0.6b" });
      cactusRef.current = model;
      setModelStatus(`Downloading ${model.getModelName()}…`);
      const started = Date.now();
      await model.download({
        onProgress(progress: number) {
          setModelStatus(
            `Downloading ${model.getModelName()}: ${String(Math.round(progress * 100))}%.`,
          );
        },
      });
      await model.init();
      setModelStatus(
        `Ready ${model.getModelName()} in ${String(Date.now() - started)} ms. Tool calling and cancellation are supported. Structured output is not. Inference stays on device.`,
      );
    } catch (error) {
      setModelStatus(textOf(error));
    } finally {
      setBusy(false);
    }
  }

  async function startAgent(): Promise<void> {
    const runtime = runtimeRef.current;
    if (runtime === null) {
      return;
    }
    setBusy(true);
    gateRef.current.arm(boundary);
    try {
      const agent = await ensureAgent(runtime);
      const run = await agent.start({ message });
      runRef.current = run;
      push(`Started ${run.runId}. Execution is scheduled. result() is waiting.`);
      const result = await run.result();
      push(`Result: ${result.message}`);
      push(await formatRun(runtime, run));
      await refresh(runtime);
    } catch (error) {
      push(textOf(error));
    } finally {
      setHeld(gateRef.current.heldBoundary());
      setBusy(false);
    }
  }

  async function control(action: "pause" | "resume" | "cancel"): Promise<void> {
    const run = runRef.current;
    if (run === null) {
      return;
    }
    if (action === "pause") {
      await run.pause();
    } else if (action === "resume") {
      await run.resume();
    } else {
      await run.cancel();
    }
    push(`${action} ${run.runId}`);
  }

  async function ensureAgent(runtime: Runtime): Promise<Agent> {
    const existing = agentRef.current;
    const remoteEndpoint = endpointRef.current.trim();
    if (existing !== null) {
      if (registeredMode.current !== mode) {
        throw new Error("Relaunch the app before switching between scripted and local mode.");
      }
      if (
        registeredEndpoint.current !== remoteEndpoint ||
        registeredTransport.current !== transportRef.current
      ) {
        throw new Error("Relaunch the app before changing the remote endpoint or transport.");
      }
      return existing;
    }
    const model =
      mode === "scripted"
        ? scriptedInspectionModel(gateRef.current, remoteEndpoint.length > 0)
        : localInspectionModel(cactusRef.current, gateRef.current);
    const agent = runtime.createAgent({
      name: agentNameForMode(mode),
      version: AGENT_VERSION,
      model,
      instructions:
        remoteEndpoint.length === 0
          ? INSTRUCTIONS
          : `${INSTRUCTIONS} When a replacement part is required, call procurement-agent with only the objective, equipment, and component. Do not send the inspection notes.`,
      tools: fieldTools(gateRef.current),
      ...(remoteEndpoint.length === 0
        ? {}
        : {
            remoteAgents: [
              remoteAgent({
                name: "procurement-agent",
                description: "Find compatible replacement parts and suppliers.",
                schema: {
                  type: "object",
                  properties: {
                    objective: { type: "string" },
                    equipment: { type: "string" },
                    component: { type: "string" },
                  },
                  required: ["objective", "equipment", "component"],
                  additionalProperties: false,
                },
                transport:
                  transportRef.current === "a2a"
                    ? {
                        type: "a2a",
                        endpoint: remoteEndpoint,
                        pollIntervalMs: 1000,
                      }
                    : {
                        type: "http",
                        endpoint: remoteEndpoint,
                        pollIntervalMs: 1000,
                        capabilities: {
                          dedupe: true,
                          lookup: true,
                          taskId: true,
                          poll: true,
                          cancel: true,
                          persistent: true,
                        },
                      },
              }),
            ],
          }),
    });
    await agent.whenRegistered();
    agentRef.current = agent;
    registeredMode.current = mode;
    registeredEndpoint.current = remoteEndpoint;
    registeredTransport.current = transportRef.current;
    return agent;
  }

  async function reconcile(resolution: ReconcileInput["resolution"]): Promise<void> {
    const run = runRef.current;
    if (run === null) {
      return;
    }
    try {
      await reconcileRun(run, resolution);
    } catch (error) {
      push(textOf(error));
    }
  }

  async function reconcileRun(run: Run, resolution: ReconcileInput["resolution"]): Promise<void> {
    const history = await run.getHistory();
    const unknown = history.steps.find((step) => step.status === "UNKNOWN_OUTCOME");
    const stored = unknown === undefined ? undefined : await storedFieldEffect(unknown.operationId);
    if (resolution === "complete") {
      await run.reconcile({
        resolution,
        output:
          stored === undefined
            ? { applied: false, note: "No local effect row was stored for this operation." }
            : (JSON.parse(stored) as { readonly part?: string }),
        message:
          stored === undefined
            ? "Founder confirmed that no local effect row exists."
            : "Founder confirmed the local effect row.",
      });
      push("Reconciled as completed.");
      return;
    }
    if (resolution === "retry") {
      await run.reconcile({
        resolution,
        message: "Founder explicitly requested another attempt.",
      });
      push("Reconciled as retry. The same operation id will be attempted again.");
      return;
    }
    await run.reconcile({
      resolution: "fail",
      message: "Founder confirmed the external effect did not apply.",
    });
    push("Reconciled as not applied.");
  }

  async function recover(runId: string): Promise<void> {
    const runtime = runtimeRef.current;
    if (runtime === null) {
      return;
    }
    setBusy(true);
    try {
      const listed = await runtime.listRuns();
      const persisted = listed.find((candidate) => candidate.runId === runId);
      if (persisted === undefined) {
        throw new Error(`Run ${runId} is not in the C++ store.`);
      }
      const mismatch = recoveryMismatch(persisted.workflowName, mode);
      if (mismatch !== null) {
        throw new Error(mismatch);
      }
      await ensureAgent(runtime);
      const started = Date.now();
      const run = await runtime.resume(runId);
      runRef.current = run;
      const status = await run.getStatus();
      if (status.status === "BLOCKED") {
        push(
          `Run ${runId} is BLOCKED at epoch ${String(status.ownershipEpoch)}. The open non-idempotent step was not repeated. Reconcile it after checking the local effect row.`,
        );
        setBusy(false);
      }
      const result = await run.result();
      push(`Recovered ${runId} in ${String(Date.now() - started)} ms. ${result.message}`);
      push(await formatRun(runtime, run));
      await refresh(runtime);
    } catch (error) {
      push(textOf(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>Native C++ core</Text>
      <Text style={styles.title}>Field inspection</Text>
      <Text style={styles.body}>
        Scripted mode chooses the next tool from committed results. It is not a local model. Local
        mode asks Cactus which tools to call. Terminate the app while a boundary is held, relaunch,
        and recover the persisted run.
      </Text>
      <Text style={styles.label}>{modelStatus}</Text>
      <View style={styles.row}>
        <Pressable onPress={() => setMode("scripted")} style={styles.action}>
          <Text style={styles.actionText}>Scripted</Text>
        </Pressable>
        <Pressable onPress={() => setMode("local")} style={styles.action}>
          <Text style={styles.actionText}>Local model</Text>
        </Pressable>
        <Pressable disabled={busy} onPress={() => void prepareModel()} style={styles.action}>
          <Text style={styles.actionText}>Prepare model</Text>
        </Pressable>
      </View>
      <TextInput value={message} onChangeText={setMessage} style={styles.input} />
      <Text style={styles.label}>
        Remote procurement endpoint. Leave empty for a local-only run. HTTP keeps the custom task
        transport. A2A speaks protocol 1.0 to an authorized endpoint, such as the LangGraph example.
        On a phone use the computer's LAN address. Do not use localhost. Discovery stays off, so the
        card cannot change this endpoint.
      </Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={(value) => {
          endpointRef.current = value;
          setEndpoint(value);
        }}
        placeholder="http://192.168.1.20:8787"
        placeholderTextColor="#7f9086"
        value={endpoint}
        style={styles.input}
      />
      <View style={styles.row}>
        <Pressable
          onPress={() => {
            transportRef.current = "http";
            setTransport("http");
          }}
          style={styles.action}
        >
          <Text style={styles.actionText}>{transport === "http" ? "HTTP *" : "HTTP"}</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            transportRef.current = "a2a";
            setTransport("a2a");
          }}
          style={styles.action}
        >
          <Text style={styles.actionText}>{transport === "a2a" ? "A2A *" : "A2A"}</Text>
        </Pressable>
      </View>
      <Text style={styles.label}>
        Additional input for an A2A question, such as a model number. This text is stored until it
        is sent. Do not put a password or token here.
      </Text>
      <TextInput
        onChangeText={setRemoteInput}
        placeholder="Model P-104"
        placeholderTextColor="#7f9086"
        value={remoteInput}
        style={styles.input}
      />
      <Pressable
        onPress={() => {
          const run = runRef.current;
          if (run === null) {
            return;
          }
          void run.provideInput(remoteInput).then(
            () => push("Sent additional remote input."),
            (error: unknown) => push(textOf(error)),
          );
        }}
        style={styles.action}
      >
        <Text style={styles.actionText}>Send remote input</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          onlineRef.current = !onlineRef.current;
          setOnline(onlineRef.current);
          push(onlineRef.current ? "Network marked available." : "Network marked unavailable.");
        }}
        style={styles.action}
      >
        <Text style={styles.actionText}>
          {online ? "Network available" : "Waiting for network"}
        </Text>
      </Pressable>
      <View style={styles.row}>
        <Pressable disabled={busy} onPress={() => void startAgent()} style={styles.action}>
          <Text style={styles.actionText}>Start</Text>
        </Pressable>
        <Pressable onPress={() => void control("pause")} style={styles.action}>
          <Text style={styles.actionText}>Pause</Text>
        </Pressable>
        <Pressable onPress={() => void control("resume")} style={styles.action}>
          <Text style={styles.actionText}>Resume</Text>
        </Pressable>
        <Pressable onPress={() => void control("cancel")} style={styles.action}>
          <Text style={styles.actionText}>Cancel</Text>
        </Pressable>
      </View>
      <Text style={styles.label}>Failure boundary{held === null ? "" : ` held: ${held}`}</Text>
      <View style={styles.row}>
        <Pressable onPress={() => setBoundary(null)} style={styles.action}>
          <Text style={styles.actionText}>{boundary === null ? "None *" : "None"}</Text>
        </Pressable>
        {FAILURE_BOUNDARIES.map((item) => (
          <Pressable key={item} onPress={() => setBoundary(item)} style={styles.action}>
            <Text style={styles.actionText}>{boundary === item ? `${item} *` : item}</Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => {
            gateRef.current.release();
            setHeld(null);
          }}
          style={styles.action}
        >
          <Text style={styles.actionText}>Release boundary</Text>
        </Pressable>
      </View>
      <Text style={styles.label}>Persisted runs</Text>
      {runs.map((run) => (
        <Pressable key={run.runId} onPress={() => void recover(run.runId)} style={styles.action}>
          <Text style={styles.actionText}>
            Recover {run.runId} {run.status} epoch {String(run.ownershipEpoch)}
          </Text>
        </Pressable>
      ))}
      <View style={styles.row}>
        <Pressable onPress={() => void reconcile("complete")} style={styles.action}>
          <Text style={styles.actionText}>Reconcile completed</Text>
        </Pressable>
        <Pressable onPress={() => void reconcile("fail")} style={styles.action}>
          <Text style={styles.actionText}>Reconcile not applied</Text>
        </Pressable>
        <Pressable onPress={() => void reconcile("retry")} style={styles.action}>
          <Text style={styles.actionText}>Reconcile retry</Text>
        </Pressable>
      </View>
      {lines.map((line, index) => (
        <Text key={`${String(index)}-${line}`} style={styles.mono}>
          {line}
        </Text>
      ))}
    </View>
  );
}

function scriptedInspectionModel(gate: FailureGate, delegate: boolean) {
  return {
    id: "scripted",
    model: "scripted-field-inspector",
    capabilities: { toolCalling: true },
    async complete(request: ModelRequest) {
      await gate.reach("during-model");
      return scriptedInspectionResponse(request.messages, { delegate });
    },
  };
}

function localInspectionModel(model: CactusModel | null, gate: FailureGate) {
  if (model === null) {
    throw new Error("Prepare the local model before starting or recovering a Cactus run.");
  }
  return {
    ...model,
    async complete(
      request: Parameters<CactusModel["complete"]>[0],
      context: Parameters<CactusModel["complete"]>[1],
    ) {
      await gate.reach("during-model");
      return model.complete(request, context);
    },
  };
}

function boundaryOf(type: HostEvent["type"]): FailureBoundary | null {
  switch (type) {
    case "model-requested":
      return "before-model";
    case "model-committed":
      return "after-model-commit";
    case "tool-requested":
      return "before-tool";
    case "tool-committed":
      return "after-tool-commit";
    case "before-completion":
      return "before-completion";
    default:
      return null;
  }
}

function formatEvent(event: HostEvent): string {
  const attempt = event.attempt === undefined ? "" : ` attempt ${String(event.attempt)}`;
  const operation = event.operationId === undefined ? "" : ` ${event.operationId}`;
  const action = event.action === undefined ? "" : ` ${event.action}`;
  const task = event.taskId === undefined ? "" : ` task ${event.taskId}`;
  const waiting = event.waitingFor === undefined ? "" : ` ${event.waitingFor}`;
  const prompt = event.prompt === undefined ? "" : ` prompt ${event.prompt}`;
  return `${event.type}${action}${waiting}${prompt}${event.stepKey === undefined ? "" : ` ${event.stepKey}`}${operation}${task}${attempt}`;
}

async function formatRun(runtime: Runtime, run: Run): Promise<string> {
  const status = await run.getStatus();
  const history = await run.getHistory();
  const delegations = await run.getDelegations();
  const attempts = history.steps.reduce((sum, step) => sum + step.attemptCount, 0);
  const operations = history.steps
    .map((step) => `${step.executionTarget} ${step.stepKey} ${step.operationId}`)
    .join(", ");
  const remote = delegations
    .map((item) =>
      [
        item.transport,
        item.state,
        `op ${item.operationId}`,
        `task ${item.taskId ?? "none"}`,
        `context ${item.contextId ?? "none"}`,
        `identity ${item.remoteIdentity ?? "none"}`,
        `status ${item.remoteStatus ?? "none"}`,
        item.prompt === null ? "" : `prompt ${item.prompt}`,
        item.cancelIntent ? "cancel" : "",
      ]
        .filter((part) => part.length > 0)
        .join(" "),
    )
    .join(", ");
  const retries = history.steps.filter((step) => step.attemptCount > 1).length;
  return [
    formatDiagnostics(runtime.diagnostics(), runtime.versions),
    `SDK @larkxai/react-native ${SDK_VERSION}`,
    `run ${status.runId}`,
    `agent ${status.workflowName}@${String(status.workflowVersion)}`,
    `status ${status.status}`,
    `epoch ${String(status.ownershipEpoch)}`,
    `attempts ${String(attempts)}`,
    `retried steps ${String(retries)}`,
    operations.length === 0 ? "operation ids: none" : `operation ids: ${operations}`,
    remote.length === 0 ? "delegations: none" : `delegations: ${remote}`,
  ].join(" · ");
}

function formatDiagnostics(diagnostics: RuntimeDiagnostics, versions: Runtime["versions"]): string {
  return [
    "Execution backend: Native C++",
    `ABI ${String(versions.abi)}`,
    `protocol ${String(versions.protocol)}`,
    `schema ${String(versions.schema)}`,
    `init ${String(diagnostics.initializationMs)} ms`,
    `model calls ${String(diagnostics.modelInvocations)} in ${String(diagnostics.modelDurationMs)} ms`,
    `tool calls ${String(diagnostics.toolInvocations)} in ${String(diagnostics.toolDurationMs)} ms`,
    diagnostics.lastTimeToFirstTokenMs === null
      ? "time to first token: not reported"
      : `time to first token ${String(diagnostics.lastTimeToFirstTokenMs)} ms`,
    diagnostics.recoveryMs === null
      ? "recovery: not measured"
      : `recovery attach ${String(diagnostics.recoveryMs)} ms`,
  ].join(" · ");
}

function textOf(error: unknown): string {
  return error instanceof Error ? error.message : "The native runtime stopped.";
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#17211c", borderRadius: 16, padding: 14, gap: 8 },
  kicker: { color: "#7dcea0", fontSize: 13, fontWeight: "700", letterSpacing: 0.4 },
  title: { color: "#f4f7f5", fontSize: 20, fontWeight: "700" },
  body: { color: "#d5e2d8", fontSize: 14, lineHeight: 20 },
  label: { color: "#d5e2d8", fontSize: 13 },
  input: {
    backgroundColor: "#101712",
    borderRadius: 10,
    color: "#f4f7f5",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  action: {
    backgroundColor: "#1d3b2a",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  actionText: { color: "#f4f7f5", fontSize: 12, fontWeight: "600" },
  mono: { color: "#c5d4cb", fontSize: 12, lineHeight: 18 },
});
