import { useEffect, useRef, useState } from "react";
import { deleteDatabaseSync } from "expo-sqlite";
import * as Clipboard from "expo-clipboard";
import type { ModelAdapter } from "@larkxai/agent";
import type { WorkflowDefinition } from "@larkxai/core";
import {
  bindReactNativeLifecycle,
  openReactNativeEngine,
  useLarkxRun,
  type ReactNativeEngine,
} from "@larkxai/react-native";
import type { TelemetryPhase } from "@larkxai/telemetry";
import {
  AppState,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { activityRows, recoveryStats, reportFromSteps } from "./src/activity.js";
import {
  cloudLabel,
  dashboardUrl,
  openCloud,
  readCloudConfig,
  TELEMETRY_DATABASE,
  type CloudConnection,
} from "./src/cloud.js";
import { cactusModel, DEFAULT_MODEL, fieldDeviceModel } from "./src/device.js";
import { scriptedInspectionModel } from "./src/scripted.js";
import { EXAMPLE_NOTES, type ReportOutput } from "./src/stages.js";
import { createInspectionWorkflow, type InspectionInput } from "./src/workflow.js";
import { Mark, RunningMark } from "./src/ui/Mark.js";

const DATABASE = "larkx-inspection-workflow.db";
const MODEL_NAME = process.env.EXPO_PUBLIC_LARKX_CACTUS_MODEL?.trim() || DEFAULT_MODEL;
const DEMO_DELAY_MS = delayFromEnv(process.env.EXPO_PUBLIC_LARKX_DEMO_DELAY_MS);

type Mode = "device" | "test";
type SetupPhase = "checking" | "needs-download" | "ready";

export function App() {
  const engineRef = useRef<ReactNativeEngine | null>(null);
  const modeRef = useRef<Mode>("device");
  const scriptedRef = useRef(scriptedInspectionModel());
  const deviceRef = useRef(fieldDeviceModel(MODEL_NAME));
  const modelRef = useRef<ModelAdapter>({
    id: "field",
    get model() {
      return modeRef.current === "test" ? scriptedRef.current.model : deviceRef.current.model;
    },
    capabilities: { toolCalling: false, structuredOutput: false, cancellation: true },
    complete(request, context) {
      const selected = modeRef.current === "test" ? scriptedRef.current : deviceRef.current;
      return selected.complete(request, context);
    },
  });
  const workflowRef = useRef<WorkflowDefinition<InspectionInput, ReportOutput> | null>(null);
  const [engine, setEngine] = useState<ReactNativeEngine | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("device");
  const [setup, setSetup] = useState<SetupPhase>("checking");
  const [progress, setProgress] = useState<number | null>(null);
  const [modelLabel, setModelLabel] = useState(MODEL_NAME);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("Preparing the on-device model.");
  const [online, setOnline] = useState<boolean | null>(null);
  const [cloudPhase, setCloudPhase] = useState<TelemetryPhase | "disabled">(
    readCloudConfig() ? "idle" : "disabled",
  );
  const [pendingEvents, setPendingEvents] = useState(0);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [developer, setDeveloper] = useState(false);
  const [reportOpen, setReportOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const telemetryRef = useRef<CloudConnection["telemetry"]>(null);
  const driverRef = useRef<CloudConnection["driver"]>(null);
  const observation = useLarkxRun(engine, runId);
  const report = reportFromSteps(observation.steps);
  const rows = activityRows(observation.steps, observation.run?.status);
  const stats = recoveryStats(observation.steps, observation.history);
  const cloud = cloudLabel(cloudPhase, online, pendingEvents, syncedAt);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const workflow = createInspectionWorkflow(modelRef.current, { delayMs: DEMO_DELAY_MS });
    workflowRef.current = workflow;
    const runtime = openReactNativeEngine({ database: DATABASE, workflows: [workflow] });
    engineRef.current = runtime;
    setEngine(runtime);
    const connection = openCloud(runtime);
    driverRef.current = connection.driver;
    telemetryRef.current = connection.telemetry;
    rememberCloud();
    const lifecycle = bindReactNativeLifecycle(
      { recover: () => engineRef.current?.recover() ?? Promise.resolve([]) },
      (next) => {
        setOnline(next);
        if (next) {
          telemetryRef.current?.setActive(true);
          void telemetryRef.current?.flush().then(rememberCloud);
        }
      },
    );
    const appState = AppState.addEventListener("change", (state) => {
      const active = state === "active";
      telemetryRef.current?.setActive(active);
      if (active) {
        void telemetryRef.current?.flush().then(rememberCloud);
      }
    });
    void runtime.recover().then(async (handles) => {
      await Promise.allSettled(handles.map((handle) => handle.result()));
      const runs = await runtime.listRuns();
      const newest = [...runs].sort((left, right) => right.updatedAt - left.updatedAt)[0];
      if (newest) {
        setRunId(newest.runId);
      }
      setNotice(newest ? "Conversation restored." : "Enter notes from the inspection.");
      void telemetryRef.current?.flush().then(rememberCloud);
    });
    void prepareModel();
    return () => {
      appState.remove();
      lifecycle.remove();
      void telemetryRef.current?.stop();
      driverRef.current?.close();
    };
  }, []);

  async function prepareModel(): Promise<void> {
    try {
      await cactusModel(MODEL_NAME).init();
      setModelLabel(safeModelName());
      setSetup("ready");
      setNotice("On-device model ready.");
    } catch {
      setSetup("needs-download");
      setNotice("Download the model to run on this phone.");
    }
  }

  async function download(): Promise<void> {
    setNotice("Downloading the model.");
    try {
      await cactusModel(MODEL_NAME).download({ onProgress: setProgress });
      setProgress(1);
      setNotice("Model file is on this phone. Initialize it next.");
    } catch (error) {
      setNotice(messageFrom(error));
    }
  }

  async function initialize(): Promise<void> {
    setNotice("Initializing the model.");
    try {
      await cactusModel(MODEL_NAME).init();
      setModelLabel(safeModelName());
      setSetup("ready");
      setNotice("Ready for offline use.");
    } catch (error) {
      setNotice(messageFrom(error));
    }
  }

  async function send(text: string): Promise<void> {
    const notes = text.trim();
    const workflow = workflowRef.current;
    if (!engine || !workflow || notes.length === 0 || busy) {
      return;
    }
    if (mode === "device" && setup !== "ready") {
      setNotice("Initialize the on-device model before sending.");
      return;
    }
    setBusy(true);
    setReportOpen(true);
    const id = `inspection-${String(Date.now())}`;
    setRunId(id);
    setNotice(mode === "test" ? "Running the scripted test." : "Running on-device inference.");
    try {
      const handle = await engine.start(workflow, { id, input: { notes } });
      await handle.result();
      setNotice("Report ready.");
    } catch (error) {
      setNotice(messageFrom(error));
    } finally {
      setBusy(false);
      void telemetryRef.current?.flush().then(rememberCloud);
    }
  }

  function rememberCloud(): void {
    const telemetry = telemetryRef.current;
    if (!telemetry) {
      setCloudPhase("disabled");
      setPendingEvents(0);
      return;
    }
    const status = telemetry.current();
    setCloudPhase(status.phase);
    setPendingEvents(status.pendingEvents);
    setSyncedAt(status.lastSyncedAt);
  }

  async function reset(): Promise<void> {
    const active = engineRef.current;
    const workflow = workflowRef.current;
    if (!active || !workflow) {
      return;
    }
    await telemetryRef.current?.stop();
    telemetryRef.current = null;
    driverRef.current?.close();
    driverRef.current = null;
    await active.close();
    deleteDatabaseSync(DATABASE);
    deleteDatabaseSync(TELEMETRY_DATABASE);
    const runtime = openReactNativeEngine({ database: DATABASE, workflows: [workflow] });
    engineRef.current = runtime;
    const connection = openCloud(runtime);
    driverRef.current = connection.driver;
    telemetryRef.current = connection.telemetry;
    setEngine(runtime);
    setRunId(null);
    setDraft("");
    setNotice("Local conversation cleared. The model file is still on this phone.");
    rememberCloud();
  }

  const notes = readNotes(observation.run?.input);
  const showSetup = mode === "device" && setup === "needs-download";
  const link = runId ? dashboardUrl(readCloudConfig()?.dashboard ?? null, runId) : null;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Mark />
          <View style={styles.brandText}>
            <Text style={styles.title}>Field Assistant</Text>
            <Text style={styles.subtitle}>Powered by Larkx</Text>
          </View>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.pill}>On-device AI</Text>
          <Text style={styles.model}>
            {mode === "test" ? "Scripted test" : `Cactus · ${shortModel(modelLabel)}`}
          </Text>
        </View>
      </View>
      {showSetup ? (
        <Setup
          notice={notice}
          progress={progress}
          model={MODEL_NAME}
          onDownload={() => void download()}
          onInitialize={() => void initialize()}
          onTest={() => {
            setMode("test");
            setNotice("Scripted test mode. This does not run Cactus.");
          }}
        />
      ) : (
        <ScrollView style={styles.thread} contentContainerStyle={styles.threadContent}>
          {notes ? (
            <View style={styles.userBubble}>
              <Text style={styles.userText}>{notes}</Text>
            </View>
          ) : (
            <Pressable style={styles.suggest} onPress={() => void send(EXAMPLE_NOTES)}>
              <Text style={styles.suggestText}>{EXAMPLE_NOTES}</Text>
            </Pressable>
          )}
          {runId ? (
            <View style={styles.card}>
              {stats.recoveries > 0 ? (
                <View style={styles.recovered}>
                  <Text style={styles.recoveredTitle}>Execution recovered</Text>
                  <Text style={styles.recoveredBody}>
                    Your workflow resumed from its last saved checkpoint.
                  </Text>
                  <Text style={styles.recoveredMeta}>
                    {String(stats.restored)} restored · {String(stats.repeated)} committed steps
                    repeated · {String(stats.recoveries)}{" "}
                    {stats.recoveries === 1 ? "recovery" : "recoveries"} ·{" "}
                    {observation.run?.status ?? "unknown"}
                  </Text>
                </View>
              ) : null}
              <Text style={styles.cardTitle}>Processing your inspection</Text>
              {rows.map((row) => (
                <View key={row.key} style={styles.stage}>
                  <View style={styles.row}>
                    <RowMark state={row.state} />
                    <View style={styles.rowText}>
                      <Text style={styles.rowLabel}>{row.label}</Text>
                      <Text style={styles.rowState}>{row.detail}</Text>
                    </View>
                    <Text style={styles.local}>{row.where}</Text>
                  </View>
                  {row.lines.slice(0, 3).map((line) => (
                    <Text key={line} style={styles.line}>
                      {line}
                    </Text>
                  ))}
                </View>
              ))}
              <Pressable onPress={() => setDeveloper((open) => !open)}>
                <Text style={styles.developerToggle}>
                  {developer ? "Hide developer details" : "Developer details"}
                </Text>
              </Pressable>
              {developer ? (
                <Developer
                  runId={runId}
                  status={observation.run?.status ?? "unknown"}
                  steps={observation.steps}
                  stats={stats}
                  cloud={cloud}
                  pending={pendingEvents}
                  started={observation.run?.createdAt ?? null}
                  updated={observation.run?.updatedAt ?? null}
                  mode={mode}
                  link={link}
                  onReset={() => void reset()}
                  onMode={(next) => {
                    setMode(next);
                    setNotice(
                      next === "test"
                        ? "Scripted test mode. This does not run Cactus."
                        : "Device mode uses Cactus.",
                    );
                  }}
                />
              ) : null}
            </View>
          ) : null}
          {report ? (
            <ReportCard
              report={report}
              open={reportOpen}
              onToggle={() => setReportOpen((open) => !open)}
              onCopy={() => void Clipboard.setStringAsync(report.body)}
              onShare={() => void Share.share({ message: report.body })}
            />
          ) : null}
          {notice.length > 0 ? <Text style={styles.notice}>{notice}</Text> : null}
          <Text style={styles.footer}>{presence(online, cloud)}</Text>
        </ScrollView>
      )}
      {showSetup ? null : (
        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Enter inspection notes..."
            placeholderTextColor="#7f9086"
            style={styles.input}
            multiline
          />
          <Pressable style={styles.send} onPress={() => void send(draft)} accessibilityLabel="Send">
            <Text style={styles.sendLabel}>↑</Text>
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function Setup(props: {
  notice: string;
  progress: number | null;
  model: string;
  onDownload: () => void;
  onInitialize: () => void;
  onTest: () => void;
}) {
  return (
    <View style={styles.setup}>
      <Text style={styles.cardTitle}>On-device model</Text>
      <Text style={styles.body}>{props.model}</Text>
      <Text style={styles.body}>{props.notice}</Text>
      {props.progress !== null ? (
        <Text style={styles.body}>Download {String(Math.round(props.progress * 100))}%</Text>
      ) : null}
      <View style={styles.setupActions}>
        <Pressable style={styles.secondary} onPress={props.onDownload}>
          <Text style={styles.secondaryLabel}>Download</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={props.onInitialize}>
          <Text style={styles.secondaryLabel}>Initialize</Text>
        </Pressable>
      </View>
      <Pressable onPress={props.onTest}>
        <Text style={styles.developerToggle}>Use scripted test mode</Text>
      </Pressable>
    </View>
  );
}

function ReportCard(props: {
  report: ReportOutput;
  open: boolean;
  onToggle: () => void;
  onCopy: () => void;
  onShare: () => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{props.report.title}</Text>
      <Text style={styles.section}>Summary</Text>
      <Text style={styles.body}>{props.report.summary}</Text>
      {props.open ? (
        <>
          <Text style={styles.section}>Priority issues</Text>
          {props.report.issues.map((issue) => (
            <Text key={`${issue.severity}-${issue.text}`} style={styles.body}>
              {issue.severity.toUpperCase()} · {issue.text}
            </Text>
          ))}
          <Text style={styles.section}>Follow-up</Text>
          {props.report.actions.map((action) => (
            <Text key={action} style={styles.body}>
              {action}
            </Text>
          ))}
          <Text style={styles.section}>Report</Text>
          <Text style={styles.body}>{props.report.body}</Text>
        </>
      ) : null}
      <Text style={styles.meta}>Saved on this phone · {props.report.model}</Text>
      <View style={styles.setupActions}>
        <Pressable style={styles.secondary} onPress={props.onToggle}>
          <Text style={styles.secondaryLabel}>
            {props.open ? "Hide details" : "View full report"}
          </Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={props.onCopy}>
          <Text style={styles.secondaryLabel}>Copy</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={props.onShare}>
          <Text style={styles.secondaryLabel}>Export</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Developer(props: {
  runId: string;
  status: string;
  steps: readonly { stepKey: string; status: string; attemptCount: number; operationId: string }[];
  stats: { restored: number; repeated: number; recoveries: number };
  cloud: string;
  pending: number;
  started: number | null;
  updated: number | null;
  mode: Mode;
  link: string | null;
  onReset: () => void;
  onMode: (mode: Mode) => void;
}) {
  const current = props.steps.find((step) => step.status !== "COMPLETED")?.stepKey ?? "none";
  const duration =
    props.started !== null && props.updated !== null ? props.updated - props.started : null;
  const link = props.link;
  return (
    <View style={styles.developer}>
      <Fact label="Run" value={props.runId} />
      <Fact label="Workflow" value="inspection-workflow v1" />
      <Fact label="Status" value={props.status} />
      <Fact label="Current step" value={current} />
      <Fact label="Recoveries" value={String(props.stats.recoveries)} />
      <Fact label="Restored steps" value={String(props.stats.restored)} />
      <Fact label="Repeated steps" value={String(props.stats.repeated)} />
      <Fact label="Sync" value={`${props.cloud} · pending ${String(props.pending)}`} />
      <Fact label="Duration" value={duration === null ? "unknown" : `${String(duration)} ms`} />
      {props.steps.map((step) => (
        <Text key={step.stepKey} style={styles.mono}>
          {step.stepKey} · {step.status} · attempts {String(step.attemptCount)} · {step.operationId}
        </Text>
      ))}
      <View style={styles.setupActions}>
        <Pressable
          style={styles.secondary}
          onPress={() => props.onMode(props.mode === "test" ? "device" : "test")}
        >
          <Text style={styles.secondaryLabel}>
            {props.mode === "test" ? "Use Cactus" : "Scripted test"}
          </Text>
        </Pressable>
        {link ? (
          <Pressable style={styles.secondary} onPress={() => void Linking.openURL(link)}>
            <Text style={styles.secondaryLabel}>View run in Cloud</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.secondary} onPress={props.onReset}>
          <Text style={styles.secondaryLabel}>Reset</Text>
        </Pressable>
      </View>
    </View>
  );
}

function RowMark({ state }: { state: string }) {
  if (state === "running") {
    return <RunningMark />;
  }
  const done = state === "completed" || state === "recovered";
  const bad = state === "blocked" || state === "interrupted";
  const skipped = state === "skipped";
  return (
    <View style={[styles.mark, done ? styles.markDone : bad ? styles.markBad : styles.markIdle]}>
      <Text style={done || bad ? styles.markGlyphOn : styles.markGlyphIdle}>
        {done ? "✓" : bad ? "!" : skipped ? "–" : ""}
      </Text>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Text style={styles.mono}>
      {label}: {value}
    </Text>
  );
}

function presence(online: boolean | null, cloud: string): string {
  if (online === false && cloud === "Sync pending") {
    return "Working offline · Cloud sync pending";
  }
  if (online === false) {
    return `Working offline · ${cloud}`;
  }
  return cloud;
}

function readNotes(input: unknown): string | null {
  if (typeof input !== "object" || input === null || !("notes" in input)) {
    return null;
  }
  const notes = (input as { notes?: unknown }).notes;
  return typeof notes === "string" && notes.length > 0 ? notes : null;
}

function shortModel(name: string): string {
  return name.replace(/-int8$/, "").replace("qwen3-0.6b", "Qwen3-0.6B");
}

function safeModelName(): string {
  try {
    return cactusModel(MODEL_NAME).getModelName();
  } catch {
    return MODEL_NAME;
  }
}

function messageFrom(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "The request failed.";
}

function delayFromEnv(value: string | undefined): number {
  const parsed = Number(value ?? "0");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#101412" },
  header: { paddingTop: 58, paddingHorizontal: 20, paddingBottom: 12 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandText: { flex: 1 },
  title: { color: "#f4f7f2", fontSize: 22, fontWeight: "700" },
  subtitle: { color: "#93a39a", fontSize: 13, marginTop: 2 },
  model: { color: "#c5d0c8", fontSize: 12, textAlign: "right" },
  statusRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  pill: { color: "#d6f56a", fontSize: 13 },
  mark: { height: 18, width: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  markDone: { backgroundColor: "#d6f56a" },
  markBad: { backgroundColor: "#8a4a3a" },
  markIdle: { backgroundColor: "#3a4740" },
  markGlyphOn: { color: "#172117", fontSize: 11, fontWeight: "700" },
  markGlyphIdle: { color: "#66756c", fontSize: 11 },
  thread: { flex: 1 },
  threadContent: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  userBubble: {
    alignSelf: "flex-end",
    maxWidth: "88%",
    backgroundColor: "#314f3b",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  userText: { color: "#e7f2df", fontSize: 15, lineHeight: 21 },
  suggest: {
    alignSelf: "flex-end",
    maxWidth: "88%",
    borderColor: "#34523c",
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  suggestText: { color: "#d6f56a", fontSize: 15, lineHeight: 21 },
  card: { backgroundColor: "#1b221e", borderRadius: 16, padding: 14, gap: 8 },
  cardTitle: { color: "#f4f7f2", fontSize: 16, fontWeight: "700" },
  recoveredTitle: { color: "#d6f56a", fontSize: 15, fontWeight: "700" },
  recoveredBody: { color: "#d5e0d8", fontSize: 14, marginTop: 4 },
  recoveredMeta: { color: "#93a39a", fontSize: 12, marginTop: 6 },
  recovered: {
    borderBottomColor: "#2c3832",
    borderBottomWidth: 1,
    paddingBottom: 10,
    marginBottom: 4,
  },
  stage: { gap: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  rowText: { flex: 1 },
  rowLabel: { color: "#f4f7f2", fontSize: 15 },
  rowState: { color: "#93a39a", fontSize: 12, marginTop: 2 },
  line: { color: "#d5e0d8", fontSize: 13, marginLeft: 28 },
  local: { color: "#93a39a", fontSize: 11, letterSpacing: 0.6 },
  developerToggle: { color: "#d6f56a", fontSize: 13, marginTop: 6 },
  developer: { gap: 4, marginTop: 4 },
  mono: { color: "#b7c4bb", fontSize: 11, fontVariant: ["tabular-nums"] },
  section: { color: "#d6f56a", fontSize: 13, marginTop: 6 },
  body: { color: "#e4ece6", fontSize: 14, lineHeight: 20 },
  meta: { color: "#93a39a", fontSize: 12, marginTop: 4 },
  notice: { color: "#93a39a", fontSize: 13 },
  footer: { color: "#93a39a", fontSize: 13, marginTop: 4 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    borderTopColor: "#24302c",
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    color: "#f4f7f2",
    backgroundColor: "#1b221e",
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
  },
  send: {
    height: 44,
    width: 44,
    borderRadius: 22,
    backgroundColor: "#d6f56a",
    alignItems: "center",
    justifyContent: "center",
  },
  sendLabel: { color: "#172117", fontSize: 18, fontWeight: "700" },
  setup: { flex: 1, paddingHorizontal: 20, gap: 10 },
  setupActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  secondary: {
    borderColor: "#34523c",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secondaryLabel: { color: "#d6f56a", fontSize: 13 },
});
