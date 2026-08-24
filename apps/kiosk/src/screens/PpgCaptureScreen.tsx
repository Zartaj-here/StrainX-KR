import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Camera, useCameraDevice, useFrameProcessor } from "react-native-vision-camera";
import { useRunOnJS } from "react-native-worklets-core";
import * as Haptics from "expo-haptics";
import { useKeepAwake } from "expo-keep-awake";
import { Accelerometer } from "expo-sensors";
import { Timer } from "@/components/Timer";
import { meanRed } from "@/lib/frame-red";
import { processPpg, SQI_THRESHOLD, type PpgResult } from "@/lib/ppg";
import { supabase } from "@/lib/supabase";
import { loadKioskSession, track } from "@/lib/session";
import { useCopy } from "@/lib/i18n";
import { S, T } from "@/lib/theme";

const CAPTURE_SECONDS = 60;
const HAND_RUB_SECONDS = 10;
const SETTLE_SECONDS = 120; // 2 minutes; the DB also enforces settle_seconds >= 120

type Phase = "rub" | "settle" | "capture" | "computing" | "done" | "retry";

// context: 'daily' for a standalone reading, 'activity' when launched from an
// activity capture (pre/post/+30). onComplete hands the stored reading id back
// so the activity flow can attach it.
export function PpgCaptureScreen({
  participantId,
  context,
  onComplete,
  onCancel,
}: {
  participantId: string;
  context: "daily" | "activity";
  onComplete: (ppgReadingId: string | null, result: PpgResult | null) => void;
  onCancel: () => void;
}) {
  const COPY = useCopy();
  useKeepAwake();
  const device = useCameraDevice("back");
  const [phase, setPhase] = useState<Phase>("rub");
  const [result, setResult] = useState<PpgResult | null>(null);

  const redSeries = useRef<number[]>([]);
  const frameTimes = useRef<number[]>([]);
  const accel = useRef<number[]>([]);
  const accelSub = useRef<{ remove: () => void } | null>(null);
  const captureStart = useRef<number>(0);

  const pushRed = useRunOnJS((value: number, ts: number) => {
    redSeries.current.push(value);
    frameTimes.current.push(ts);
  }, []);

  const frameProcessor = useFrameProcessor((frame) => {
    "worklet";
    if (frame.pixelFormat === "unknown") return;
    const r = meanRed(frame);
    pushRed(r, frame.timestamp);
  }, [pushRed]);

  const startCapture = useCallback(async () => {
    redSeries.current = [];
    frameTimes.current = [];
    accel.current = [];
    captureStart.current = Date.now();
    Accelerometer.setUpdateInterval(50);
    accelSub.current = Accelerometer.addListener(({ x, y, z }) => {
      accel.current.push(Math.sqrt(x * x + y * y + z * z));
    });
    setPhase("capture");
  }, []);

  const finishCapture = useCallback(async () => {
    accelSub.current?.remove();
    accelSub.current = null;
    setPhase("computing");

    // Effective sampling rate from actual frame timestamps (nominal 30fps).
    const times = frameTimes.current;
    let fs = 30;
    if (times.length > 2) {
      const span = (times[times.length - 1] - times[0]) / 1e9; // ns -> s
      if (span > 0) fs = times.length / span;
    }
    const res = processPpg(redSeries.current, fs, accel.current);
    setResult(res);

    if (res.hr_bpm == null || res.sqi < SQI_THRESHOLD) {
      // Never store a bad read as a good one — discard and offer a retry (§8a).
      await track("ppg_failed_sqi", { sqi: res.sqi, motion: res.motion_index });
      setPhase("retry");
      return;
    }

    const session = await loadKioskSession();
    if (!session) { onComplete(null, res); return; }

    // Upload the raw waveform (the only way to fix the algorithm later, §8a).
    let waveformRef: string | null = null;
    try {
      const path = `${session.centerId}/${participantId}/${Date.now()}.json`;
      const { error: upErr } = await supabase.storage
        .from("ppg-raw")
        .upload(path, JSON.stringify({ fs, red: res.waveform }), {
          contentType: "application/json",
        });
      if (!upErr) waveformRef = path;
    } catch {
      // waveform upload is best-effort; the metrics still persist
    }

    const { data, error } = await supabase
      .from("ppg_readings")
      .insert({
        participant_id: participantId,
        device_id: session.deviceId,
        operator_staff_id: session.operatorStaffId,
        context,
        settle_seconds: SETTLE_SECONDS,
        hr_bpm: res.hr_bpm,
        rmssd_ms: res.rmssd_ms,
        sdnn_ms: res.sdnn_ms,
        pnn50: res.pnn50,
        resp_rate: res.resp_rate,
        perfusion_index: res.perfusion_index,
        sqi: res.sqi,
        motion_index: res.motion_index,
        usable: res.usable, // DB ppg_af_gate may still force this false for AF
        raw_waveform_ref: waveformRef,
      })
      .select("id")
      .single();

    await track("ppg_ok", { sqi: res.sqi });
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPhase("done");
    setTimeout(() => onComplete(data?.id ?? null, res), 1200);
  }, [context, participantId, onComplete]);

  const wrap = (children: React.ReactNode) => (
    <View style={{ flex: 1, backgroundColor: T.bg, alignItems: "center", justifyContent: "center", padding: 24, gap: 24 }}>
      {children}
    </View>
  );

  if (!device) {
    return wrap(<Text style={S.body}>{COPY.common.error}</Text>);
  }

  if (phase === "rub") {
    return wrap(
      <Timer seconds={HAND_RUB_SECONDS} label={COPY.ppg.rubTitle} body={COPY.ppg.rubBody}
        onDone={() => setPhase("settle")} />,
    );
  }

  if (phase === "settle") {
    return wrap(
      <Timer seconds={SETTLE_SECONDS} label={COPY.ppg.settleTitle} body={COPY.ppg.settleBody}
        onDone={() => void startCapture()} />,
    );
  }

  if (phase === "capture") {
    return (
      <View style={{ flex: 1, backgroundColor: T.bg, alignItems: "center", justifyContent: "center", padding: 24, gap: 20 }}>
        <Text style={S.h1}>{COPY.ppg.captureTitle}</Text>
        <Text style={S.body}>{COPY.ppg.captureBody}</Text>
        {/* Hidden camera: torch on, frames feed the processor. */}
        <View style={{ width: 1, height: 1, overflow: "hidden" }}>
          <Camera
            style={{ width: 1, height: 1 }}
            device={device}
            isActive={true}
            torch="on"
            frameProcessor={frameProcessor}
            pixelFormat="yuv"
          />
        </View>
        <CaptureRing seconds={CAPTURE_SECONDS} onDone={() => void finishCapture()} />
      </View>
    );
  }

  if (phase === "computing") {
    return wrap(
      <>
        <ActivityIndicator size="large" color={T.amber} />
        <Text style={S.h2}>{COPY.ppg.computing}</Text>
      </>,
    );
  }

  if (phase === "done") {
    return wrap(<Text style={S.h1}>{COPY.ppg.good}</Text>);
  }

  // retry
  return wrap(
    <>
      <Text style={S.h1}>{COPY.ppg.retryTitle}</Text>
      <Text style={S.body}>{COPY.ppg.retryBody}</Text>
      <Pressable onPress={() => setPhase("rub")} style={[S.bigBtn, { backgroundColor: T.amber, width: "100%" }]}>
        <Text style={S.bigBtnText}>{COPY.ppg.retry}</Text>
      </Pressable>
      <Pressable onPress={onCancel} style={[S.bigBtn, { backgroundColor: T.border, width: "100%" }]}>
        <Text style={[S.bigBtnText, { color: T.sub }]}>{COPY.ppg.giveUp}</Text>
      </Pressable>
    </>,
  );
}

// A 60-second progress ring during the actual reading.
function CaptureRing({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const [left, setLeft] = useState(seconds);
  const done = useRef(false);
  useMemo(() => {
    const started = Date.now();
    const id = setInterval(() => {
      const remaining = Math.max(0, seconds - Math.floor((Date.now() - started) / 1000));
      setLeft(remaining);
      if (remaining === 0 && !done.current) { done.current = true; clearInterval(id); onDone(); }
    }, 250);
    return id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pct = 1 - left / seconds;
  return (
    <View style={{ width: 220, height: 220, borderRadius: 110, borderWidth: 16, borderColor: T.border, alignItems: "center", justifyContent: "center" }}>
      <View style={{ position: "absolute", width: 220, height: 220, borderRadius: 110, borderWidth: 16, borderColor: T.amber, opacity: 0.2 + pct * 0.8 }} />
      <Text style={{ fontSize: 64, fontWeight: "800", color: T.ink }}>{left}</Text>
    </View>
  );
}
