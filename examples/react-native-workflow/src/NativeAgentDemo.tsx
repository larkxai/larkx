import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  createRuntime,
  defineTool,
  scriptedModel,
  sqlite,
  type RunHistory,
  type RuntimeVersions,
} from "@larkxai/react-native";

const RUN_ID = "native-agent-demo";

const readNotes = defineTool({
  name: "read_notes",
  description: "Read locally stored notes",
  schema: { type: "object", properties: {} },
  effects: "pure",
  handler: () => ({ notes: ["Example note"] }),
});

export function NativeAgentDemo() {
  const [lines, setLines] = useState<readonly string[]>([
    "Native C++ runtime is idle. This screen does not use the TypeScript engine.",
  ]);
  const [busy, setBusy] = useState(false);

  async function demonstrate(): Promise<void> {
    setBusy(true);
    const report: string[] = [];
    try {
      const model = scriptedModel([
        {
          message: null,
          finish: "tool_calls",
          calls: [{ id: "call-1", name: "read_notes", arguments: {} }],
        },
        { message: "Summary: Example note", finish: "stop", calls: [] },
      ]);
      let toolCalls = 0;
      const runtime = await createRuntime({ storage: sqlite() });
      report.push(...versionLines(runtime.versions));
      const agent = runtime.createAgent({
        name: "personal-assistant",
        version: 1,
        model,
        instructions: "Help the user manage daily tasks.",
        tools: [
          defineTool({
            name: readNotes.name,
            description: readNotes.description,
            schema: readNotes.schema,
            effects: readNotes.effects,
            handler: async (input, context) => {
              toolCalls += 1;
              report.push(`Tool ${context.operationId} attempt ${String(context.attempt)}`);
              return readNotes.handler(input, context);
            },
          }),
        ],
      });
      const run = await agent.start({ message: "Summarize my notes", runId: RUN_ID });
      const result = await run.result();
      const history = await run.getHistory();
      const status = await run.getStatus();
      report.push(`Run ${run.runId} ${status.status}`);
      report.push(`Result: ${result.message}`);
      report.push(`This process: model ${String(model.invocations)}, tool ${String(toolCalls)}`);
      report.push(...historyLines(history));
      await runtime.close();

      const recoveredModel = scriptedModel([]);
      let recoveredTools = 0;
      const reopened = await createRuntime({ storage: sqlite() });
      reopened.createAgent({
        name: "personal-assistant",
        version: 1,
        model: recoveredModel,
        instructions: "Help the user manage daily tasks.",
        tools: [
          defineTool({
            name: "read_notes",
            description: "Read locally stored notes",
            schema: { type: "object", properties: {} },
            effects: "pure",
            handler: () => {
              recoveredTools += 1;
              return { notes: ["Example note"] };
            },
          }),
        ],
      });
      const recovered = await reopened.resume(RUN_ID);
      const replayed = await recovered.result();
      const replayStatus = await recovered.getStatus();
      report.push(`Reopened ${recovered.runId} ${replayStatus.status}`);
      report.push(`Recovered result: ${replayed.message}`);
      report.push(
        `After reopen, this process called the model ${String(recoveredModel.invocations)} times and the tool ${String(recoveredTools)} times.`,
      );
      report.push("Committed operations were not repeated.");
      await reopened.close();
    } catch (error) {
      report.push(error instanceof Error ? error.message : "The native runtime stopped.");
    } finally {
      setLines(report);
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>Native C++ core</Text>
      <Text style={styles.title}>Scripted agent</Text>
      <Text style={styles.body}>
        Development build required. Expo Go cannot load the C++ module, and this demo does not fall
        back to the TypeScript engine.
      </Text>
      <Pressable disabled={busy} onPress={() => void demonstrate()} style={styles.action}>
        <Text style={styles.actionText}>{busy ? "Running" : "Run native agent"}</Text>
      </Pressable>
      {lines.map((line) => (
        <Text key={line} style={styles.mono}>
          {line}
        </Text>
      ))}
    </View>
  );
}

function versionLines(versions: RuntimeVersions): string[] {
  return [
    "Execution backend: Native C++",
    `Native core ABI ${String(versions.abi)}`,
    `Protocol ${String(versions.protocol)} · schema ${String(versions.schema)}`,
  ];
}

function historyLines(history: RunHistory): string[] {
  return history.steps.map((step) => `${step.stepKey} ${step.status} ${step.operationId}`);
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#17211c", borderRadius: 16, padding: 14, gap: 8 },
  kicker: { color: "#7dcea0", fontSize: 13, fontWeight: "700", letterSpacing: 0.4 },
  title: { color: "#f4f7f5", fontSize: 20, fontWeight: "700" },
  body: { color: "#d5e2d8", fontSize: 14, lineHeight: 20 },
  action: {
    alignSelf: "flex-start",
    backgroundColor: "#1d3b2a",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  actionText: { color: "#f4f7f5", fontWeight: "600" },
  mono: { color: "#c5d4cb", fontSize: 12, lineHeight: 18 },
});
