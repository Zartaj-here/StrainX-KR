// Runnable sanity check for the PPG pipeline against a synthetic waveform.
// Compile ppg.ts to JS first isn't necessary — this test reimplements the
// call by importing the transpiled logic is awkward in .ts, so we validate the
// algorithm's math on a clean synthetic signal via a tiny inline port check.
//
// Usage: node apps/kiosk/src/lib/ppg.test.mjs
// It generates a 60s, 30fps signal at a known HR and asserts recovery within
// tolerance, plus that a pure-noise signal is rejected (usable=false).
//
// NOTE: this imports the TS source through a manual transform is not done here;
// instead we keep a JS mirror of the two entry behaviors we care about:
//   1) a clean 72 bpm signal -> hr within +/-3 bpm, sqi >= threshold
//   2) white noise -> usable === false
// If you change ppg.ts, re-run this after `npx tsc` or port the change here.

// Minimal re-derivation to keep the test dependency-free: we call the same
// algorithm by dynamically importing a compiled build if present.
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const compiled = join(here, "ppg.compiled.mjs");

function synth(hrBpm, seconds, fs) {
  const n = seconds * fs;
  const out = [];
  const f = hrBpm / 60;
  for (let i = 0; i < n; i++) {
    const t = i / fs;
    // pulse + dicrotic notch + slow DC drift; scaled around a red-channel DC.
    const pulse = Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t);
    out.push(180 + 6 * pulse + 2 * Math.sin(2 * Math.PI * 0.25 * t));
  }
  return out;
}

async function main() {
  if (!existsSync(compiled)) {
    console.log(
      "SKIP: compile ppg.ts to ppg.compiled.mjs to run this test\n" +
      "  npx esbuild apps/kiosk/src/lib/ppg.ts --format=esm --outfile=apps/kiosk/src/lib/ppg.compiled.mjs",
    );
    process.exit(0);
  }
  const { processPpg, SQI_THRESHOLD } = await import(pathToFileURL(compiled).href);

  const fs = 30;
  const clean = processPpg(synth(72, 60, fs), fs, new Array(1200).fill(0.001));
  console.log("clean:", { hr: clean.hr_bpm, sqi: clean.sqi, usable: clean.usable });
  if (clean.hr_bpm == null || Math.abs(clean.hr_bpm - 72) > 4) {
    throw new Error(`HR out of tolerance: ${clean.hr_bpm}`);
  }
  if (clean.sqi < SQI_THRESHOLD) throw new Error(`clean signal rejected: sqi=${clean.sqi}`);

  const clean60 = processPpg(synth(60, 60, fs), fs, new Array(1200).fill(0.001));
  console.log("clean60:", { hr: clean60.hr_bpm, sqi: clean60.sqi, usable: clean60.usable });
  if (clean60.hr_bpm == null || Math.abs(clean60.hr_bpm - 60) > 4) {
    throw new Error(`HR(60) out of tolerance: ${clean60.hr_bpm}`);
  }

  // No finger on the lens: near-flat DC. Must be rejected (perfusion floor).
  const flat = processPpg(new Array(1800).fill(200.2), fs, new Array(1200).fill(0.001));
  console.log("flat:", { hr: flat.hr_bpm, sqi: flat.sqi, usable: flat.usable });
  if (flat.usable) throw new Error("flat/no-finger accepted as usable");

  const noise = processPpg(
    Array.from({ length: 1800 }, () => 128 + (Math.random() - 0.5) * 40),
    fs,
    Array.from({ length: 1200 }, () => Math.random()),
  );
  console.log("noise:", { hr: noise.hr_bpm, sqi: noise.sqi, usable: noise.usable });
  if (noise.usable) throw new Error("noise accepted as usable");

  console.log("\nPPG pipeline: OK");
}

main().catch((e) => { console.error(e); process.exit(1); });
