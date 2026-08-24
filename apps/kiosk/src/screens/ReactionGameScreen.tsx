import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import type { RosterEntry } from "./RosterScreen";
import { supabase } from "@/lib/supabase";
import { loadKioskSession } from "@/lib/session";
import { useCopy } from "@/lib/i18n";
import { S, T } from "@/lib/theme";

// Reaction-time task, framed as a game (zero physical risk) — Phase 0's only
// functional task. Invariant 6: a raw task time is NEVER shown to the
// participant. We store the median internally (functional_tasks, task=
// 'reaction') and show only praise. The DB phase gate rejects every OTHER
// task type, so this screen can only ever write 'reaction'.
const ROUNDS = 5;

type State = "idle" | "waiting" | "go" | "tooSoon" | "done";

export function ReactionGameScreen({
  participant,
  onDone,
}: {
  participant: RosterEntry;
  onDone: () => void;
}) {
  const COPY = useCopy();
  const [state, setState] = useState<State>("idle");
  const [round, setRound] = useState(0);
  const times = useRef<number[]>([]);
  const goAt = useRef<number>(0);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPending = () => { if (timeout.current) clearTimeout(timeout.current); };

  const startRound = () => {
    setState("waiting");
    // Random 1.5–4.5s delay before green (no fixed observation window).
    const delay = 1500 + Math.floor(Math.random() * 3000);
    clearPending();
    timeout.current = setTimeout(() => {
      goAt.current = Date.now();
      setState("go");
    }, delay);
  };

  const onTap = () => {
    if (state === "waiting") {
      clearPending();
      setState("tooSoon");
      setTimeout(startRound, 900);
      return;
    }
    if (state === "go") {
      const rt = Date.now() - goAt.current;
      times.current.push(rt);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const next = round + 1;
      setRound(next);
      if (next >= ROUNDS) void finish();
      else startRound();
    }
  };

  const finish = async () => {
    setState("done");
    const sorted = [...times.current].sort((a, b) => a - b);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
    const mean = sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : null;
    const session = await loadKioskSession();
    if (session && median != null) {
      // Only the aggregate metrics are stored, never surfaced to the person.
      await supabase.from("functional_tasks").insert({
        participant_id: participant.id,
        device_id: session.deviceId,
        task: "reaction",
        metrics: { median_ms: median, mean_ms: mean, n: sorted.length },
        usable: sorted.length >= 3,
      });
    }
    setTimeout(onDone, 1600);
  };

  useEffect(() => () => clearPending(), []);

  const bg =
    state === "go" ? T.greenGo :
    state === "tooSoon" ? T.danger :
    state === "waiting" ? "#3b3b3b" : T.bg;
  const isDark = state === "go" || state === "tooSoon" || state === "waiting";
  const textColor = isDark ? "#fff" : T.ink;

  return (
    <Pressable onPress={onTap} disabled={state === "idle" || state === "done"} style={{ flex: 1, backgroundColor: bg, alignItems: "center", justifyContent: "center", padding: 24, gap: 20 }}>
      {state === "idle" && (
        <>
          <Text style={S.h1}>{COPY.reaction.title}</Text>
          <Text style={S.body}>{COPY.reaction.explain}</Text>
          <Pressable onPress={startRound} style={[S.bigBtn, { backgroundColor: T.amber, minWidth: 200 }]}>
            <Text style={S.bigBtnText}>{COPY.reaction.start}</Text>
          </Pressable>
        </>
      )}
      {state === "waiting" && <Text style={[S.h1, { color: textColor }]}>{COPY.reaction.wait}</Text>}
      {state === "go" && <Text style={[S.h1, { color: textColor, fontSize: 48 }]}>{COPY.reaction.tap}</Text>}
      {state === "tooSoon" && <Text style={[S.h1, { color: textColor }]}>{COPY.reaction.tooSoon}</Text>}
      {state === "done" && <Text style={S.h1}>{COPY.reaction.done}</Text>}
      {(state === "waiting" || state === "go") && (
        <Text style={{ color: textColor, fontSize: 20 }}>{COPY.reaction.round(round + 1, ROUNDS)}</Text>
      )}
    </Pressable>
  );
}
