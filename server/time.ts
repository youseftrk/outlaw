/** Sim clock helpers. One tick = one simulated second; tick cadence is
 * 1000 ms / settings.sim.speed, so sim time runs `speed`× faster than
 * wall clock. All timestamps in state are sim-time ISO strings. */

export function iso(ms: number): string {
  return new Date(ms).toISOString();
}

export function isoNow(): string {
  return new Date().toISOString();
}

export function isoAgo(seconds: number, from?: number): string {
  return iso((from ?? Date.now()) - seconds * 1000);
}

export function isoIn(seconds: number, from?: number): string {
  return iso((from ?? Date.now()) + seconds * 1000);
}

export function minutesAgoIso(min: number, from?: number): string {
  return isoAgo(min * 60, from);
}

export function daysAgoIso(days: number, from?: number): string {
  return isoAgo(days * 86400, from);
}

export function diffSeconds(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000);
}
