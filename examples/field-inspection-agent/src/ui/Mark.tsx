import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

export function Mark() {
  return (
    <View style={styles.wrap}>
      <View style={styles.wing} />
      <View style={styles.fold} />
      <View style={styles.core} />
    </View>
  );
}

export function RunningMark() {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return (
    <Animated.View style={[styles.dot, { transform: [{ rotate }] }]}>
      <View style={styles.dotArm} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 22, width: 22 },
  wing: {
    position: "absolute",
    top: 2,
    left: 1,
    height: 0,
    width: 0,
    borderLeftWidth: 9,
    borderRightWidth: 3,
    borderBottomWidth: 16,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#d6f56a",
    transform: [{ rotate: "-28deg" }],
  },
  fold: {
    position: "absolute",
    top: 3,
    left: 8,
    height: 0,
    width: 0,
    borderLeftWidth: 4,
    borderRightWidth: 8,
    borderBottomWidth: 14,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#b6e24a",
    transform: [{ rotate: "24deg" }],
  },
  core: {
    position: "absolute",
    top: 8,
    left: 7,
    height: 0,
    width: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#243028",
  },
  dot: {
    height: 14,
    width: 14,
    borderRadius: 7,
    borderColor: "#d6f56a",
    borderWidth: 1.5,
    alignItems: "center",
  },
  dotArm: {
    height: 5,
    width: 1.5,
    backgroundColor: "#d6f56a",
  },
});
