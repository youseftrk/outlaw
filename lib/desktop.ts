"use client";

import * as React from "react";

declare global {
  interface Window {
    outlaw?: { isDesktop: boolean; platform: NodeJS.Platform | string; version?: string };
  }
}

/** True when running inside the Electron shell on macOS (traffic lights need room). */
export function useDesktopMac() {
  const [mac, setMac] = React.useState(false);
  React.useEffect(() => {
    setMac(Boolean(window.outlaw?.isDesktop && window.outlaw.platform === "darwin"));
  }, []);
  return mac;
}

export function useIsDesktop() {
  const [desktop, setDesktop] = React.useState(false);
  React.useEffect(() => setDesktop(Boolean(window.outlaw?.isDesktop)), []);
  return desktop;
}
