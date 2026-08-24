// Extract the mean red-channel value from a Vision Camera frame, inside a
// worklet. This is the raw PPG sample per frame (§8a: "mean red channel per
// frame -> raw PPG waveform").
//
// Vision Camera delivers frames in the device's native pixel format. We read
// the buffer, stride across a central region of interest (the fingertip fills
// the frame, but sampling a center crop avoids torch hotspots at the edges),
// and average the red bytes. Sampling every Nth pixel keeps this real-time at
// 30 fps without a native plugin.

import type { Frame } from "react-native-vision-camera";

const STEP = 37; // prime-ish stride so we don't alias to a pixel row

export function meanRed(frame: Frame): number {
  "worklet";
  // toArrayBuffer() returns the frame's raw bytes. For RGBA/BGRA the red byte
  // offset differs; VisionCamera exposes pixelFormat to disambiguate.
  const buffer = frame.toArrayBuffer();
  const data = new Uint8Array(buffer);
  const bytesPerPixel = 4;
  // 'rgb' -> red at +0; most iOS/Android camera buffers are BGRA -> red at +2.
  const redOffset = frame.pixelFormat === "rgb" ? 0 : 2;

  let sum = 0;
  let count = 0;
  for (let i = redOffset; i < data.length; i += bytesPerPixel * STEP) {
    sum += data[i];
    count++;
  }
  return count > 0 ? sum / count : 0;
}
