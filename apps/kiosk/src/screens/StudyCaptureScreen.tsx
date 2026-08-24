import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Camera, useCameraDevice, useFrameProcessor } from "react-native-vision-camera";
import { useRunOnJS } from "react-native-worklets-core";
import { useKeepAwake } from "expo-keep-awake";
import { Accelerometer } from "expo-sensors";
import { meanRed } from "@/lib/frame-red";
import { processPpg, type PpgResult } from "@/lib/ppg";
import { supabase } from "@/lib/supabase";
import { loadKioskSession, track } from "@/lib/session";
import { startH10, isH10Available, type H10Session } from "@/lib/h10";
import { useCopy } from "@/lib/i18n";
import { S, T } from "@/lib/theme";

// PHASE 1 ONLY. App.tsx only routes here when session.studyMode is true, and
// every write below is independently rejected by the DB phase gate (0007) if it
// somehow isn't. A validation recording (doc 0.1: 3–10 min) that saves raw
// waveform + raw VIDEO (audio off, Invariant 7), computes time-domain HRV only,
// optionally streams a Polar H10 reference, then collects a 0–10 self-report.
const RECORD_SECONDS = 180; // 3 min; tune within 180–600 to whatever yields the best data (doc 0.1)

type Phase = "prep" | "recording" | "computing" | "selfreport" | "done";

function kstDate(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function StudyCaptureScreen({
  participantId,
  onDone,
}: {
  participantId: string;
  onDone: () => void;
}) {
  const COPY = useCopy();
  useKeepAwake();
  const device = useCameraDevice("back");
  const camera = useRef<Camera>(null);
  const [phase, setPhase] = useState<Phase>("prep");

  // Per-recording metadata the operator sets in prep (doc 1.4). Mirrored into
  // refs because start/finishRecording are []-dep callbacks (they read refs, not
  // closed-over state) — otherwise a changed selection would be read stale.
  const [site, setSiteState] = useState<"finger" | "face">("finger");
  const [ambientLight, setAmbientLightState] = useState<"bright" | "normal" | "dim">("normal");
  const [sessionNo, setSessionNoState] = useState(1);
  const siteRef = useRef<"finger" | "face">("finger");
  const ambientLightRef = useRef<"bright" | "normal" | "dim">("normal");
  const sessionNoRef = useRef(1);
  const setSite = (v: "finger" | "face") => { siteRef.current = v; setSiteState(v); };
  const setAmbientLight = (v: "bright" | "normal" | "dim") => { ambientLightRef.current = v; setAmbientLightState(v); };
  const setSessionNo = (v: number) => { const n = Math.max(1, v); sessionNoRef.current = n; setSessionNoState(n); };

  const redSeries = useRef<number[]>([]);
  const frameTimes = useRef<number[]>([]);
  const accel = useRef<number[]>([]);
  const accelSub = useRef<{ remove: () => void } | null>(null);
  const h10 = useRef<H10Session | null>(null);
  const videoPath = useRef<string | null>(null);
  const recordingId = useRef<string | null>(null);

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

  const startRecording = useCallback(async () => {
    redSeries.current = [];
    frameTimes.current = [];
    accel.current = [];
    const startIso = new Date().toISOString();

    // Reference device (doc 4.x): in-app BLE when a dev build has it, otherwise
    // the center records the H10 independently and aligns offline via the shared
    // start marker. Never blocks the phone capture.
    if (isH10Available()) {
      try { h10.current = await startH10(startIso); } catch { h10.current = null; }
    }

    Accelerometer.setUpdateInterval(50);
    accelSub.current = Accelerometer.addListener(({ x, y, z }) => {
      accel.current.push(Math.sqrt(x * x + y * y + z * z));
    });

    // Raw video (doc 1.1/1.3). audio:false is not enough on its own — the Camera
    // also has audio={false} below so no audio track is ever captured (Inv. 7).
    camera.current?.startRecording({
      onRecordingFinished: (video) => { videoPath.current = video.path; },
      onRecordingError: () => { videoPath.current = null; },
    });

    setPhase("recording");
    setTimeout(() => void finishRecording(startIso), RECORD_SECONDS * 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finishRecording = useCallback(async (startIso: string) => {
    accelSub.current?.remove();
    accelSub.current = null;
    try { await camera.current?.stopRecording(); } catch {}
    const stopped = h10.current;
    if (stopped) { try { await stopped.stop(); } catch {} }
    setPhase("computing");

    const times = frameTimes.current;
    let fs = 30;
    if (times.length > 2) {
      const span = (times[times.length - 1] - times[0]) / 1e9;
      if (span > 0) fs = times.length / span;
    }
    const res: PpgResult = processPpg(redSeries.current, fs, accel.current);

    const session = await loadKioskSession();
    if (!session) { onDone(); return; }
    const stamp = Date.now();

    // Upload raw waveform (ppg-raw) and raw video (ppg-video). Both best-effort;
    // the recording row persists either way with whatever refs succeeded.
    let waveformRef: string | null = null;
    try {
      const path = `${session.centerId}/${participantId}/${stamp}.json`;
      const { error } = await supabase.storage
        .from("ppg-raw")
        .upload(path, JSON.stringify({ fs, red: res.waveform }), { contentType: "application/json" });
      if (!error) waveformRef = path;
    } catch {}

    let videoRef: string | null = null;
    if (videoPath.current) {
      try {
        const uri = videoPath.current.startsWith("file://") ? videoPath.current : `file://${videoPath.current}`;
        const blob = await (await fetch(uri)).blob();
        const path = `${session.centerId}/${participantId}/${stamp}.mp4`;
        const { error } = await supabase.storage.from("ppg-video").upload(path, blob, { contentType: "video/mp4" });
        if (!error) videoRef = path;
      } catch {}
    }

    // Reference stream: upload the H10 RR samples (in-app) into ppg-raw, or mark
    // the recording as awaiting an offline-aligned H10 file.
    let refCapture: "in_app" | "offline" = "offline";
    let refFileRef: string | null = null;
    const refStartMarker = stopped?.startMarker ?? startIso;
    if (stopped && stopped.samples.length) {
      refCapture = "in_app";
      try {
        const path = `${session.centerId}/${participantId}/${stamp}_h10.json`;
        const { error } = await supabase.storage
          .from("ppg-raw")
          .upload(path, JSON.stringify({ startMarker: stopped.startMarker, rr: stopped.samples }), {
            contentType: "application/json",
          });
        if (!error) refFileRef = path;
      } catch {}
    }

    const { data, error } = await supabase
      .from("study_recordings")
      .insert({
        participant_id: participantId,
        device_id: session.deviceId,
        operator_staff_id: session.operatorStaffId,
        recorded_at: startIso,
        local_date: kstDate(),
        duration_s: RECORD_SECONDS,
        fps: fs,
        ppg_site: siteRef.current,
        ambient_light: ambientLightRef.current,
        session_no: sessionNoRef.current,
        device_model: session.deviceLabel,
        hr_bpm: res.hr_bpm,
        mean_rr_ms: res.hr_bpm ? 60000 / res.hr_bpm : null,
        rmssd_ms: res.rmssd_ms,   // time-domain only (doc 0.2)
        sdnn_ms: res.sdnn_ms,
        sqi: res.sqi,
        raw_waveform_ref: waveformRef,
        raw_video_ref: videoRef,
        ref_device: "polar_h10",
        ref_capture: refCapture,
        ref_start_marker: refStartMarker,
        ref_file_ref: refFileRef,
        usable: res.usable,
      })
      .select("id")
      .single();

    if (error || !data) { await track("study_recording_failed"); onDone(); return; }
    recordingId.current = data.id;
    await track("study_recording_ok", { usable: res.usable, ref: refCapture });
    setPhase("selfreport");
  }, [participantId, onDone]);

  // The 0–10 self-report, collected AFTER the recording and joined to it (doc 3.x).
  const submitSelfReport = useCallback(async (value: number) => {
    const rid = recordingId.current;
    if (rid) {
      try {
        await supabase.from("study_self_reports").insert({
          recording_id: rid,
          participant_id: participantId,
          stress_0_10: value,
        });
      } catch {}
    }
    setPhase("done");
    setTimeout(onDone, 1200);
  }, [participantId, onDone]);

  const wrap = (children: React.ReactNode) => (
    <View style={{ flex: 1, backgroundColor: T.bg, alignItems: "center", justifyContent: "center", padding: 24, gap: 20 }}>
      {children}
    </View>
  );

  if (!device) return wrap(<Text style={S.body}>{COPY.common.error}</Text>);

  if (phase === "prep") {
    const pill = (active: boolean, label: string, onPress: () => void, key: string) => (
      <Pressable key={key} onPress={onPress}
        style={{ paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12, backgroundColor: active ? T.amber : T.border }}>
        <Text style={{ fontSize: 18, fontWeight: "700", color: active ? T.ink : T.sub }}>{label}</Text>
      </Pressable>
    );
    return wrap(
      <>
        <Text style={S.h1}>{COPY.study.prepTitle}</Text>
        <Text style={S.body}>{COPY.study.prepBody}</Text>
        <Text style={[S.body, { color: T.sub }]}>{COPY.study.beltHint}</Text>

        <Text style={[S.body, { fontWeight: "700" }]}>{COPY.study.site}</Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {pill(site === "finger", COPY.study.siteFinger, () => setSite("finger"), "finger")}
          {pill(site === "face", COPY.study.siteFace, () => setSite("face"), "face")}
        </View>

        <Text style={[S.body, { fontWeight: "700" }]}>{COPY.study.light}</Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {pill(ambientLight === "bright", COPY.study.lightBright, () => setAmbientLight("bright"), "bright")}
          {pill(ambientLight === "normal", COPY.study.lightNormal, () => setAmbientLight("normal"), "normal")}
          {pill(ambientLight === "dim", COPY.study.lightDim, () => setAmbientLight("dim"), "dim")}
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <Text style={[S.body, { fontWeight: "700" }]}>{COPY.study.session}</Text>
          {pill(true, "−", () => setSessionNo(sessionNo - 1), "dec")}
          <Text style={{ fontSize: 28, fontWeight: "800", color: T.ink, minWidth: 40, textAlign: "center" }}>{sessionNo}</Text>
          {pill(true, "+", () => setSessionNo(sessionNo + 1), "inc")}
        </View>

        <Pressable onPress={() => void startRecording()} style={[S.bigBtn, { backgroundColor: T.amber, width: "100%" }]}>
          <Text style={S.bigBtnText}>{COPY.study.start}</Text>
        </Pressable>
      </>,
    );
  }

  if (phase === "recording") {
    return (
      <View style={{ flex: 1, backgroundColor: T.bg, alignItems: "center", justifyContent: "center", padding: 24, gap: 20 }}>
        <Text style={S.h1}>{COPY.study.recording}</Text>
        <Text style={S.body}>{COPY.study.prepBody}</Text>
        {/* Small live preview; torch on for finger PPG. audio={false} → the raw
            video never carries an audio track (Invariant 7). */}
        <View style={{ width: 120, height: 120, borderRadius: 12, overflow: "hidden" }}>
          <Camera
            ref={camera}
            style={{ width: 120, height: 120 }}
            device={device}
            isActive={true}
            torch="on"
            video={true}
            audio={false}
            frameProcessor={frameProcessor}
            pixelFormat="yuv"
          />
        </View>
      </View>
    );
  }

  if (phase === "computing") {
    return wrap(<><ActivityIndicator size="large" color={T.amber} /><Text style={S.h2}>{COPY.study.recording}</Text></>);
  }

  if (phase === "selfreport") {
    return wrap(
      <>
        <Text style={S.h1}>{COPY.study.feelTitle}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10 }}>
          {Array.from({ length: 11 }, (_, n) => (
            <Pressable
              key={n}
              onPress={() => void submitSelfReport(n)}
              style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: T.amber, alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ fontSize: 24, fontWeight: "800", color: T.ink }}>{n}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", width: "100%" }}>
          <Text style={[S.body, { color: T.sub }]}>{COPY.study.feelLow}</Text>
          <Text style={[S.body, { color: T.sub }]}>{COPY.study.feelHigh}</Text>
        </View>
        <Pressable onPress={onDone} style={[S.bigBtn, { backgroundColor: T.border, width: "100%" }]}>
          <Text style={[S.bigBtnText, { color: T.sub }]}>{COPY.study.skip}</Text>
        </Pressable>
      </>,
    );
  }

  return wrap(<Text style={S.h1}>{COPY.study.saved}</Text>);
}
