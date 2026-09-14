/* cosmos.gl Agent-only 点图渲染：打包自本仓库既有 AgentCanvas 的同款配置。
   点 = 一位 Agent（external/platform），线 = 可回读原文的公开交流证据。 */
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
let ids = [];
let links = [];
let current = null;
let selected = null;
let tooltip = null;

function pointColors(graph) {
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  return new Float32Array(ids.flatMap(id => {
    const node = byId.get(id);
    const c = selected === id ? PALETTE.selected : node && node.kind === "platform_agent" ? PALETTE.platform : PALETTE.agent;
    return [c[0], c[1], c[2], node ? c[3] : 0];
  }));
}

function paint(graph) {
  if (!cosmos || !cosmos.isReady) return;
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  ids = graph.nodes.map(n => n.id);
  const indices = new Map(ids.map((id, i) => [id, i]));
  const seedRadius = Math.min(900, Math.max(180, Math.sqrt(ids.length) * 90));
  const positions = new Float32Array(ids.flatMap((id, i) => [2048 + Math.sin(i * 13.7 + 1) * seedRadius, 2048 + Math.cos(i * 7.3 + 1) * seedRadius]));
  cosmos.setPointPositions(positions, true);
  cosmos.setPointSizes(new Float32Array(ids.map(id => selected === id ? 7 : 4)));
  cosmos.setPointColors(pointColors(graph));
  links = graph.edges;
  cosmos.setLinks(new Float32Array(graph.edges.flatMap(e => [indices.get(e.source), indices.get(e.target)])));
  cosmos.render(undefined, 0);
  for (let i = 0; i < 240; i++) cosmos.step();
  cosmos.fitView(0, 0.16, false);
  cosmos.pause();
}

export function mount(host, graph, handlers) {
  try { if (cosmos) { cosmos.destroy(); } } catch { /* 重建前清理旧实例。 */ }
  selected = null;
  tooltip = null;
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
      selected = id && graph.nodes.some(n => n.id === id) ? id : null;
      if (cosmos && cosmos.isReady) {
        cosmos.setPointSizes(new Float32Array(ids.map(x => selected === x ? 7 : 4)));
        cosmos.setPointColors(pointColors(graph));
        cosmos.render(undefined, 0);
      }
    },
    onLinkClick: index => { const edge = links[index]; if (edge && handlers && handlers.onEvidence) handlers.onEvidence(edge); },
    onPointMouseOver: index => showTooltip(host, graph.nodes.find(n => n.id === ids[index])?.label || ""),
    onPointMouseOut: () => showTooltip(host, ""),
    onLinkMouseOver: () => showTooltip(host, "公开交流 · 点击查看双方原始记录"),
    onLinkMouseOut: () => showTooltip(host, ""),
  });
  current = graph;
  cosmos.ready.then(() => { if (current === graph) paint(graph); }).catch(() => {
    host.insertAdjacentHTML("beforeend", '<div class="cm-graph-fallback">点图暂时不可用。Agent 列表与公告仍可完整操作。</div>');
  });
  return cosmos;
}

export function select(id) {
  selected = id;
  if (cosmos && cosmos.isReady && current) {
    cosmos.setPointSizes(new Float32Array(ids.map(x => selected === x ? 7 : 4)));
    cosmos.setPointColors(pointColors(current));
    cosmos.render(undefined, 0);
  }
}

function showTooltip(host, text) {
  if (tooltip) { tooltip.remove(); tooltip = null; }
  if (!text) return;
  tooltip = document.createElement("div");
  tooltip.className = "cm-graph-tooltip";
  tooltip.textContent = text;
  host.appendChild(tooltip);
}
