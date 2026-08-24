import { Pressable, Text, View } from "react-native";
import { T } from "@/lib/theme";

const FACES = ["😣", "🙁", "😐", "🙂", "😄"];

export function FaceRow({
  labels,
  onSelect,
}: {
  labels: readonly string[];
  onSelect: (v: 1 | 2 | 3 | 4 | 5) => void;
}) {
  return (
    <View style={{ gap: 12, width: "100%" }}>
      {FACES.map((face, i) => (
        <Pressable
          key={i}
          onPress={() => onSelect((i + 1) as 1 | 2 | 3 | 4 | 5)}
          style={({ pressed }) => ({
            flexDirection: "row", alignItems: "center", gap: 16,
            backgroundColor: pressed ? "#fef3c7" : T.card,
            borderColor: T.border, borderWidth: 2, borderRadius: 18,
            paddingHorizontal: 20, paddingVertical: 16, minHeight: 72,
          })}
        >
          <Text style={{ fontSize: 40 }}>{face}</Text>
          <Text style={{ fontSize: 22, fontWeight: "600", color: T.ink }}>{labels[i]}</Text>
        </Pressable>
      ))}
    </View>
  );
}
