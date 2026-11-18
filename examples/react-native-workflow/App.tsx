import { useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { LarkxError } from "@larkx/core";
import {
  bindReactNativeLifecycle,
  openReactNativeEngine,
  useLarkxRun,
  type ReactNativeEngine,
} from "@larkx/react-native";
import { deleteDatabaseSync } from "expo-sqlite";
import type { CloudTelemetry } from "@larkx/telemetry";

import { TELEMETRY_DATABASE, cloudLabel, openCloud } from "./src/cloud";
import { clearSessionCalls, demoWorkflows, sessionCalls } from "./src/workflow";

const DATABASE = "larkx.db";

export function App() {
  const [engine, setEngine] = useState<ReactNativeEngine | null>(null);
  const engineRef = useRef<ReactNativeEngine | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [mode, setMode] = useState<"notes" | "charge">("notes");
  const [online, setOnline] = useState<boolean | null>(null);
  const [banner, setBanner] = useState("Recovering local runs.");
  const [calls, setCalls] = useState<string[]>([]);
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
    const runtime = openReactNativeEngine({
      database: DATABASE,
      workflows: [demoWorkflows().notes, demoWorkflows().charge],
    });
    engineRef.current = runtime;
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
    void runtime.recover().then(async () => {
      const runs = await runtime.listRuns();
      const newest = [...runs].sort((left, right) => right.updatedAt - left.updatedAt)[0];
      if (newest) {
        setRunId(newest.runId);
        setMode(newest.workflowName === "mobile-charge" ? "charge" : "notes");
      }
      setBanner("Local runtime ready. Cloud is optional.");
      setCalls([...sessionCalls()]);
      void telemetryRef.current?.flush().then(() => rememberCloud(telemetryRef.current));
    });
    const timer = setInterval(() => rememberCloud(telemetryRef.current), 1000);
    return () => {
      clearInterval(timer);
      appState.remove();
      lifecycle.remove();
      void telemetryRef.current?.stop();
      driverRef.current?.close();
    };
  }, []);

  const activeEngine = engine;

  async function start(): Promise<void> {
    if (!activeEngine) {
      return;
    }
    const workflows = demoWorkflows();
    const id = `${mode}-${String(Date.now())}`;
    setRunId(id);
    setBanner(
      mode === "notes" ? "Running notes. Pause is the long step." : "Running the charge step.",
    );
    try {
      const handle =
        mode === "charge"
          ? await activeEngine.start(workflows.charge, { id, input: {} })
          : await activeEngine.start(workflows.notes, { id, input: { text: "Hello LarkX" } });
      await handle.result();
      setBanner("Workflow completed on this device.");
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
    await activeEngine.recover();
    setCalls([...sessionCalls()]);
    if (runId) {
      const snapshot = await activeEngine.getRun(runId);
      setBanner(snapshot ? `Run is ${snapshot.status}.` : "Run was not found.");
    }
  }

  async function reconcile(): Promise<void> {
    if (!activeEngine || !runId) {
      return;
    }
    const blocked = observation.steps.find((step) => step.status === "UNKNOWN_OUTCOME");
    if (!blocked) {
      setBanner("No step is waiting for reconciliation.");
      return;
    }
    await activeEngine.reconcileStep(runId, blocked.stepKey, { resolution: "retry" });
    setBanner(`Reconciled ${blocked.stepKey}. Resuming.`);
    try {
      await (await activeEngine.resume(runId)).result();
      setBanner("Reconciled run completed.");
    } catch (error) {
      setBanner(messageFrom(error));
    } finally {
      setCalls([...sessionCalls()]);
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
    const runtime = openReactNativeEngine({
      database: DATABASE,
      workflows: [demoWorkflows().notes, demoWorkflows().charge],
    });
    engineRef.current = runtime;
    const connection = openCloud(runtime);
    driverRef.current = connection.driver;
    rememberCloud(connection.telemetry);
    setEngine(runtime);
    setRunId(null);
    setCalls([]);
    setBanner("Database reset. Previous runs are gone.");
  }

  const current =
    observation.steps.find(
      (step) => step.status === "RUNNING" || step.status === "RETRY_SCHEDULED",
    ) ?? observation.steps[observation.steps.length - 1];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>LarkX</Text>
      <Text style={styles.title}>On-device workflow</Text>
      <Text style={styles.banner}>{banner}</Text>
      <Text style={styles.meta}>
        Network {online === null ? "unknown" : online ? "online" : "offline"}. Local steps do not
        wait for Cloud.
      </Text>

      <View style={styles.row}>
        <ModeButton label="Notes" selected={mode === "notes"} onPress={() => setMode("notes")} />
        <ModeButton label="Charge" selected={mode === "charge"} onPress={() => setMode("charge")} />
      </View>
      <View style={styles.row}>
        <Action label="Start" onPress={() => void start()} />
        <Action label="Recover" onPress={() => void recover()} />
        <Action label="Reconcile" onPress={() => void reconcile()} />
        <Action label="Reset" onPress={() => void reset()} />
        <Action label="Sync" onPress={() => void synchronize()} />
      </View>

      <Card title="Cloud">
        <Fact label="Connection" value={cloud} />
        <Fact label="Run" value={runId ?? "none"} />
        <Fact label="Pending events" value={String(pendingEvents)} />
        <Text style={styles.hint}>
          Set EXPO_PUBLIC_LARKX_CLOUD_ENDPOINT and EXPO_PUBLIC_LARKX_INGESTION_KEY to enable
          metadata sync. The keys are not in this repository.
        </Text>
      </Card>

      <Card title="Run">
        <Fact label="ID" value={runId ?? "none"} />
        <Fact label="Status" value={observation.run?.status ?? "idle"} />
        <Fact
          label="Workflow"
          value={
            observation.run
              ? `${observation.run.workflowName} v${String(observation.run.workflowVersion)}`
              : "none"
          }
        />
        <Fact
          label="Current step"
          value={current ? `${current.stepKey} · ${current.status}` : "none"}
        />
      </Card>

      <Card title="Session invocations">
        <Text style={styles.body}>
          {calls.length === 0
            ? "No handlers have run in this JavaScript session."
            : calls.join("  →  ")}
        </Text>
        <Text style={styles.hint}>A force-quit clears this list. Stored step outputs stay.</Text>
      </Card>

      <Card title="Steps">
        {observation.steps.length === 0 ? <Text style={styles.body}>No steps stored.</Text> : null}
        {observation.steps.map((step) => (
          <View key={step.stepKey} style={styles.step}>
            <Text style={styles.stepTitle}>
              {step.stepOrder + 1}. {step.stepKey}
            </Text>
            <Text style={styles.body}>
              {step.status} · {step.effectType} · attempts {String(step.attemptCount)}
            </Text>
            <Text style={styles.mono}>operation {step.operationId}</Text>
            <Text style={styles.mono}>{JSON.stringify(step.output)}</Text>
          </View>
        ))}
      </Card>

      <Card title="History">
        {observation.history.length === 0 ? <Text style={styles.body}>No events yet.</Text> : null}
        {observation.history.slice(-8).map((event) => (
          <Text key={event.eventId} style={styles.mono}>
            {String(event.sequence).padStart(2, "0")} {event.type}
          </Text>
        ))}
      </Card>
    </ScrollView>
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
      <Text style={styles.modeText}>{label}</Text>
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
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

function messageFrom(error: unknown): string {
  if (error instanceof LarkxError) {
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : "The workflow stopped.";
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#101418" },
  content: { paddingTop: 64, paddingHorizontal: 20, paddingBottom: 48, gap: 14 },
  kicker: { color: "#7dcea0", fontSize: 13, letterSpacing: 1.4, fontWeight: "700" },
  title: { color: "#f4f7f5", fontSize: 28, fontWeight: "700" },
  banner: { color: "#d5e2d8", fontSize: 16, lineHeight: 22 },
  meta: { color: "#8ea197", fontSize: 13, lineHeight: 18 },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  mode: {
    borderColor: "#2c3830",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  modeOn: { backgroundColor: "#1d3b2a", borderColor: "#7dcea0" },
  modeText: { color: "#f4f7f5", fontWeight: "600" },
  action: {
    backgroundColor: "#1c2420",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  actionText: { color: "#f4f7f5", fontWeight: "600" },
  card: { backgroundColor: "#171d1a", borderRadius: 16, padding: 14, gap: 8 },
  cardTitle: { color: "#7dcea0", fontSize: 13, fontWeight: "700", letterSpacing: 0.4 },
  body: { color: "#e7eee9", fontSize: 15, lineHeight: 21 },
  hint: { color: "#8ea197", fontSize: 12, lineHeight: 17 },
  step: { gap: 2, paddingTop: 6 },
  stepTitle: { color: "#f4f7f5", fontSize: 16, fontWeight: "600" },
  mono: {
    color: "#c5d4cb",
    fontSize: 12,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  fact: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  factLabel: { color: "#8ea197", fontSize: 13 },
  factValue: { color: "#f4f7f5", fontSize: 13, flexShrink: 1, textAlign: "right" },
});
