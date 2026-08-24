import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { S, T } from "@/lib/theme";

// An enforced countdown. The hand-rub and the 2-minute settle both use this;
// neither can be skipped or shortened (§8a). onDone fires exactly once.
export function Timer({
  seconds,
  label,
  body,
  onDone,
}: {
  seconds: number;
  label: string;
  body: string;
  onDone: () => void;
}) {
  const [left, setLeft] = useState(seconds);
  const done = useRef(false);

  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - started) / 1000);
      const remaining = Math.max(0, seconds - elapsed);
      setLeft(remaining);
      if (remaining === 0 && !done.current) {
        done.current = true;
        clearInterval(id);
        onDone();
      }
    }, 250);
    return () => clearInterval(id);
    // seconds is fixed per mount; onDone is stable enough for this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pct = 1 - left / seconds;
  return (
    <View style={{ alignItems: "center", gap: 20 }}>
      <Text style={S.h1}>{label}</Text>
      <Text style={S.body}>{body}</Text>
      <View style={{
        width: 180, height: 180, borderRadius: 90, borderWidth: 14,
        borderColor: T.border, alignItems: "center", justifyContent: "center",
      }}>
        <View style={{
          position: "absolute", width: 180, height: 180, borderRadius: 90,
          borderWidth: 14, borderColor: T.amber, opacity: 0.25 + pct * 0.75,
        }} />
        <Text style={{ fontSize: 56, fontWeight: "800", color: T.ink }}>{left}</Text>
      </View>
    </View>
  );
}
