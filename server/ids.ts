/** Id generators with the SPEC prefixes. Counters are globalThis-shared
 * (server/shared.ts) so instrumentation + route contexts agree. */
import { counters } from "./shared";

export function nextId(prefix: string): string {
  const c = counters();
  const n = (c.get(prefix) ?? 0) + 1;
  c.set(prefix, n);
  return `${prefix}${n}`;
}

/** Peek the next number without consuming (for seeding continuity). */
export function peekId(prefix: string): number {
  return (counters().get(prefix) ?? 0) + 1;
}

/** Bump a counter so runtime ids continue after seeded ids. */
export function setCounter(prefix: string, value: number): void {
  counters().set(prefix, value);
}

export const ids = {
  threat: () => nextId("T-"),
  trace: () => nextId("TR-"),
  approval: () => nextId("A-"),
  migration: () => nextId("M-"),
  message: () => nextId("MSG-"),
  event: () => nextId("EV-"),
  rangeRun: () => nextId("RR-"),
  research: () => nextId("RQ-"),
  telemetry: () => nextId("SIG-"),
  ioc: () => nextId("IOC-"),
  step: () => nextId("STEP-"),
  span: () => nextId("SP-"),
  lease: () => nextId("L-"),
  record: () => nextId("REC-"),
  stepUp: () => nextId("SU-"),
  server: (name: string) => `srv-${name}`,
  agent: (name: string) => `agt-${name}`,
  thread: (name: string) => `thr-${name}`,
};
