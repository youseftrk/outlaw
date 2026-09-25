"use client";

import * as React from "react";

declare global {
  interface Window {
    qalaa?: { isDesktop: boolean; platform: NodeJS.Platform | string; version?: string };
  }
}

// `window.qalaa` is injected once by the Electron preload and never changes, so there is nothing to subscribe to.
const subscribeToNothing = () => () => {};
const notOnServer = () => false;
const readIsDesktop = () => Boolean(window.qalaa?.isDesktop);
const readIsDesktopMac = () => Boolean(window.qalaa?.isDesktop && window.qalaa.platform === "darwin");

/** True when running inside the Electron shell on macOS (traffic lights need room). */
export function useDesktopMac() {
  return React.useSyncExternalStore(subscribeToNothing, readIsDesktopMac, notOnServer);
}

export function useIsDesktop() {
  return React.useSyncExternalStore(subscribeToNothing, readIsDesktop, notOnServer);
}
