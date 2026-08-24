"use client";

import { useEffect } from "react";

export function RegisterSw() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // PWA install/notifications degrade gracefully; staff-assisted mode
        // is a first-class path (§7).
      });
    }
  }, []);
  return null;
}
