"use client";

import * as React from "react";
import { bind, play as cuelumePlay, setEnabled, type SoundName } from "cuelume";
import { useReducedMotion } from "motion/react";

const MUTED_KEY = "qalaa:sound-muted";

const listeners = new Set<() => void>();

function subscribeMuted(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function mutedSnapshot() {
  return localStorage.getItem(MUTED_KEY) !== "0";
}

function setMutedFlag(muted: boolean) {
  localStorage.setItem(MUTED_KEY, muted ? "1" : "0");
  listeners.forEach((l) => l());
}

type SoundContextValue = {
  /** Play a Cuelume sound by name; no-ops while muted or under prefers-reduced-motion. */
  play: (name: SoundName) => void;
  muted: boolean;
  toggleMuted: () => void;
};

const SoundContext = React.createContext<SoundContextValue>({
  play: () => {},
  muted: true,
  toggleMuted: () => {},
});

export function useSound() {
  return React.useContext(SoundContext);
}

/**
 * Binds Cuelume once for the whole app (data-cuelume-* attributes are delegated, so
 * nothing else needs wiring) and owns the mute flag. Muted by default; the flag is
 * persisted in localStorage. prefers-reduced-motion means fully silent.
 */
export function SoundProvider({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const muted = React.useSyncExternalStore(subscribeMuted, mutedSnapshot, () => true);

  React.useEffect(() => {
    bind();
  }, []);

  React.useEffect(() => {
    setEnabled(!muted && !reduced);
  }, [muted, reduced]);

  const value = React.useMemo<SoundContextValue>(
    () => ({
      play: (name) => {
        if (muted || reduced) return;
        cuelumePlay(name);
      },
      muted: muted || !!reduced,
      toggleMuted: () => setMutedFlag(!mutedSnapshot()),
    }),
    [muted, reduced],
  );

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}
