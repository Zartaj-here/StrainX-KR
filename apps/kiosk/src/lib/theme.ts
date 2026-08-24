// Shared kiosk styling tokens. Large touch targets, high contrast — the
// participants using this are elderly (§7 constraints apply to the kiosk too).

export const T = {
  bg: "#fffdf8",
  card: "#ffffff",
  ink: "#1a1a1a",
  sub: "#6b6b5a",
  amber: "#d97706",
  amberDark: "#b45309",
  green: "#2f7d32",
  greenGo: "#16a34a",
  border: "#e7e2d6",
  danger: "#8e3b46",
};

export const S = {
  h1: { fontSize: 34, fontWeight: "800" as const, color: T.ink, textAlign: "center" as const },
  h2: { fontSize: 26, fontWeight: "700" as const, color: T.ink, textAlign: "center" as const },
  body: { fontSize: 22, color: T.ink, textAlign: "center" as const, lineHeight: 32 },
  bigBtn: {
    minHeight: 72, borderRadius: 20, alignItems: "center" as const,
    justifyContent: "center" as const, paddingHorizontal: 24, paddingVertical: 18,
  },
  bigBtnText: { fontSize: 24, fontWeight: "700" as const, color: "#fff" },
};
