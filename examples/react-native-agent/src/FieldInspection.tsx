import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import type { CactusModel } from "@larkxai/react-native/cactus";
import {
  applicationDatabase,
  createRuntime,
  larkxCloud,
  remoteAgent,
  sqlite,
  type Agent,
  type HostEvent,
  type ModelRequest,
  type ReconcileInput,
  type Run,
  type RunStatus,
  type Runtime,
  type RuntimeDiagnostics,
  type TelemetryDeliveryStatus,
} from "@larkxai/react-native";

import {
  AGENT_VERSION,
  agentNameForMode,
  recoveryMismatch,
  type FieldMode,
} from "./agent-identity";
import { INSPECTION_NOTES, PREVIOUS_INSPECTIONS, PUMP } from "./equipment";
import { FAILURE_BOUNDARIES, FailureGate, type FailureBoundary } from "./failure-gate";
import { fieldTools, storedFieldEffect } from "./field-tools";
import { operationLabel, type OperationKind } from "./operation-label";
import { scriptedInspectionResponse } from "./scripted-inspection";
import { loadCloudConfig, saveCloudConfig } from "./secure-config";
import { telemetryPresentation } from "./telemetry-label";

const DATABASE = applicationDatabase("larkx-field.db");
const DEMO_FLUSH_MS = 3_000;
const INSTRUCTIONS = [
  "You are a field inspector working on this device.",
  "Read the local inspection notes, the equipment specification, and previous inspections.",
  "Decide whether a component needs supplier research.",
  "When a replacement part is required and procurement-agent is available, call it with only the objective, equipment, and component.",
  "Do not send the inspection notes or previous inspections.",
  "Save one inspection report with save_inspection_report.",
  "Do not call record_part_replacement in this inspection.",
  "The report is an illustrative recommendation, not verified industrial safety advice.",
].join(" ");

type Mode = FieldMode;
type Screen = "dashboard" | "detail" | "run" | "report" | "settings";
type ModelPhase =
  "scripted" | "not-downloaded" | "downloading" | "initializing" | "ready" | "failed";

interface ShownOperation {
  readonly id: string;
  readonly label: string;
  readonly kind: OperationKind;
}

const INTERRUPTED = new Set(["CREATED", "RUNNING", "WAITING", "RECOVERING", "BLOCKED"]);

export function FieldInspection({ onOpenLab }: { readonly onOpenLab: () => void }) {
  const runtimeRef = useRef<Runtime | null>(null);
  const runRef = useRef<Run | null>(null);
  const gateRef = useRef(new FailureGate());
  const registeredMode = useRef<Mode | null>(null);
  const agentRef = useRef<Agent | null>(null);
  const cactusRef = useRef<CactusModel | null>(null);
  const [lines, setLines] = useState<readonly string[]>([]);
  const [diagnostics, setDiagnostics] = useState("Runtime is not open.");
  const [mode, setMode] = useState<Mode>("scripted");
  const [modelPhase, setModelPhase] = useState<ModelPhase>("scripted");
  const [modelDetail, setModelDetail] = useState(
    "Scripted test mode. Tool calls are predetermined.",
  );
  const [runs, setRuns] = useState<readonly RunStatus[]>([]);
  const [boundary, setBoundary] = useState<FailureBoundary | null>(null);
  const [held, setHeld] = useState<FailureBoundary | null>(null);
  const [busy, setBusy] = useState(false);
  const [endpoint, setEndpoint] = useState("");
  const [transport, setTransport] = useState<"http" | "a2a">("a2a");
  const [remoteInput, setRemoteInput] = useState("");
  const [online, setOnline] = useState(true);
  const [telemetryProject, setTelemetryProject] = useState("");
  const [telemetryKey, setTelemetryKey] = useState("");
  const [telemetryEndpoint, setTelemetryEndpoint] = useState("");
  const [telemetryStatus, setTelemetryStatus] = useState<TelemetryDeliveryStatus | null>(null);
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [operations, setOperations] = useState<readonly ShownOperation[]>([]);
  const [currentLabel, setCurrentLabel] = useState("Waiting to start");
  const [runId, setRunId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [reportText, setReportText] = useState<string | null>(null);
  const [runState, setRunState] = useState("Not started");
  const [developerOpen, setDeveloperOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const onlineRef = useRef(true);
  const telemetryProjectRef = useRef("");
  const telemetryKeyRef = useRef("");
  const telemetryEndpointRef = useRef("");
  const endpointRef = useRef("");
  const transportRef = useRef<"http" | "a2a">("a2a");
  const registeredEndpoint = useRef("");
  const registeredTransport = useRef<"http" | "a2a">("a2a");

  useEffect(() => {
    let active = true;
    void (async () => {
      const saved = await loadCloudConfig().catch(() => null);
      if (!active) {
        return;
      }
      if (saved !== null) {
        applyCloudRefs(saved.projectId, saved.apiKey, saved.endpoint);
      }
      const runtime = await open();
      if (!active) {
        await runtime.close();
        return;
      }
      runtimeRef.current = runtime;
      await refresh(runtime);
    })().catch((error: unknown) => {
      if (active) {
        setNotice(textOf(error));
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

  function applyCloudRefs(projectId: string, apiKey: string, cloudEndpoint: string): void {
    telemetryProjectRef.current = projectId;
    telemetryKeyRef.current = apiKey;
    telemetryEndpointRef.current = cloudEndpoint;
    setTelemetryProject(projectId);
    setTelemetryKey(apiKey);
    setTelemetryEndpoint(cloudEndpoint);
  }

  function noteEvent(event: HostEvent): void {
    setLines((current) => [...current, formatEvent(event)].slice(-24));
    setRunId(event.runId);
    if (event.operationId !== undefined) {
      setOperationId(event.operationId);
    }
    if (event.taskId !== undefined) {
      setTaskId(event.taskId);
    }
    const label = operationLabel(event);
    if (label === null) {
      return;
    }
    setCurrentLabel(label.label);
    setOperations((current) => {
      const last = current[current.length - 1];
      if (last !== undefined && last.label === label.label) {
        return current;
      }
      return [
        ...current,
        {
          id: `${event.type}-${event.stepKey ?? event.toolName ?? "step"}-${String(current.length)}`,
          label: label.label,
          kind: label.kind,
        },
      ].slice(-12);
    });
  }

  async function open(): Promise<Runtime> {
    registeredMode.current = null;
    agentRef.current = null;
    const projectId = telemetryProjectRef.current.trim();
    const apiKey = telemetryKeyRef.current.trim();
    const cloudEndpoint = telemetryEndpointRef.current.trim();
    const runtime = await createRuntime({
      storage: sqlite(DATABASE),
      isOnline: () => onlineRef.current,
      ...(projectId.length > 0 && apiKey.length > 0
        ? {
            telemetry: larkxCloud({
              projectId,
              apiKey,
              flushIntervalMs: DEMO_FLUSH_MS,
              ...(cloudEndpoint.length > 0 ? { endpoint: cloudEndpoint } : {}),
            }),
          }
        : {}),
    });
    setTelemetryStatus(runtime.telemetryStatus());
    runtime.observe((event) => {
      noteEvent(event);
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

  async function reopen(): Promise<void> {
    setBusy(true);
    try {
      const stored = await saveCloudConfig({
        projectId: telemetryProjectRef.current.trim(),
        apiKey: telemetryKeyRef.current.trim(),
        endpoint: telemetryEndpointRef.current.trim(),
      });
      setNotice(
        stored === "stored"
          ? "Cloud settings are in the platform keystore. Earlier runs are not backfilled."
          : "The platform keystore is unavailable. The key stays in memory for this launch only.",
      );
      const current = runtimeRef.current;
      runtimeRef.current = null;
      runRef.current = null;
      await current?.close();
      const runtime = await open();
      runtimeRef.current = runtime;
      await refresh(runtime);
    } catch (error) {
      setNotice(textOf(error));
    } finally {
      setBusy(false);
    }
  }

  async function flushTelemetry(): Promise<void> {
    const runtime = runtimeRef.current;
    if (runtime === null) {
      return;
    }
    const status = await runtime.flushTelemetry();
    setTelemetryStatus(status);
  }

  async function refresh(runtime: Runtime): Promise<void> {
    const listed = await runtime.listRuns();
    setRuns(listed);
    setTelemetryStatus(runtime.telemetryStatus());
  }

  async function prepareModel(): Promise<void> {
    if (mode === "scripted") {
      setModelPhase("scripted");
      setModelDetail(
        "Scripted test mode. Tool calls are predetermined. This is not on-device inference.",
      );
      return;
    }
    setBusy(true);
    setModelPhase("downloading");
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
      setModelDetail(`Downloading ${model.getModelName()}.`);
      await model.download({
        onProgress(progress: number) {
          setModelPhase("downloading");
          setModelDetail(
            `Downloading ${model.getModelName()}: ${String(Math.round(progress * 100))}%.`,
          );
        },
      });
      setModelPhase("initializing");
      setModelDetail(`Initializing ${model.getModelName()}.`);
      await model.init();
      setModelPhase("ready");
      setModelDetail(
        `${model.getModelName()} is ready on this device. Local steps do not need a network.`,
      );
    } catch (error) {
      setModelPhase("failed");
      setModelDetail(textOf(error));
    } finally {
      setBusy(false);
    }
  }

  function chooseMode(next: Mode): void {
    setMode(next);
    if (next === "scripted") {
      setModelPhase("scripted");
      setModelDetail(
        "Scripted test mode. Tool calls are predetermined. This is not on-device inference.",
      );
      return;
    }
    if (cactusRef.current === null) {
      setModelPhase("not-downloaded");
      setModelDetail("Local AI mode. The on-device model is not downloaded.");
      return;
    }
    setModelPhase("ready");
    setModelDetail("The on-device model is ready.");
  }

  async function startAgent(): Promise<void> {
    const runtime = runtimeRef.current;
    if (runtime === null) {
      return;
    }
    if (mode === "local" && cactusRef.current === null) {
      setNotice("Download the local model before running Local AI mode.");
      setScreen("settings");
      return;
    }
    setBusy(true);
    setOperations([]);
    setCurrentLabel("Starting inspection");
    setReportText(null);
    setTaskId(null);
    setOperationId(null);
    setRunState("Running");
    setScreen("run");
    gateRef.current.arm(boundary);
    try {
      const agent = await ensureAgent(runtime);
      const run = await agent.start({ message: "Inspect pump 12 and prepare a report." });
      runRef.current = run;
      setRunId(run.runId);
      await finishRun(runtime, run, "Running");
    } catch (error) {
      setRunState("Failed");
      setNotice(textOf(error));
    } finally {
      setHeld(gateRef.current.heldBoundary());
      setBusy(false);
    }
  }

  async function finishRun(runtime: Runtime, run: Run, waitingLabel: string): Promise<void> {
    const status = await run.getStatus();
    setRunId(status.runId);
    setRunState(status.status);
    if (status.status === "BLOCKED") {
      setCurrentLabel("Waiting for a decision");
      setNotice(
        "A step has an unknown outcome. It was not retried. Open developer details to reconcile it.",
      );
      await refresh(runtime);
      return;
    }
    if (status.status === "WAITING") {
      setCurrentLabel(waitingLabel);
    }
    const result = await run.result();
    const saved = await readSavedReport(run);
    setReportText(saved ?? result.message);
    setRunState("COMPLETED");
    setCurrentLabel("Inspection complete");
    setDiagnostics(await formatRun(runtime, run));
    await refresh(runtime);
  }

  async function recover(targetId: string): Promise<void> {
    const runtime = runtimeRef.current;
    if (runtime === null) {
      return;
    }
    setBusy(true);
    setScreen("run");
    setNotice(null);
    try {
      const listed = await runtime.listRuns();
      const persisted = listed.find((candidate) => candidate.runId === targetId);
      if (persisted === undefined) {
        throw new Error(`Run ${targetId} is not in the local store.`);
      }
      const mismatch = recoveryMismatch(persisted.workflowName, mode);
      if (mismatch !== null) {
        throw new Error(mismatch);
      }
      if (mode === "local" && cactusRef.current === null) {
        throw new Error("Prepare the local model before recovering a Local AI run.");
      }
      await ensureAgent(runtime);
      const run = await runtime.resume(targetId);
      runRef.current = run;
      setRunId(targetId);
      setCurrentLabel(
        persisted.status === "COMPLETED"
          ? "Opening the saved result"
          : "Recovering the original run",
      );
      const status = await run.getStatus();
      if (
        status.status === "COMPLETED" ||
        status.status === "FAILED" ||
        status.status === "CANCELLED"
      ) {
        const saved = await readSavedReport(run);
        const result = await run.result();
        setReportText(saved ?? result.message);
        setRunState(status.status);
        setDiagnostics(await formatRun(runtime, run));
        setScreen(status.status === "COMPLETED" ? "report" : "run");
        await refresh(runtime);
        return;
      }
      await finishRun(runtime, run, "Recovering the original run");
    } catch (error) {
      setRunState("Failed");
      setNotice(textOf(error));
    } finally {
      setHeld(gateRef.current.heldBoundary());
      setBusy(false);
    }
  }

  async function ensureAgent(runtime: Runtime): Promise<Agent> {
    const existing = agentRef.current;
    const remoteEndpoint = endpointRef.current.trim();
    if (existing !== null) {
      if (registeredMode.current !== mode) {
        throw new Error(
          "Apply settings and reopen before switching between scripted and local mode.",
        );
      }
      if (
        registeredEndpoint.current !== remoteEndpoint ||
        registeredTransport.current !== transportRef.current
      ) {
        throw new Error(
          "Apply settings and reopen before changing the remote endpoint or transport.",
        );
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
      instructions: INSTRUCTIONS,
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
      const history = await run.getHistory();
      const unknown = history.steps.find((step) => step.status === "UNKNOWN_OUTCOME");
      const stored =
        unknown === undefined ? undefined : await storedFieldEffect(unknown.operationId);
      if (resolution === "complete") {
        await run.reconcile({
          resolution,
          output:
            stored === undefined
              ? { applied: false, note: "No local effect row was stored for this operation." }
              : (JSON.parse(stored) as { readonly part?: string }),
          message:
            stored === undefined
              ? "No local effect row exists for this operation."
              : "The local effect row was confirmed.",
        });
      } else if (resolution === "retry") {
        await run.reconcile({
          resolution,
          message: "Another attempt was requested for this operation.",
        });
      } else {
        await run.reconcile({
          resolution: "fail",
          message: "The external effect was not applied.",
        });
      }
      setNotice(`Reconciled as ${resolution}.`);
      const runtime = runtimeRef.current;
      if (runtime !== null) {
        await finishRun(runtime, run, "Continuing");
      }
    } catch (error) {
      setNotice(textOf(error));
    }
  }

  const interrupted = runs.filter((run) => INTERRUPTED.has(run.status));
  const completed = runs.filter((run) => run.status === "COMPLETED");
  const cloudLabel = telemetryStatus === null ? "Disabled" : telemetryPresentation(telemetryStatus);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>LarkX</Text>
          <Text style={styles.title}>Field inspection</Text>
        </View>
        <Pressable onPress={() => setScreen("settings")} style={styles.headerButton}>
          <Text style={styles.headerButtonText}>Settings</Text>
        </Pressable>
      </View>
      {notice === null ? null : <Text style={styles.notice}>{notice}</Text>}
      {screen === "dashboard" ? (
        <Dashboard
          interrupted={interrupted}
          completed={completed}
          onOpen={() => setScreen("detail")}
          onRecover={(id) => void recover(id)}
        />
      ) : null}
      {screen === "detail" ? (
        <Detail
          busy={busy}
          mode={mode}
          modelPhase={modelPhase}
          online={online}
          onBack={() => setScreen("dashboard")}
          onStart={() => void startAgent()}
        />
      ) : null}
      {screen === "run" ? (
        <Execution
          currentLabel={currentLabel}
          operations={operations}
          online={online}
          runId={runId}
          runState={runState}
          taskId={taskId}
          developerOpen={developerOpen}
          diagnostics={diagnostics}
          lines={lines}
          operationId={operationId}
          held={held}
          onToggleDeveloper={() => setDeveloperOpen((value) => !value)}
          onReport={() => setScreen("report")}
          reportReady={reportText !== null}
        />
      ) : null}
      {screen === "report" ? (
        <Report
          text={reportText}
          runId={runId}
          onDashboard={() => {
            setScreen("dashboard");
            setNotice(null);
          }}
        />
      ) : null}
      {screen === "settings" ? (
        <Settings
          mode={mode}
          modelPhase={modelPhase}
          modelDetail={modelDetail}
          busy={busy}
          endpoint={endpoint}
          transport={transport}
          remoteInput={remoteInput}
          online={online}
          telemetryProject={telemetryProject}
          telemetryKey={telemetryKey}
          telemetryEndpoint={telemetryEndpoint}
          cloudLabel={cloudLabel}
          telemetryStatus={telemetryStatus}
          boundary={boundary}
          held={held}
          runs={runs}
          runId={runId}
          operationId={operationId}
          taskId={taskId}
          onMode={chooseMode}
          onPrepare={() => void prepareModel()}
          onEndpoint={(value) => {
            endpointRef.current = value;
            setEndpoint(value);
          }}
          onTransport={(value) => {
            transportRef.current = value;
            setTransport(value);
          }}
          onRemoteInput={setRemoteInput}
          onSendInput={() => {
            const run = runRef.current;
            if (run === null) {
              return;
            }
            void run.provideInput(remoteInput).then(
              () => setNotice("Sent the model number to the remote agent."),
              (error: unknown) => setNotice(textOf(error)),
            );
          }}
          onOnline={() => {
            onlineRef.current = !onlineRef.current;
            setOnline(onlineRef.current);
          }}
          onProject={(value) => {
            telemetryProjectRef.current = value;
            setTelemetryProject(value);
          }}
          onKey={(value) => {
            telemetryKeyRef.current = value;
            setTelemetryKey(value);
          }}
          onCloudEndpoint={(value) => {
            telemetryEndpointRef.current = value;
            setTelemetryEndpoint(value);
          }}
          onApply={() => void reopen()}
          onFlush={() => void flushTelemetry()}
          onBoundary={setBoundary}
          onRelease={() => {
            gateRef.current.release();
            setHeld(null);
          }}
          onRecover={(id) => void recover(id)}
          onReconcile={(resolution) => void reconcile(resolution)}
          onOpenLab={onOpenLab}
          onClose={() => setScreen("dashboard")}
        />
      ) : null}
    </ScrollView>
  );
}

function Dashboard({
  interrupted,
  completed,
  onOpen,
  onRecover,
}: {
  readonly interrupted: readonly RunStatus[];
  readonly completed: readonly RunStatus[];
  readonly onOpen: () => void;
  readonly onRecover: (runId: string) => void;
}) {
  return (
    <View style={styles.stack}>
      <Text style={styles.section}>Awaiting inspection</Text>
      <Pressable onPress={onOpen} style={styles.card}>
        <Text style={styles.cardTitle}>{PUMP.name}</Text>
        <Text style={styles.muted}>
          {PUMP.model} · {PUMP.identifier}
        </Text>
        <Text style={styles.body}>{PUMP.location}</Text>
        <Text style={styles.actionText}>Start inspection</Text>
      </Pressable>
      <Text style={styles.section}>Interrupted</Text>
      {interrupted.length === 0 ? (
        <Text style={styles.muted}>No interrupted inspections.</Text>
      ) : null}
      {interrupted.map((run) => (
        <Pressable key={run.runId} onPress={() => onRecover(run.runId)} style={styles.card}>
          <Text style={styles.cardTitle}>{statusTitle(run.status)}</Text>
          <Text style={styles.muted}>{run.workflowName}</Text>
          <Text style={styles.actionText}>Continue</Text>
        </Pressable>
      ))}
      <Text style={styles.section}>Completed</Text>
      {completed.length === 0 ? <Text style={styles.muted}>No completed inspections.</Text> : null}
      {completed.map((run) => (
        <Pressable key={run.runId} onPress={() => onRecover(run.runId)} style={styles.card}>
          <Text style={styles.cardTitle}>Inspection complete</Text>
          <Text style={styles.muted}>{run.workflowName}</Text>
          <Text style={styles.actionText}>Open report</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Detail({
  busy,
  mode,
  modelPhase,
  online,
  onBack,
  onStart,
}: {
  readonly busy: boolean;
  readonly mode: Mode;
  readonly modelPhase: ModelPhase;
  readonly online: boolean;
  readonly onBack: () => void;
  readonly onStart: () => void;
}) {
  return (
    <View style={styles.stack}>
      <Pressable onPress={onBack}>
        <Text style={styles.link}>Inspections</Text>
      </Pressable>
      <Text style={styles.cardTitle}>{PUMP.name}</Text>
      <Text style={styles.muted}>
        Model {PUMP.model} · {PUMP.identifier}
      </Text>
      <Text style={styles.body}>{PUMP.spec}</Text>
      <Text style={styles.body}>{PUMP.limit}</Text>
      <Text style={styles.section}>Local notes</Text>
      {INSPECTION_NOTES.map((note) => (
        <Text key={note} style={styles.body}>
          {note}
        </Text>
      ))}
      <Text style={styles.section}>Previous observations</Text>
      {PREVIOUS_INSPECTIONS.map((item) => (
        <Text key={item.id} style={styles.body}>
          {item.date}: {item.note}
        </Text>
      ))}
      <Text style={styles.muted}>
        {mode === "scripted" ? "Scripted test mode" : "Local AI mode"} ·{" "}
        {modelPhaseLabel(modelPhase)} ·{" "}
        {online ? "Network available to the runtime" : "Runtime is offline"}
      </Text>
      <Pressable disabled={busy} onPress={onStart} style={styles.primary}>
        <Text style={styles.primaryText}>Run AI inspection</Text>
      </Pressable>
    </View>
  );
}

function Execution({
  currentLabel,
  operations,
  online,
  runId,
  runState,
  taskId,
  developerOpen,
  diagnostics,
  lines,
  operationId,
  held,
  onToggleDeveloper,
  onReport,
  reportReady,
}: {
  readonly currentLabel: string;
  readonly operations: readonly ShownOperation[];
  readonly online: boolean;
  readonly runId: string | null;
  readonly runState: string;
  readonly taskId: string | null;
  readonly developerOpen: boolean;
  readonly diagnostics: string;
  readonly lines: readonly string[];
  readonly operationId: string | null;
  readonly held: FailureBoundary | null;
  readonly onToggleDeveloper: () => void;
  readonly onReport: () => void;
  readonly reportReady: boolean;
}) {
  return (
    <View style={styles.stack}>
      <Text style={styles.section}>Current operation</Text>
      <Text style={styles.cardTitle}>{currentLabel}</Text>
      <Text style={styles.muted}>
        {runState} · {online ? "Connected" : "Offline"}
      </Text>
      {operations.map((item) => (
        <View key={item.id} style={styles.operation}>
          <Text style={item.kind === "remote" ? styles.remoteChip : styles.deviceChip}>
            {item.kind === "remote" ? "Remote" : "On device"}
          </Text>
          <Text style={styles.body}>{item.label}</Text>
        </View>
      ))}
      {reportReady ? (
        <Pressable onPress={onReport} style={styles.primary}>
          <Text style={styles.primaryText}>Open report</Text>
        </Pressable>
      ) : null}
      <Pressable onPress={onToggleDeveloper}>
        <Text style={styles.link}>
          {developerOpen ? "Hide developer details" : "Developer details"}
        </Text>
      </Pressable>
      {developerOpen ? (
        <View style={styles.stack}>
          <Text style={styles.mono}>Run {runId ?? "none"}</Text>
          <Text style={styles.mono}>Operation {operationId ?? "none"}</Text>
          <Text style={styles.mono}>Remote task {taskId ?? "none"}</Text>
          <Text style={styles.mono}>
            {held === null ? "No held boundary" : `Held boundary ${held}`}
          </Text>
          <Text style={styles.mono}>{diagnostics}</Text>
          {lines.map((line, index) => (
            <Text key={`${String(index)}-${line}`} style={styles.mono}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Report({
  text,
  runId,
  onDashboard,
}: {
  readonly text: string | null;
  readonly runId: string | null;
  readonly onDashboard: () => void;
}) {
  return (
    <View style={styles.stack}>
      <Text style={styles.section}>Inspection report</Text>
      <Text style={styles.cardTitle}>{PUMP.name}</Text>
      <Text style={styles.muted}>
        {PUMP.model} · {PUMP.identifier}
        {runId === null ? "" : " · saved locally"}
      </Text>
      <Text style={styles.body}>{text ?? "The report is not available yet."}</Text>
      <Text style={styles.disclaimer}>
        Illustrative AI recommendation. This is not verified industrial safety advice, and the
        supplier catalog is fictional.
      </Text>
      <Pressable onPress={onDashboard} style={styles.primary}>
        <Text style={styles.primaryText}>Back to inspections</Text>
      </Pressable>
    </View>
  );
}

function Settings(props: {
  readonly mode: Mode;
  readonly modelPhase: ModelPhase;
  readonly modelDetail: string;
  readonly busy: boolean;
  readonly endpoint: string;
  readonly transport: "http" | "a2a";
  readonly remoteInput: string;
  readonly online: boolean;
  readonly telemetryProject: string;
  readonly telemetryKey: string;
  readonly telemetryEndpoint: string;
  readonly cloudLabel: string;
  readonly telemetryStatus: TelemetryDeliveryStatus | null;
  readonly boundary: FailureBoundary | null;
  readonly held: FailureBoundary | null;
  readonly runs: readonly RunStatus[];
  readonly runId: string | null;
  readonly operationId: string | null;
  readonly taskId: string | null;
  readonly onMode: (mode: Mode) => void;
  readonly onPrepare: () => void;
  readonly onEndpoint: (value: string) => void;
  readonly onTransport: (value: "http" | "a2a") => void;
  readonly onRemoteInput: (value: string) => void;
  readonly onSendInput: () => void;
  readonly onOnline: () => void;
  readonly onProject: (value: string) => void;
  readonly onKey: (value: string) => void;
  readonly onCloudEndpoint: (value: string) => void;
  readonly onApply: () => void;
  readonly onFlush: () => void;
  readonly onBoundary: (boundary: FailureBoundary | null) => void;
  readonly onRelease: () => void;
  readonly onRecover: (runId: string) => void;
  readonly onReconcile: (resolution: ReconcileInput["resolution"]) => void;
  readonly onOpenLab: () => void;
  readonly onClose: () => void;
}) {
  const pending =
    props.telemetryStatus === null ? "0" : String(props.telemetryStatus.pendingEvents);
  return (
    <View style={styles.stack}>
      <Pressable onPress={props.onClose}>
        <Text style={styles.link}>Close</Text>
      </Pressable>
      <Text style={styles.section}>Model</Text>
      <Text style={styles.body}>{props.modelDetail}</Text>
      <Text style={styles.muted}>{modelPhaseLabel(props.modelPhase)}</Text>
      <View style={styles.row}>
        <Pressable onPress={() => props.onMode("scripted")} style={styles.action}>
          <Text style={styles.actionText}>
            {props.mode === "scripted" ? "Scripted test *" : "Scripted test"}
          </Text>
        </Pressable>
        <Pressable onPress={() => props.onMode("local")} style={styles.action}>
          <Text style={styles.actionText}>
            {props.mode === "local" ? "Local AI *" : "Local AI"}
          </Text>
        </Pressable>
        <Pressable disabled={props.busy} onPress={props.onPrepare} style={styles.action}>
          <Text style={styles.actionText}>Download model</Text>
        </Pressable>
      </View>
      <Text style={styles.section}>Remote research</Text>
      <Text style={styles.muted}>
        A2A is the LangGraph procurement agent. On a phone, use the computer's LAN address.
        localhost is the phone itself. Leave the endpoint empty for a local-only inspection.
      </Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={props.onEndpoint}
        placeholder="http://192.168.1.20:8791"
        placeholderTextColor="#8d9a86"
        value={props.endpoint}
        style={styles.input}
      />
      <View style={styles.row}>
        <Pressable onPress={() => props.onTransport("a2a")} style={styles.action}>
          <Text style={styles.actionText}>{props.transport === "a2a" ? "A2A *" : "A2A"}</Text>
        </Pressable>
        <Pressable onPress={() => props.onTransport("http")} style={styles.action}>
          <Text style={styles.actionText}>{props.transport === "http" ? "HTTP *" : "HTTP"}</Text>
        </Pressable>
        <Pressable onPress={props.onOnline} style={styles.action}>
          <Text style={styles.actionText}>
            {props.online ? "Network available" : "Runtime offline"}
          </Text>
        </Pressable>
      </View>
      <TextInput
        onChangeText={props.onRemoteInput}
        placeholder="Model number for the remote agent"
        placeholderTextColor="#8d9a86"
        value={props.remoteInput}
        style={styles.input}
      />
      <Pressable onPress={props.onSendInput} style={styles.action}>
        <Text style={styles.actionText}>Send model number</Text>
      </Pressable>
      <Text style={styles.section}>LarkX Cloud</Text>
      <Text style={styles.muted}>
        Telemetry is optional. Apply the project and ingestion key before starting the recorded run.
        The key is stored in the platform keystore, not in the inspection database. Production
        cloud.larkx.ai does not accept schema 3 until that service is redeployed. Use a local
        collector endpoint until then.
      </Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={props.onProject}
        placeholder="Project id"
        placeholderTextColor="#8d9a86"
        value={props.telemetryProject}
        style={styles.input}
      />
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={props.onKey}
        placeholder="lkx_ing_…"
        placeholderTextColor="#8d9a86"
        secureTextEntry
        value={props.telemetryKey}
        style={styles.input}
      />
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={props.onCloudEndpoint}
        placeholder="https://cloud.larkx.ai"
        placeholderTextColor="#8d9a86"
        value={props.telemetryEndpoint}
        style={styles.input}
      />
      <Text style={styles.body}>
        {props.cloudLabel}. Pending events {pending}.
      </Text>
      <View style={styles.row}>
        <Pressable disabled={props.busy} onPress={props.onApply} style={styles.action}>
          <Text style={styles.actionText}>Apply and reopen</Text>
        </Pressable>
        <Pressable onPress={props.onFlush} style={styles.action}>
          <Text style={styles.actionText}>Flush telemetry</Text>
        </Pressable>
      </View>
      <Text style={styles.section}>Recovery</Text>
      <Text style={styles.mono}>Run {props.runId ?? "none"}</Text>
      <Text style={styles.mono}>Operation {props.operationId ?? "none"}</Text>
      <Text style={styles.mono}>Remote task {props.taskId ?? "none"}</Text>
      {props.runs.map((run) => (
        <Pressable key={run.runId} onPress={() => props.onRecover(run.runId)} style={styles.action}>
          <Text style={styles.actionText}>
            {run.status} {run.runId}
          </Text>
        </Pressable>
      ))}
      <Text style={styles.section}>Developer controls</Text>
      <Text style={styles.muted}>
        A held boundary pauses the live process. It does not simulate termination. Force-quit the
        app to stop the process. Releasing a boundary continues the same process.
      </Text>
      <View style={styles.row}>
        <Pressable onPress={() => props.onBoundary(null)} style={styles.action}>
          <Text style={styles.actionText}>
            {props.boundary === null ? "No boundary *" : "No boundary"}
          </Text>
        </Pressable>
        {FAILURE_BOUNDARIES.map((item) => (
          <Pressable key={item} onPress={() => props.onBoundary(item)} style={styles.action}>
            <Text style={styles.actionText}>{props.boundary === item ? `${item} *` : item}</Text>
          </Pressable>
        ))}
        <Pressable onPress={props.onRelease} style={styles.action}>
          <Text style={styles.actionText}>
            {props.held === null ? "Release" : `Release ${props.held}`}
          </Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        <Pressable onPress={() => props.onReconcile("complete")} style={styles.action}>
          <Text style={styles.actionText}>Reconcile completed</Text>
        </Pressable>
        <Pressable onPress={() => props.onReconcile("fail")} style={styles.action}>
          <Text style={styles.actionText}>Reconcile not applied</Text>
        </Pressable>
        <Pressable onPress={() => props.onReconcile("retry")} style={styles.action}>
          <Text style={styles.actionText}>Reconcile retry</Text>
        </Pressable>
      </View>
      <Pressable onPress={props.onOpenLab} style={styles.action}>
        <Text style={styles.actionText}>Open scripted runtime lab</Text>
      </Pressable>
    </View>
  );
}

function statusTitle(status: string): string {
  if (status === "BLOCKED") {
    return "Needs a decision";
  }
  if (status === "WAITING") {
    return "Waiting";
  }
  if (status === "RECOVERING") {
    return "Recovering";
  }
  return "Inspection in progress";
}

function modelPhaseLabel(phase: ModelPhase): string {
  switch (phase) {
    case "scripted":
      return "Scripted test mode";
    case "not-downloaded":
      return "Not downloaded";
    case "downloading":
      return "Downloading";
    case "initializing":
      return "Initializing";
    case "ready":
      return "Ready";
    case "failed":
      return "Failed";
  }
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
    throw new Error("Prepare the local model before starting or recovering a Local AI run.");
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
  const tool = event.toolName === undefined ? "" : ` ${event.toolName}`;
  return `${event.type}${tool}${action}${waiting}${prompt}${event.stepKey === undefined ? "" : ` ${event.stepKey}`}${operation}${task}${attempt}`;
}

async function readSavedReport(run: Run): Promise<string | null> {
  const history = await run.getHistory();
  for (const step of [...history.steps].reverse()) {
    if (typeof step.output !== "object" || step.output === null || Array.isArray(step.output)) {
      continue;
    }
    const report = (step.output as { readonly report?: unknown }).report;
    if (typeof report === "string" && report.length > 0) {
      return report;
    }
  }
  return null;
}

async function formatRun(runtime: Runtime, run: Run): Promise<string> {
  const status = await run.getStatus();
  const history = await run.getHistory();
  const delegations = await run.getDelegations();
  const operations = history.steps
    .map((step) => `${step.executionTarget} ${step.stepKey} ${step.operationId}`)
    .join(", ");
  const remote = delegations
    .map((item) =>
      [
        `${item.transport} ${item.state}`,
        `op ${item.operationId}`,
        `task ${item.taskId ?? "none"}`,
      ].join(" "),
    )
    .join(", ");
  return [
    formatDiagnostics(runtime.diagnostics(), runtime.versions),
    `run ${status.runId}`,
    `agent ${status.workflowName}@${String(status.workflowVersion)}`,
    `status ${status.status}`,
    `epoch ${String(status.ownershipEpoch)}`,
    operations.length === 0 ? "operation ids: none" : `operation ids: ${operations}`,
    remote.length === 0 ? "delegations: none" : `delegations: ${remote}`,
  ].join(" · ");
}

function formatDiagnostics(diagnostics: RuntimeDiagnostics, versions: Runtime["versions"]): string {
  return [
    "Native C++",
    `ABI ${String(versions.abi)}`,
    `protocol ${String(versions.protocol)}`,
    `schema ${String(versions.schema)}`,
    diagnostics.recoveryMs === null
      ? "recovery: not measured"
      : `recovery ${String(diagnostics.recoveryMs)} ms`,
  ].join(" · ");
}

function textOf(error: unknown): string {
  return error instanceof Error ? error.message : "The native runtime stopped.";
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingTop: 56, gap: 16, backgroundColor: "#10140f" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  kicker: { color: "#c6f26d", fontSize: 13, fontWeight: "700", letterSpacing: 0.6 },
  title: { color: "#f3f6f1", fontSize: 28, fontWeight: "700" },
  headerButton: {
    backgroundColor: "#1c2418",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  headerButtonText: { color: "#f3f6f1", fontWeight: "600" },
  stack: { gap: 10 },
  section: { color: "#c6f26d", fontSize: 13, fontWeight: "700", marginTop: 8 },
  card: { backgroundColor: "#182016", borderRadius: 16, padding: 16, gap: 6 },
  cardTitle: { color: "#f3f6f1", fontSize: 22, fontWeight: "700" },
  body: { color: "#d7e0d2", fontSize: 16, lineHeight: 22 },
  muted: { color: "#9aa892", fontSize: 14, lineHeight: 20 },
  notice: { color: "#f3f6f1", backgroundColor: "#243022", borderRadius: 12, padding: 12 },
  link: { color: "#c6f26d", fontSize: 15, fontWeight: "600" },
  primary: {
    backgroundColor: "#c6f26d",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryText: { color: "#14210c", fontSize: 16, fontWeight: "700" },
  actionText: { color: "#c6f26d", fontSize: 15, fontWeight: "700" },
  operation: { flexDirection: "row", gap: 10, alignItems: "center" },
  deviceChip: {
    color: "#14210c",
    backgroundColor: "#c6f26d",
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: "700",
  },
  remoteChip: {
    color: "#f3f6f1",
    backgroundColor: "#3d4f86",
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: "700",
  },
  disclaimer: { color: "#e7d7a1", fontSize: 14, lineHeight: 20 },
  input: {
    backgroundColor: "#0c100c",
    borderRadius: 12,
    color: "#f3f6f1",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  action: {
    backgroundColor: "#1c2418",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  mono: { color: "#b7c4b0", fontSize: 12, lineHeight: 18 },
});
