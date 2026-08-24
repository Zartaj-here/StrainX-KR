"use client";

// On-device voice feature extraction (Invariant 7): the recording NEVER
// leaves the device. We record <=20s, decode to PCM in memory, extract
// features, insert ONLY the features, and drop every reference to the audio.
// There is no upload path — no storage bucket for audio exists in the
// project, by design.
//
// The features are exploratory (open item 4 in the handoff): f0 via
// autocorrelation, jitter/shimmer from period-to-period variation, an HNR
// approximation from the autocorrelation peak, pause ratio + rate from an
// energy envelope. Good enough to learn whether the channel is worth keeping.

export type VoiceFeatures = {
  f0_mean: number | null;
  f0_sd: number | null;
  jitter: number | null;
  shimmer: number | null;
  hnr: number | null;
  speech_rate: number | null;
  articulation_rate: number | null;
  pause_ratio: number | null;
  snr_db: number | null;
  usable: boolean;
};

const FRAME_MS = 40;
const F0_MIN = 60;
const F0_MAX = 400;

export async function recordAndExtract(maxSeconds = 20): Promise<VoiceFeatures | null> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);

  const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
  recorder.start();
  await new Promise((r) => setTimeout(r, maxSeconds * 1000));
  if (recorder.state !== "inactive") recorder.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());

  const blob = new Blob(chunks);
  const buf = await blob.arrayBuffer();
  const ctx = new AudioContext();
  try {
    const audio = await ctx.decodeAudioData(buf);
    const pcm = audio.getChannelData(0);
    return extractFeatures(pcm, audio.sampleRate);
  } catch {
    return null;
  } finally {
    void ctx.close();
    // chunks/blob/buf go out of scope here; nothing was persisted or sent.
  }
}

export function extractFeatures(pcm: Float32Array, sr: number): VoiceFeatures {
  const frameLen = Math.round((FRAME_MS / 1000) * sr);
  const nFrames = Math.floor(pcm.length / frameLen);
  if (nFrames < 10) {
    return {
      f0_mean: null, f0_sd: null, jitter: null, shimmer: null, hnr: null,
      speech_rate: null, articulation_rate: null, pause_ratio: null,
      snr_db: null, usable: false,
    };
  }

  const rms: number[] = [];
  for (let i = 0; i < nFrames; i++) {
    let acc = 0;
    for (let j = 0; j < frameLen; j++) {
      const v = pcm[i * frameLen + j];
      acc += v * v;
    }
    rms.push(Math.sqrt(acc / frameLen));
  }

  // Voiced/silence split: threshold between noise floor and speech level.
  const sorted = [...rms].sort((a, b) => a - b);
  const noiseFloor = sorted[Math.floor(sorted.length * 0.1)] || 1e-6;
  const speechLevel = sorted[Math.floor(sorted.length * 0.9)] || 1e-6;
  const thresh = Math.max(noiseFloor * 3, speechLevel * 0.15);
  const voiced = rms.map((v) => v > thresh);
  const voicedCount = voiced.filter(Boolean).length;
  const pauseRatio = 1 - voicedCount / nFrames;
  const snrDb = 20 * Math.log10(speechLevel / Math.max(noiseFloor, 1e-9));

  // Per-frame f0 by autocorrelation on voiced frames.
  const minLag = Math.floor(sr / F0_MAX);
  const maxLag = Math.ceil(sr / F0_MIN);
  const f0s: number[] = [];
  const peakAmps: number[] = [];
  const acPeaks: number[] = [];
  for (let i = 0; i < nFrames; i++) {
    if (!voiced[i]) continue;
    const start = i * frameLen;
    let bestLag = 0;
    let bestCorr = 0;
    let energy = 0;
    for (let j = 0; j < frameLen; j++) energy += pcm[start + j] ** 2;
    if (energy === 0) continue;
    for (let lag = minLag; lag <= maxLag && start + frameLen + lag < pcm.length; lag++) {
      let corr = 0;
      for (let j = 0; j < frameLen; j++) corr += pcm[start + j] * pcm[start + j + lag];
      corr /= energy;
      if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
    }
    if (bestLag > 0 && bestCorr > 0.3) {
      f0s.push(sr / bestLag);
      acPeaks.push(Math.min(bestCorr, 0.999));
      let peak = 0;
      for (let j = 0; j < frameLen; j++) peak = Math.max(peak, Math.abs(pcm[start + j]));
      peakAmps.push(peak);
    }
  }

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const sdOf = (xs: number[]) => {
    const m = mean(xs);
    return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
  };
  const relDelta = (xs: number[]) => {
    if (xs.length < 3) return null;
    let acc = 0;
    for (let i = 1; i < xs.length; i++) acc += Math.abs(xs[i] - xs[i - 1]);
    return acc / (xs.length - 1) / mean(xs);
  };

  const f0Mean = f0s.length >= 5 ? mean(f0s) : null;
  const f0Sd = f0s.length >= 5 ? sdOf(f0s) : null;
  const periods = f0s.map((f) => 1 / f);
  const jitter = relDelta(periods);
  const shimmer = relDelta(peakAmps);
  const hnr = acPeaks.length
    ? mean(acPeaks.map((r) => 10 * Math.log10(r / (1 - r))))
    : null;

  // Rate: voiced-region onsets as a syllable proxy.
  let onsets = 0;
  for (let i = 1; i < nFrames; i++) if (voiced[i] && !voiced[i - 1]) onsets++;
  const totalSec = (nFrames * FRAME_MS) / 1000;
  const voicedSec = (voicedCount * FRAME_MS) / 1000;
  const speechRate = totalSec > 0 ? onsets / totalSec : null;
  const articulationRate = voicedSec > 0 ? onsets / voicedSec : null;

  const usable = f0Mean != null && snrDb > 10 && pauseRatio < 0.95;

  return {
    f0_mean: f0Mean, f0_sd: f0Sd,
    jitter, shimmer, hnr,
    speech_rate: speechRate, articulation_rate: articulationRate,
    pause_ratio: pauseRatio, snr_db: snrDb, usable,
  };
}
