// PPG signal processing (§8a) — the core technical component.
//
// Input: per-frame mean red-channel values (~30 fps, torch on) plus a parallel
// accelerometer magnitude series sampled throughout the capture. Output: HR +
// HRV metrics and an SQI that decides whether the read is usable.
//
// Pipeline: bandpass 0.5–4 Hz -> peak detection -> IBI series -> ectopic beat
// removal -> hr/rmssd/sdnn/pnn50/resp_rate/perfusion_index, with motion folded
// directly into SQI. A bad read is NEVER stored as a good one — the caller
// discards and offers a retry when usable is false (that decision is the SQI
// threshold below).

export type PpgResult = {
  hr_bpm: number | null;
  rmssd_ms: number | null;
  sdnn_ms: number | null;
  pnn50: number | null;
  resp_rate: number | null;
  perfusion_index: number | null;
  sqi: number;
  motion_index: number;
  usable: boolean;
  // The raw waveform is uploaded separately and referenced; it is the only way
  // to fix the algorithm after the fact (§8a).
  waveform: number[];
};

export const SQI_THRESHOLD = 0.6;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const sd = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

/** First-order Butterworth-style bandpass via cascaded high/low pass. */
function bandpass(signal: number[], fs: number, lo: number, hi: number): number[] {
  const highPassed = onePoleHighPass(signal, fs, lo);
  return onePoleLowPass(highPassed, fs, hi);
}
function onePoleLowPass(x: number[], fs: number, fc: number): number[] {
  const dt = 1 / fs;
  const rc = 1 / (2 * Math.PI * fc);
  const alpha = dt / (rc + dt);
  const y = new Array(x.length).fill(0);
  y[0] = x[0];
  for (let i = 1; i < x.length; i++) y[i] = y[i - 1] + alpha * (x[i] - y[i - 1]);
  return y;
}
function onePoleHighPass(x: number[], fs: number, fc: number): number[] {
  const dt = 1 / fs;
  const rc = 1 / (2 * Math.PI * fc);
  const alpha = rc / (rc + dt);
  const y = new Array(x.length).fill(0);
  y[0] = 0;
  for (let i = 1; i < x.length; i++) y[i] = alpha * (y[i - 1] + x[i] - x[i - 1]);
  return y;
}

/** Adaptive peak detection: local maxima above a moving RMS threshold, with a
 *  physiological refractory period (min 0.33s ~ 180 bpm ceiling). */
function detectPeaks(x: number[], fs: number): number[] {
  const win = Math.round(fs * 0.75);
  const refractory = Math.round(fs * 0.33);
  const peaks: number[] = [];
  let last = -Infinity;
  for (let i = 1; i < x.length - 1; i++) {
    const from = Math.max(0, i - win);
    const to = Math.min(x.length, i + win);
    const local = x.slice(from, to);
    const thresh = mean(local) + 0.5 * sd(local);
    if (x[i] > x[i - 1] && x[i] >= x[i + 1] && x[i] > thresh && i - last > refractory) {
      peaks.push(i);
      last = i;
    }
  }
  return peaks;
}

/** Remove ectopic/artefact beats: IBIs deviating >20% from the local median. */
function cleanIbis(ibisMs: number[]): number[] {
  if (ibisMs.length < 3) return ibisMs;
  const out: number[] = [];
  for (let i = 0; i < ibisMs.length; i++) {
    const from = Math.max(0, i - 2);
    const to = Math.min(ibisMs.length, i + 3);
    const window = [...ibisMs.slice(from, to)].sort((a, b) => a - b);
    const med = window[Math.floor(window.length / 2)];
    if (Math.abs(ibisMs[i] - med) <= 0.2 * med) out.push(ibisMs[i]);
  }
  return out;
}

/** Periodicity: the strongest normalized autocorrelation at a physiologically
 *  plausible pulse lag (0.33–1.5s ≈ 40–180 bpm). This is the primary way to
 *  tell a real, repeating pulse from broadband noise or a motion artefact —
 *  noise has no dominant lag, so this collapses toward 0 and the read is
 *  rejected. Perfusion/amplitude alone can NOT do this (loud noise has big
 *  amplitude), which is exactly the failure this guards against. */
function periodicity(x: number[], fs: number): number {
  const m = mean(x);
  const c = x.map((v) => v - m);
  let denom = 0;
  for (const v of c) denom += v * v;
  if (denom === 0) return 0;
  const minLag = Math.floor(fs * 0.33);
  const maxLag = Math.ceil(fs * 1.5);
  let best = 0;
  for (let lag = minLag; lag <= maxLag && lag < c.length; lag++) {
    let num = 0;
    for (let i = 0; i + lag < c.length; i++) num += c[i] * c[i + lag];
    const r = num / denom;
    if (r > best) best = r;
  }
  return Math.max(0, Math.min(1, best));
}

/** Respiratory rate from RSA: dominant frequency of the IBI tachogram, in the
 *  0.1–0.4 Hz respiratory band, expressed as breaths/min. */
function respRateFromIbis(ibisMs: number[]): number | null {
  if (ibisMs.length < 8) return null;
  const m = mean(ibisMs);
  const centered = ibisMs.map((v) => v - m);
  // Mean IBI gives the tachogram's effective sampling interval.
  const fsTach = 1000 / m; // samples per second
  let bestFreq = 0;
  let bestPow = 0;
  for (let f = 0.1; f <= 0.4; f += 0.01) {
    let re = 0, im = 0;
    for (let n = 0; n < centered.length; n++) {
      const ang = (2 * Math.PI * f * n) / fsTach;
      re += centered[n] * Math.cos(ang);
      im -= centered[n] * Math.sin(ang);
    }
    const pow = re * re + im * im;
    if (pow > bestPow) { bestPow = pow; bestFreq = f; }
  }
  return bestFreq > 0 ? bestFreq * 60 : null;
}

export function processPpg(
  redSeries: number[],
  fs: number,
  accelMagnitude: number[],
): PpgResult {
  // Motion index: normalized accelerometer variability during the capture.
  // Fed directly into SQI (§8a: "Sample the accelerometer throughout").
  const motionIndex = accelMagnitude.length ? Math.min(1, sd(accelMagnitude) / 0.15) : 0;

  const empty = (sqi: number): PpgResult => ({
    hr_bpm: null, rmssd_ms: null, sdnn_ms: null, pnn50: null,
    resp_rate: null, perfusion_index: null,
    sqi, motion_index: motionIndex, usable: false, waveform: redSeries,
  });

  if (redSeries.length < fs * 10) return empty(0); // need >=10s of signal

  // Perfusion index: AC/DC ratio of the raw red channel (peripheral perfusion).
  const dc = mean(redSeries);
  const acAmp = Math.max(...redSeries) - Math.min(...redSeries);
  const perfusionIndex = dc > 0 ? acAmp / dc : 0;

  const filtered = bandpass(redSeries, fs, 0.5, 4);
  const peaks = detectPeaks(filtered, fs);
  if (peaks.length < 6) return empty(0.2);

  const rawIbis: number[] = [];
  for (let i = 1; i < peaks.length; i++) rawIbis.push(((peaks[i] - peaks[i - 1]) / fs) * 1000);
  const ibis = cleanIbis(rawIbis);
  if (ibis.length < 5) return empty(0.3);

  const meanIbi = mean(ibis);
  const hr = 60000 / meanIbi;

  // HRV time-domain metrics.
  const diffs = ibis.slice(1).map((v, i) => v - ibis[i]);
  const rmssd = Math.sqrt(mean(diffs.map((d) => d * d)));
  const sdnn = sd(ibis);
  const nn50 = diffs.filter((d) => Math.abs(d) > 50).length;
  const pnn50 = diffs.length ? nn50 / diffs.length : 0;
  const respRate = respRateFromIbis(ibis);

  // SQI: periodicity is the dominant term (it separates a real pulse from
  // noise), combined with IBI plausibility, beat regularity, ectopic rate, and
  // motion. Perfusion is a floor gate below (finger-present), NOT a positive
  // score — loud noise has high amplitude but no periodicity, and must fail.
  const period = periodicity(filtered, fs);
  const ibiPlausible = ibis.filter((v) => v >= 333 && v <= 1500).length / ibis.length;
  const ectopicRate = 1 - ibis.length / rawIbis.length;
  const regularity = 1 - Math.min(1, sdnn / meanIbi); // lower relative SDNN => steadier
  const fingerPresent = perfusionIndex >= 0.02 ? 1 : 0; // near-flat => no finger
  const sqi = clamp(
    fingerPresent * (
      0.50 * period +
      0.20 * ibiPlausible +
      0.15 * regularity +
      0.10 * (1 - ectopicRate) +
      0.05 * (1 - motionIndex)
    ),
  );

  return {
    hr_bpm: round(hr, 1),
    rmssd_ms: round(rmssd, 1),
    sdnn_ms: round(sdnn, 1),
    pnn50: round(pnn50, 3),
    resp_rate: respRate == null ? null : round(respRate, 1),
    perfusion_index: round(perfusionIndex, 4),
    sqi: round(sqi, 3),
    motion_index: round(motionIndex, 3),
    // usable here is the SQI gate only. The AF gate is enforced separately AND
    // in the database (ppg_af_gate trigger forces usable=false for AF), which
    // is the authoritative check — HR is still kept for AF participants.
    usable: sqi >= SQI_THRESHOLD,
    waveform: redSeries,
  };
}

function clamp(v: number) { return Math.max(0, Math.min(1, v)); }
function round(v: number, d: number) { const m = 10 ** d; return Math.round(v * m) / m; }
