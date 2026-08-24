import { Pressable, Text, View } from "react-native";
import type { RosterEntry } from "./RosterScreen";
import { useCopy } from "@/lib/i18n";
import { S, T } from "@/lib/theme";

// After a participant is selected: choose PPG, an activity capture, or the
// reaction game. Write-only surface — no history, no trends (Invariant 8).
export function CaptureMenuScreen({
  participant,
  studyMode,
  onPpg,
  onActivity,
  onReaction,
  onStudy,
  onBack,
}: {
  participant: RosterEntry;
  studyMode: boolean;
  onPpg: () => void;
  onActivity: () => void;
  onReaction: () => void;
  onStudy: () => void;
  onBack: () => void;
}) {
  const COPY = useCopy();
  return (
    <View style={{ flex: 1, backgroundColor: T.bg, padding: 24, gap: 18, justifyContent: "center" }}>
      <Text style={S.h1}>{COPY.menu.title(participant.display_name)}</Text>
      <Pressable onPress={onPpg} style={[S.bigBtn, { backgroundColor: T.amber }]}>
        <Text style={S.bigBtnText}>❤️  {COPY.menu.ppg}</Text>
      </Pressable>
      <Pressable onPress={onActivity} style={[S.bigBtn, { backgroundColor: T.amber }]}>
        <Text style={S.bigBtnText}>🎵  {COPY.menu.activity}</Text>
      </Pressable>
      <Pressable onPress={onReaction} style={[S.bigBtn, { backgroundColor: T.amber }]}>
        <Text style={S.bigBtnText}>✨  {COPY.menu.reaction}</Text>
      </Pressable>
      {/* Study capture only exists when the center is in study_mode (Phase 1). */}
      {studyMode ? (
        <Pressable onPress={onStudy} style={[S.bigBtn, { backgroundColor: T.amber }]}>
          <Text style={S.bigBtnText}>🩺  {COPY.menu.healthRecord}</Text>
        </Pressable>
      ) : null}
      <Pressable onPress={onBack} style={[S.bigBtn, { backgroundColor: T.border }]}>
        <Text style={[S.bigBtnText, { color: T.sub }]}>{COPY.menu.back}</Text>
      </Pressable>
    </View>
  );
}
