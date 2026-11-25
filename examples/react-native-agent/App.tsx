import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { FieldInspection } from "./src/FieldInspection";
import { NativeAgentDemo } from "./src/NativeAgentDemo";

type Screen = "scripted" | "field";

export function App() {
  const [screen, setScreen] = useState<Screen>("scripted");
  return (
    <View style={styles.page}>
      <View style={styles.switcher}>
        <Tab
          label="Scripted agent"
          selected={screen === "scripted"}
          onPress={() => setScreen("scripted")}
        />
        <Tab
          label="Field inspection"
          selected={screen === "field"}
          onPress={() => setScreen("field")}
        />
      </View>
      {screen === "scripted" ? <NativeAgentDemo /> : <FieldInspection />}
    </View>
  );
}

function Tab({
  label,
  selected,
  onPress,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, selected ? styles.tabSelected : null]}>
      <Text style={styles.tabLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f6f3ec" },
  switcher: { flexDirection: "row", gap: 8, padding: 16, paddingBottom: 0 },
  tab: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: "#e7e1d6" },
  tabSelected: { backgroundColor: "#1f6b4a" },
  tabLabel: { color: "#1c1915", fontWeight: "600" },
});
