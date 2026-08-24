import type { Config } from "tailwindcss";

// Senior-first constraints (§7): ≥20pt body text, ≥44pt tap targets, high
// contrast. The base font size is set in globals.css; these tokens keep tap
// targets honest.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      minHeight: { tap: "44pt" },
      minWidth: { tap: "44pt" },
      colors: {
        band: {
          calm: "#2f7d32",   // 안정
          load: "#b26a00",   // 부담
          rest: "#8e3b46",   // 소진 — a "please rest" tone, not an alarm red
        },
      },
    },
  },
  plugins: [],
};
export default config;
