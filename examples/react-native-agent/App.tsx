import { useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { LarkxError, type StepSnapshot } from "@larkxai/core";
import {
  bindReactNativeLifecycle,
  openReactNativeEngine,
  useLarkxRun,
  type ReactNativeEngine,
} from "@larkxai/react-native";
import { deleteDatabaseSync } from "expo-sqlite";
import type { CloudTelemetry } from "@larkxai/telemetry";

import {
  cactusModel,
  cactusModelLabel,
  clearRenovationAgents,
  renovationAgents,
} from "./src/agents";
import { REQUEST } from "./src/catalog";
import { TELEMETRY_DATABASE, cloudLabel, openCloud } from "./src/cloud";
import { clearSessionCalls, sessionCalls } from "./src/tools";

const DATABASE = "larkx-agent.db";

const LABELS: Record<string, string> = {
  get_room_info: "Read room information",
  get_budget: "Check renovation budget",
  search_furniture: "Search furniture catalog",
  save_plan: "Save plan",
};

export function App() {
  const [engine, setEngine] = useState<ReactNativeEngine | null>(null);
  const engineRef = useRef<ReactNativeEngine | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [mode, setMode] = useState<"test" | "device">("test");
  const [message, setMessage] = useState(REQUEST);
  const [online, setOnline] = useState<boolean | null>(null);
  const [banner, setBanner] = useState("Recovering local runs.");
  const [calls, setCalls] = useState<string[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [cloud, setCloud] = useState("Disabled");
  const [pendingEvents, setPendingEvents] = useState(0);
  const telemetryRef = useRef<CloudTelemetry | null>(null);
  const driverRef = useRef<{ close(): void } | null>(null);
  const observation = useLarkxRun(engine, runId);

  function rememberCloud(telemetry: CloudTelemetry | null): void {
    telemetryRef.current = telemetry;
    if (!telemetry) {
      setCloud("Disabled");
      setPendingEvents(0);
      return;
    }
    const status = telemetry.current();
    setCloud(cloudLabel(status.phase));
    setPendingEvents(status.pendingEvents);
  }

  useEffect(() => {
    const runtime = openReactNativeEngine({ database: DATABASE, workflows: [] });
    engineRef.current = runtime;
    try {
      renovationAgents(runtime);
    } catch (error) {
      setBanner(messageFrom(error));
    }
    setEngine(runtime);
    const connection = openCloud(runtime);
    driverRef.current = connection.driver;
    rememberCloud(connection.telemetry);
    const lifecycle = bindReactNativeLifecycle(
      { recover: () => engineRef.current?.recover() ?? Promise.resolve([]) },
      (next) => {
        setOnline(next);
        if (next) {
          telemetryRef.current?.setActive(true);
          void telemetryRef.current?.flush().then(() => rememberCloud(telemetryRef.current));
        }
      },
    );
    const appState = AppState.addEventListener("change", (state) => {
      const active = state === "active";
      telemetryRef.current?.setActive(active);
      if (active) {
        void telemetryRef.current?.flush().then(() => rememberCloud(telemetryRef.current));
      }
    });
    void runtime.recover().then(async (handles) => {
      await Promise.allSettled(handles.map((handle) => handle.result()));
      const runs = await runtime.listRuns();
      const newest = [...runs].sort((left, right) => right.updatedAt - left.updatedAt)[0];
      if (newest) {
        setRunId(newest.runId);
        setMode(newest.workflowName === "renovation-agent" ? "device" : "test");
      }
      setCalls([...sessionCalls()]);
      setBanner("Local runtime ready. Download the model before the device agent.");
      void telemetryRef.current?.flush().then(() => rememberCloud(telemetryRef.current));
    });
    const timer = setInterval(() => {
      setCalls([...sessionCalls()]);
      rememberCloud(telemetryRef.current);
    }, 1000);
    return () => {
      clearInterval(timer);
      appState.remove();
      lifecycle.remove();
      void telemetryRef.current?.stop();
      driverRef.current?.close();
    };
  }, []);

  const activeEngine = engine;
  const modelName = safeModelName();

  async function start(): Promise<void> {
    if (!activeEngine) {
      return;
    }
    if (mode === "device" && !modelReady) {
      setBanner("Initialize the local model before starting the device agent.");
      return;
    }
    const agents = renovationAgents(activeEngine);
    const agent = mode === "device" ? agents.device : agents.test;
    const id = `${agent.name}-${String(Date.now())}`;
    setRunId(id);
    setBanner(
      mode === "device" ? "Running on-device inference." : "Running the scripted test agent.",
    );
    try {
      const handle = await agent.start({ id, input: { message: message.trim() } });
      await handle.result();
      setBanner("Agent completed from the last committed step.");
    } catch (error) {
      setBanner(messageFrom(error));
    } finally {
      setCalls([...sessionCalls()]);
    }
  }

  async function recover(): Promise<void> {
    if (!activeEngine) {
      return;
    }
    setBanner("Recovery requested.");
    const handles = await activeEngine.recover();
    await Promise.allSettled(handles.map((handle) => handle.result()));
    setCalls([...sessionCalls()]);
    if (runId) {
      const snapshot = await activeEngine.getRun(runId);
      setBanner(snapshot ? `Run is ${snapshot.status}.` : "Run was not found.");
    }
  }

  async function cancel(): Promise<void> {
    if (!activeEngine || !runId) {
      return;
    }
    try {
      await activeEngine.cancel(runId);
      setBanner("Cancel requested. Committed steps stay.");
    } catch (error) {
      setBanner(messageFrom(error));
    }
  }

  async function download(): Promise<void> {
    setBanner("Downloading the model. This is not an agent step.");
    setModelReady(false);
    try {
      await cactusModel().download({
        onProgress: (value) => setProgress(value),
      });
      setProgress(1);
      setBanner("Model file is local. Initialize it next.");
    } catch (error) {
      setBanner(messageFrom(error));
    }
  }

  async function initialize(): Promise<void> {
    setBanner("Initializing the local model.");
    try {
      await cactusModel().init();
      setModelReady(true);
      setBanner("Model initialized. The agent can run without a download.");
    } catch (error) {
      setModelReady(false);
      setBanner(messageFrom(error));
    }
  }

  async function synchronize(): Promise<void> {
    const telemetry = telemetryRef.current;
    if (!telemetry) {
      setCloud("Disabled");
      return;
    }
    const flushed = await telemetry.flush();
    setCloud(cloudLabel(flushed.phase));
    setPendingEvents(telemetry.current().pendingEvents);
    setBanner(
      flushed.error
        ? `Cloud sync ${flushed.error}.`
        : "Cloud sync finished. Local execution did not wait on it.",
    );
  }

  async function reset(): Promise<void> {
    if (!activeEngine) {
      return;
    }
    await telemetryRef.current?.stop();
    telemetryRef.current = null;
    driverRef.current?.close();
    driverRef.current = null;
    await activeEngine.close();
    deleteDatabaseSync(DATABASE);
    deleteDatabaseSync(TELEMETRY_DATABASE);
    clearSessionCalls();
    clearRenovationAgents();
    const runtime = openReactNativeEngine({ database: DATABASE, workflows: [] });
    renovationAgents(runtime);
    engineRef.current = runtime;
    const connection = openCloud(runtime);
    driverRef.current = connection.driver;
    rememberCloud(connection.telemetry);
    setEngine(runtime);
    setRunId(null);
    setCalls([]);
    setBanner("Database reset. The model file, if downloaded, is still on the device.");
  }

  const plan = savedPlan(observation.steps);
  const current =
    observation.steps.find(
      (step) => step.status === "RUNNING" || step.status === "RETRY_SCHEDULED",
    ) ?? null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.brand}>
        <View style={styles.mark}>
          <View style={styles.markInner} />
        </View>
        <Text style={styles.kicker}>LarkX</Text>
      </View>
      <Text style={styles.title}>Renovation agent</Text>
      <Text style={styles.banner}>{banner}</Text>
      <Text style={styles.meta}>
        {mode === "device" ? `cactus · ${modelName}` : "scripted · scripted-renovation"}
        {"  ·  "}
        {online === null ? "network unknown" : online ? "online" : "offline"}
        {modelReady ? "  ·  model initialized" : "  ·  model not initialized"}
      </Text>
      <TextInput
        value={message}
        onChangeText={setMessage}
        style={styles.input}
        placeholderTextColor="#8aa399"
        multiline
      />
      <View style={styles.row}>
        <ModeButton label="Test" selected={mode === "test"} onPress={() => setMode("test")} />
        <ModeButton label="Device" selected={mode === "device"} onPress={() => setMode("device")} />
      </View>
      <View style={styles.row}>
        <Action label="Download" onPress={() => void download()} />
        <Action label="Initialize" onPress={() => void initialize()} />
      </View>
      <Text style={styles.hint}>
        {progress === null
          ? "Download is separate from the agent run."
          : `Download ${String(Math.round(progress * 100))}%`}
      </Text>
      <View style={styles.row}>
        <Action label="Start" onPress={() => void start()} />
        <Action label="Cancel" onPress={() => void cancel()} />
        <Action label="Recover" onPress={() => void recover()} />
        <Action label="Reset" onPress={() => void reset()} />
        <Action label="Sync" onPress={() => void synchronize()} />
      </View>

      <Card title="Cloud">
        <Fact label="Connection" value={cloud} />
        <Fact label="Run" value={runId ?? "none"} />
        <Fact label="Pending events" value={String(pendingEvents)} />
        <Text style={styles.hint}>
          Sync sends metadata only. Prompts, model text, and tool results stay on this device. Leave
          the endpoint and ingestion key unset to stay disabled.
        </Text>
      </Card>

      <Card title="Run">
        <Fact label="ID" value={runId ?? "none"} />
        <Fact label="Status" value={observation.run?.status ?? "idle"} />
        <Fact
          label="Agent"
          value={
            observation.run
              ? `${observation.run.workflowName} v${String(observation.run.workflowVersion)}`
              : "none"
          }
        />
        <Fact label="Policy" value={observation.run?.dataPolicy ?? "device-only"} />
        <Fact
          label="Current"
          value={current ? `${labelFor(current)} · ${current.stepKey}` : "none"}
        />
      </Card>

      <Card title="Timeline">
        {observation.steps.length === 0 ? (
          <Text style={styles.body}>No committed steps yet.</Text>
        ) : null}
        {observation.steps.map((step) => (
          <View key={step.stepKey} style={styles.step}>
            <Text style={styles.stepTitle}>
              {markFor(step.status)} {labelFor(step)}
            </Text>
            <Text style={styles.body}>
              {step.stepKey} · {step.status} · {step.effectType} · attempts{" "}
              {String(step.attemptCount)}
            </Text>
            <Text style={styles.mono}>operation {step.operationId}</Text>
          </View>
        ))}
      </Card>

      <Card title="This session">
        <Text style={styles.body}>
          {calls.length === 0 ? "No tool handlers have run in this process." : calls.join("  →  ")}
        </Text>
        <Text style={styles.hint}>
          A force-quit clears this list. A completed step that does not appear again was not
          repeated.
        </Text>
      </Card>

      <Card title="Journal">
        {observation.history.length === 0 ? <Text style={styles.body}>No events yet.</Text> : null}
        {observation.history.slice(-12).map((event) => (
          <Text key={event.eventId} style={styles.mono}>
            {String(event.sequence).padStart(2, "0")} {event.type}
            {typeof event.payload.stepKey === "string" ? ` ${event.payload.stepKey}` : ""}
          </Text>
        ))}
      </Card>

      <Card title="Plan">
        <Text style={styles.body}>{plan ?? "No plan has been saved in this run."}</Text>
        <Text style={styles.hint}>{resultMessage(observation.run?.output ?? null)}</Text>
      </Card>
    </ScrollView>
  );
}

function savedPlan(steps: readonly StepSnapshot[]): string | null {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const output = steps[index]?.output;
    if (
      !isRecord(output) ||
      output.name !== "save_plan" ||
      output.ok !== true ||
      !isRecord(output.output)
    ) {
      continue;
    }
    const plan = output.output;
    const items = Array.isArray(plan.items)
      ? plan.items.filter((item) => typeof item === "string")
      : [];
    return [
      typeof plan.title === "string" ? plan.title : "Plan",
      typeof plan.summary === "string" ? plan.summary : "",
      items.length > 0 ? items.join(", ") : "",
      typeof plan.totalCost === "number" ? `$${String(plan.totalCost)}` : "",
      typeof plan.id === "string" ? `id ${plan.id}` : "",
    ]
      .filter((line) => line.length > 0)
      .join("\n");
  }
  return null;
}

function resultMessage(output: unknown): string {
  if (!isRecord(output) || typeof output.message !== "string") {
    return "";
  }
  return output.message;
}

function labelFor(step: StepSnapshot): string {
  if (step.stepKey === "model-0") {
    return "Analyze request";
  }
  if (step.stepKey.startsWith("model-")) {
    return "Generate renovation plan";
  }
  if (isRecord(step.output) && typeof step.output.name === "string") {
    return LABELS[step.output.name] ?? step.output.name;
  }
  return step.stepKey;
}

function markFor(status: string): string {
  if (status === "COMPLETED") {
    return "✓";
  }
  if (status === "RUNNING" || status === "RETRY_SCHEDULED") {
    return "●";
  }
  if (status === "FAILED" || status === "UNKNOWN_OUTCOME" || status === "CANCELLED") {
    return "!";
  }
  return "○";
}

function safeModelName(): string {
  return cactusModelLabel();
}

function messageFrom(error: unknown): string {
  if (error instanceof LarkxError) {
    return `${error.code}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "The agent stopped.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Text style={styles.body}>
      <Text style={styles.fact}>{label}</Text> {value}
    </Text>
  );
}

function ModeButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.mode, selected ? styles.modeOn : null]}>
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

function Action({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.action}>
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#101418" },
  content: { padding: 20, paddingTop: 56, gap: 12 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  mark: {
    width: 28,
    height: 28,
    borderWidth: 2,
    borderColor: "#7dcea0",
    alignItems: "center",
    justifyContent: "center",
  },
  markInner: { width: 10, height: 10, backgroundColor: "#7dcea0" },
  kicker: { color: "#7dcea0", fontSize: 14, letterSpacing: 2, fontWeight: "700" },
  title: { color: "#f4f7f5", fontSize: 28, fontWeight: "700" },
  banner: { color: "#f4f7f5", fontSize: 16, lineHeight: 22 },
  meta: { color: "#8aa399", fontSize: 13 },
  hint: { color: "#8aa399", fontSize: 12, lineHeight: 18 },
  input: {
    color: "#f4f7f5",
    borderColor: "#24302c",
    borderWidth: 1,
    minHeight: 72,
    padding: 12,
    fontSize: 15,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  mode: { borderColor: "#24302c", borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  modeOn: { borderColor: "#7dcea0" },
  action: { backgroundColor: "#1a2420", paddingHorizontal: 12, paddingVertical: 10 },
  actionText: { color: "#7dcea0", fontWeight: "700" },
  card: { borderColor: "#24302c", borderWidth: 1, padding: 12, gap: 6 },
  cardTitle: { color: "#7dcea0", fontSize: 13, letterSpacing: 1, fontWeight: "700" },
  body: { color: "#f4f7f5", fontSize: 14, lineHeight: 20 },
  fact: { color: "#8aa399" },
  step: { gap: 2, paddingTop: 6 },
  stepTitle: { color: "#f4f7f5", fontSize: 16, fontWeight: "700" },
  mono: { color: "#8aa399", fontSize: 12, fontFamily: "monospace" },
});
