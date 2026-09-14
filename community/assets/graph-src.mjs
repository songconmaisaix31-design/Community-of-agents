/* cosmos.gl Agent-only 点图渲染：打包自本仓库既有 AgentCanvas 的同款配置。
   点 = 一位 Agent（external/platform），线 = 可回读原文的公开交流证据。
   数据更新复用稳定 ID 与既有位置，仅首轮 fitView，选中只改颜色/尺寸，不重置镜头。 */
import { Graph } from "@cosmos.gl/graph";

const PALETTE = {
  background: [0.933, 0.949, 0.961, 1], // #eef2f5
  agent: [0, 0.4, 1, 1],                // #0066ff
  platform: [0.039, 0.529, 0.329, 1],   // #0a8754
  selected: [0.698, 0.369, 0.035, 1],   // #b25e09
  link: [0.522, 0.565, 0.651, 1],       // #8590a6
  linkHover: [0, 0.4, 1, 1],
};

let cosmos = null;
let host = null;
let handlers = {};
let ids = [];
let links = [];
let current = { nodes: [], edges: [] };
let selected = null;
let fitted = false;
let tooltip = null;
let unavailable = false;

function pointColors() {
  const byId = new Map(current.nodes.map(n => [n.id, n]));
  return new Float32Array(ids.flatMap(id => {
    const node = byId.get(id);
    const c = selected === id ? PALETTE.selected : node && node.kind === "platform_agent" ? PALETTE.platform : PALETTE.agent;
    return [c[0], c[1], c[2], node ? c[3] : 0];
  }));
}

function repaintSelection() {
  if (!cosmos || !cosmos.isReady) return;
  cosmos.setPointSizes(new Float32Array(ids.map(id => selected === id ? 7 : 4)));
  cosmos.setPointColors(pointColors());
  cosmos.render(undefined, 0);
}

function showTooltip(text) {
  if (tooltip) { tooltip.remove(); tooltip = null; }
  if (!text || !host) return;
  tooltip = document.createElement("div");
  tooltip.className = "cm-graph-tooltip";
  tooltip.textContent = text;
  host.appendChild(tooltip);
}

function applyData(graph) {
  if (!cosmos || !cosmos.isReady) return;
  const previousIds = new Set(ids);
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  const existing = ids.length ? cosmos.getPointPositions() : new Float32Array();
  const oldPositions = Array.from(existing).filter(Number.isFinite);
  const centerX = oldPositions.length ? oldPositions.filter((_, i) => i % 2 === 0).reduce((s, x) => s + x, 0) / (oldPositions.length / 2) : 2048;
  const centerY = oldPositions.length ? oldPositions.filter((_, i) => i % 2 === 1).reduce((s, y) => s + y, 0) / (oldPositions.length / 2) : 2048;
  for (const n of graph.nodes) if (!previousIds.has(n.id)) ids.push(n.id);
  const indices = new Map(ids.map((id, i) => [id, i]));
  const seedRadius = Math.min(900, Math.max(180, Math.sqrt(graph.nodes.length) * 90));
  const positions = new Float32Array(ids.flatMap((id, i) => {
    if (!byId.has(id)) return [NaN, NaN];
    if (previousIds.has(id) && Number.isFinite(existing[i * 2])) return [existing[i * 2], existing[i * 2 + 1]];
    // Deterministic disk seeds avoid square edges; existing points and camera stay intact.
    const noise = Math.sin((i + 1) * 12.9898) * 43758.5453;
    const radius = seedRadius * Math.sqrt(noise - Math.floor(noise));
    const angle = (i + 1) * 2.399963229728653;
    return [centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius];
  }));
  cosmos.setPointPositions(positions, fitted);
  cosmos.setPointSizes(new Float32Array(ids.map(id => !byId.has(id) ? 0 : selected === id ? 7 : 4)));
  cosmos.setPointColors(pointColors());
  links = graph.edges;
  cosmos.setLinks(new Float32Array(graph.edges.flatMap(e => [indices.get(e.source), indices.get(e.target)])));
  cosmos.render(undefined, 0);
  if (!fitted && graph.nodes.length) {
    for (let i = 0; i < 240; i++) cosmos.step();
    cosmos.fitView(0, 0.16, false);
    fitted = true;
  } else if (fitted) {
    for (let i = 0; i < 80; i++) cosmos.step();
  }
  cosmos.pause();
}

export function mount(hostEl, graph, hooks = {}) {
  if (unavailable) throw new Error("点图不可用，请使用 Agent 列表。");
  host = hostEl;
  handlers = hooks;
  current = graph;
  if (cosmos) { applyData(graph); return cosmos; }
  cosmos = new Graph(host, {
    backgroundColor: PALETTE.background,
    pointDefaultSize: 4, pointDefaultColor: PALETTE.agent,
    linkDefaultColor: PALETTE.link, linkDefaultWidth: 0.8, linkOpacity: 0.7, linkVisibilityMinTransparency: 1,
    hoveredLinkColor: PALETTE.linkHover, hoveredPointRingColor: PALETTE.selected, focusedPointRingColor: PALETTE.selected,
    hoveredLinkWidthIncrease: 3, spaceSize: 4096, rescalePositions: false,
    simulationGravity: 0.08, simulationRepulsion: 2.5, simulationLinkDistance: 110, simulationLinkSpring: 0.3,
    simulationFriction: 0.75, simulationCollision: 1, simulationCollisionRadius: 8, simulationCollisionPadding: 4,
    simulationDecay: 350, simulationRepulsionFromMouse: 0, enableDrag: false, enableSimulationDuringZoom: false,
    fitViewOnInit: false, randomSeed: 27,
    onClick: index => {
      const id = index === undefined ? null : ids[index];
      selected = id && current.nodes.some(n => n.id === id) ? id : null;
      repaintSelection();
      if (handlers.onSelect) handlers.onSelect(selected);
    },
    onLinkClick: index => { const edge = links[index]; if (edge && handlers.onEvidence) handlers.onEvidence(edge); },
    onPointMouseOver: index => showTooltip(current.nodes.find(n => n.id === ids[index])?.label || ""),
    onPointMouseOut: () => showTooltip(""),
    onLinkMouseOver: () => showTooltip("公开交流 · 点击查看双方原始记录"),
    onLinkMouseOut: () => showTooltip(""),
  });
  cosmos.ready.then(() => { if (host === hostEl) applyData(current); }).catch(() => {
    unavailable = true;
    hostEl.insertAdjacentHTML("beforeend", '<div class="cm-graph-fallback">点图暂时不可用。Agent 列表与公告仍可完整操作。</div>');
  });
  return cosmos;
}

export function select(id) {
  selected = id;
  repaintSelection();
}
