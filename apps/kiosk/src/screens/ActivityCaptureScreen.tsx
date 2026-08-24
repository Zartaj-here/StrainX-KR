import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { RosterEntry } from "./RosterScreen";
import { PpgCaptureScreen } from "./PpgCaptureScreen";
import { FaceRow } from "@/components/FaceRow";
import { supabase } from "@/lib/supabase";
import { loadKioskSession } from "@/lib/session";
import { useCopy } from "@/lib/i18n";
import { S, T } from "@/lib/theme";

type Activity = { id: string; name: string; physical_intensity: string };
type Phase = "pre" | "post" | "recovery30";

// Activity before/after/+30 (§8b). The 2-minute settle inside PpgCaptureScreen
// runs identically in every phase — without it the before/after difference is
// posture and exertion, not stress. recovery30 is PPG only.
export function ActivityCaptureScreen({
  participant,
  onDone,
}: {
  participant: RosterEntry;
  onDone: () => void;
}) {
  const COPY = useCopy();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [step, setStep] = useState<"ppg" | "mood" | "energy" | "pain" | "done">("ppg");
  const [ppgId, setPpgId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<{ mood?: number; energy?: number; pain?: number }>({});

  useEffect(() => {
    (async () => {
      const session = await loadKioskSession();
      if (!session) return;
      // Kiosk can read its center's activities (RLS: activities_kiosk_read).
      const { data } = await supabase
        .from("activities")
        .select("id, name, physical_intensity")
        .eq("center_id", session.centerId)
        .order("scheduled_start", { ascending: false })
        .limit(20);
      setActivities((data as Activity[]) ?? []);
    })();
  }, []);

  const saveCapture = async (final: { mood?: number; energy?: number; pain?: number }) => {
    if (!activity || !phase) return;
    await supabase.from("activity_captures").insert({
      activity_id: activity.id,
      participant_id: participant.id,
      phase,
      ppg_reading_id: ppgId,
      mood_1_5: final.mood ?? null,
      energy_1_5: final.energy ?? null,
      pain_1_5: final.pain ?? null,
    });
    setStep("done");
    setTimeout(onDone, 1200);
  };

  // 1) Pick the activity.
  if (!activity) {
    return (
      <View style={{ flex: 1, backgroundColor: T.bg, padding: 24, gap: 14 }}>
        <Text style={S.h1}>{COPY.activity.pickActivity}</Text>
        {activities.map((a) => (
          <Pressable key={a.id} onPress={() => setActivity(a)} style={[S.bigBtn, { backgroundColor: T.amber }]}>
            <Text style={S.bigBtnText}>{a.name}</Text>
          </Pressable>
        ))}
        <Pressable onPress={onDone} style={[S.bigBtn, { backgroundColor: T.border }]}>
          <Text style={[S.bigBtnText, { color: T.sub }]}>{COPY.menu.back}</Text>
        </Pressable>
      </View>
    );
  }

  // 2) Pick the phase.
  if (!phase) {
    return (
      <View style={{ flex: 1, backgroundColor: T.bg, padding: 24, gap: 16, justifyContent: "center" }}>
        <Text style={S.h1}>{activity.name}</Text>
        {(["pre", "post", "recovery30"] as Phase[]).map((ph) => (
          <Pressable key={ph} onPress={() => { setPhase(ph); setStep("ppg"); }} style={[S.bigBtn, { backgroundColor: T.amber }]}>
            <Text style={S.bigBtnText}>
              {ph === "pre" ? COPY.activity.phasePre : ph === "post" ? COPY.activity.phasePost : COPY.activity.phaseRecovery}
            </Text>
          </Pressable>
        ))}
      </View>
    );
  }

  // 3) PPG (byte-identical protocol every phase).
  if (step === "ppg") {
    return (
      <PpgCaptureScreen
        participantId={participant.id}
        context="activity"
        onComplete={(id) => {
          setPpgId(id);
          // recovery30 is PPG only; pre/post also collect a quick self-report.
          if (phase === "recovery30") void saveCapture({});
          else setStep("mood");
        }}
        onCancel={onDone}
      />
    );
  }

  if (step === "mood") {
    return questionView(COPY.activity.howNow, COPY.faces.mood, (v) => { setAnswers((a) => ({ ...a, mood: v })); setStep("energy"); });
  }
  if (step === "energy") {
    return questionView(COPY.activity.energyNow, COPY.faces.energy, (v) => { setAnswers((a) => ({ ...a, energy: v })); setStep("pain"); });
  }
  if (step === "pain") {
    return questionView(COPY.activity.painNow, COPY.faces.pain, (v) => {
      const final = { ...answers, pain: v };
      setAnswers(final);
      void saveCapture(final);
    });
  }

  return (
    <View style={{ flex: 1, backgroundColor: T.bg, alignItems: "center", justifyContent: "center", padding: 24 }}>
      <Text style={S.h1}>{COPY.activity.done}</Text>
    </View>
  );
}

function questionView(title: string, labels: readonly string[], onSelect: (v: 1 | 2 | 3 | 4 | 5) => void) {
  return (
    <View style={{ flex: 1, backgroundColor: T.bg, padding: 24, gap: 20, justifyContent: "center" }}>
      <Text style={S.h1}>{title}</Text>
      <FaceRow labels={labels} onSelect={onSelect} />
    </View>
  );
}
