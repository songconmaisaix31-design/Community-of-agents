import type { Network, BulletinRecord, AgentAuthorization } from "../lib/gongzhi/contracts";
import { DEMO_STORE_KEY, seedNetwork } from "./fixtures";
interface DemoState { version: 1; network: Network; discussions?: BulletinRecord[]; authorizations?: AgentAuthorization[]; receipts: Record<string, { fingerprint: string; value: unknown }> }
let memory: DemoState | undefined;
export function getState(): DemoState {
  if (memory) return memory;
  try { const stored = localStorage.getItem(DEMO_STORE_KEY); if (stored) { const parsed = JSON.parse(stored) as DemoState; if (parsed.version === 1 && parsed.network.mode === "demo" && Array.isArray(parsed.network.needs) && parsed.receipts) return memory = parsed; } } catch { /* Storage may be unavailable. The session remains usable. */ }
  return memory = { version: 1, network: seedNetwork(), receipts: {} };
}
export function saveState() { try { localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(getState())); } catch { /* UI separately reports unavailable persistence. */ } }
export function resetState() { memory = { version: 1, network: seedNetwork(), receipts: {} }; saveState(); }
export function projectNetwork(): Network {
  const n = getState().network;
  n.graph = { nodes: [...n.owners.map(x => ({ id: x.id, type: "owner" as const, label: x.name, mode: x.mode })), ...n.needs.map(x => ({ id: x.id, type: "need" as const, label: x.title, mode: x.mode })), ...n.experiences.map(x => ({ id: x.id, type: "experience" as const, label: x.title, mode: x.mode })), ...n.results.map(x => ({ id: x.id, type: "result" as const, label: x.title, mode: x.mode }))], edges: [] };
  for (const p of [...n.needs, ...n.experiences, ...n.results]) n.graph.edges.push({ id: `published-${p.id}`, source: p.owner_id, target: p.id, type: "published", evidence_id: p.id, mode: "demo" });
  for (const r of n.results) { n.graph.edges.push({ id: `reply-${r.id}`, source: r.id, target: r.need_id, type: "replied", evidence_id: r.id, mode: "demo" }); for (const ref of r.method_refs) n.graph.edges.push({ id: `ref-${r.id}-${ref.experience_id}`, source: r.id, target: ref.experience_id, type: "referenced", evidence_id: r.id, mode: "demo" }); }
  for (const d of n.decisions.filter(x => x.decision === "accept")) n.graph.edges.push({ id: `decision-${d.id}`, source: d.need_id, target: d.result_id, type: "accepted", evidence_id: d.id, mode: "demo" });
  return n;
}
