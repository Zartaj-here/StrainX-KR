// Polar H10 reference-device capture over BLE. PHASE 1 ONLY — the caller must
// gate this behind session.studyMode; there is no Bluetooth anywhere in the
// Phase 0 care tool (CONTRIBUTING.md "Do not build (any phase)", H10 carve-out).
//
// This reads the STANDARD Bluetooth Heart Rate service (0x180D), Heart Rate
// Measurement characteristic (0x2A37), which the H10 exposes with beat-to-beat
// RR intervals — the reference stream we align the phone PPG against offline.
//
// react-native-ble-plx is a native module: it only exists in a dev build. We
// require it lazily so the JS bundle still loads without it (isH10Available()
// then returns false and the capture flow falls back to offline alignment).

const HR_SERVICE = "0000180d-0000-1000-8000-00805f9b34fb";
const HR_MEASUREMENT = "00002a37-0000-1000-8000-00805f9b34fb";

export type RrSample = { atMs: number; rrMs: number };
export type H10Session = {
  deviceId: string;
  startMarker: string; // ISO shared-clock t0 for offline alignment (doc 4.3)
  samples: RrSample[];
  stop: () => Promise<void>;
};

type BleModule = { BleManager: new () => any } | null;

let bleModule: BleModule = null;
let triedLoad = false;

function loadBle(): BleModule {
  if (triedLoad) return bleModule;
  triedLoad = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    bleModule = require("react-native-ble-plx");
  } catch {
    bleModule = null; // not in this build → caller uses offline mode
  }
  return bleModule;
}

export function isH10Available(): boolean {
  return loadBle() != null;
}

// Decode a base64 HRM packet into RR intervals (ms). RR values are transmitted
// in units of 1/1024 s (Bluetooth HR profile), converted to milliseconds here.
export function parseHrmRr(base64: string): { hr: number | null; rr: number[] } {
  const bin = globalThis.atob ? globalThis.atob(base64) : Buffer.from(base64, "base64").toString("binary");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (bytes.length === 0) return { hr: null, rr: [] };

  const flags = bytes[0];
  const hr16 = (flags & 0x01) !== 0;      // bit0: HR value format
  const energyPresent = (flags & 0x08) !== 0; // bit3
  const rrPresent = (flags & 0x10) !== 0; // bit4

  let i = 1;
  let hr: number | null = null;
  if (hr16) { hr = bytes[i] | (bytes[i + 1] << 8); i += 2; }
  else { hr = bytes[i]; i += 1; }
  if (energyPresent) i += 2;

  const rr: number[] = [];
  if (rrPresent) {
    for (; i + 1 < bytes.length; i += 2) {
      const raw = bytes[i] | (bytes[i + 1] << 8);
      rr.push((raw * 1000) / 1024);
    }
  }
  return { hr, rr };
}

// Connect to a Polar H10 and stream RR intervals until stop() is called. The
// returned startMarker is the shared-clock t0 written to
// study_recordings.ref_start_marker so the two streams align offline.
export async function startH10(nowIso: string): Promise<H10Session | null> {
  const mod = loadBle();
  if (!mod) return null;

  const manager = new mod.BleManager();
  const startMarker = nowIso;
  const samples: RrSample[] = [];

  const device: any = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { manager.stopDeviceScan(); reject(new Error("H10 not found")); }, 15000);
    manager.startDeviceScan([HR_SERVICE], null, (error: any, d: any) => {
      if (error) { clearTimeout(timeout); manager.stopDeviceScan(); reject(error); return; }
      if (d && (d.name?.includes("Polar") || d.name?.includes("H10"))) {
        clearTimeout(timeout);
        manager.stopDeviceScan();
        resolve(d);
      }
    });
  });

  const connected = await device.connect();
  await connected.discoverAllServicesAndCharacteristics();

  const started = Date.now();
  const sub = connected.monitorCharacteristicForService(
    HR_SERVICE,
    HR_MEASUREMENT,
    (error: any, ch: any) => {
      if (error || !ch?.value) return;
      const { rr } = parseHrmRr(ch.value);
      const at = Date.now() - started;
      for (const rrMs of rr) samples.push({ atMs: at, rrMs });
    },
  );

  const stop = async () => {
    try { sub?.remove(); } catch {}
    try { await connected.cancelConnection(); } catch {}
    try { manager.destroy(); } catch {}
  };

  return { deviceId: device.id, startMarker, samples, stop };
}
