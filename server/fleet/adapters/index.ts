/**
 * Adapter selection: a server's `adapter` field decides whether tools run
 * against the simulated world (`sim`, default) or a real host over SSH.
 * `"*"` (fleet-wide ops) and unknown ids stay simulated.
 */
import type { ID } from "@/lib/types";
import { store } from "../../store";
import { SimAdapter } from "./sim";
import { SshAdapter } from "./ssh";
import type { ServerAdapter } from "./types";

const sim = new SimAdapter();
let ssh: SshAdapter | undefined;

export function sshAdapter(): SshAdapter {
  return (ssh ??= new SshAdapter());
}

export function adapterFor(serverId: ID | undefined): ServerAdapter {
  if (!serverId || serverId === "*") return sim;
  const srv = store.state ? store.server(serverId) : undefined;
  return srv?.adapter === "ssh" ? sshAdapter() : sim;
}

export type { AdapterResult, ServerAdapter } from "./types";
