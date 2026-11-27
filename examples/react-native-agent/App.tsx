import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { FieldInspection } from "./src/FieldInspection";
import { NativeAgentDemo } from "./src/NativeAgentDemo";

type Screen = "field" | "lab";

export function App() {
  const [screen, setScreen] = useState<Screen>("field");
  if (screen === "lab") {
    return (
      <View style={styles.page}>
        <Pressable onPress={() => setScreen("field")} style={styles.back}>
          <Text style={styles.backText}>Back to field inspection</Text>
        </Pressable>
        <NativeAgentDemo />
      </View>
    );
  }
  return <FieldInspection onOpenLab={() => setScreen("lab")} />;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#10140f", paddingTop: 48 },
  back: { paddingHorizontal: 20, paddingBottom: 8 },
  backText: { color: "#c6f26d", fontWeight: "700" },
});
