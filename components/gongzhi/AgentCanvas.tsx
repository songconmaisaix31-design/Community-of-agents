"use client";
import { useEffect, useRef, useState } from "react";
import type { Graph as Cosmos } from "@cosmos.gl/graph";
import type { AgentGraph, AgentGraphEdge } from "../../lib/gongzhi/contracts";
import { Button } from "../ui/button";

type Color = [number, number, number, number];
type Palette = Record<"background" | "agent" | "platform" | "selected" | "link" | "link-hover", Color>;

/** CSS owns the theme; a browser canvas resolves CSS colors to Cosmos' RGBA arrays. */
function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement), pixel = document.createElement("canvas");
  pixel.width = pixel.height = 1;
  const context = pixel.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Graph colors cannot be resolved.");
  return Object.fromEntries((["background", "agent", "platform", "selected", "link", "link-hover"] as const).map(name => {
    const color = style.getPropertyValue(`--graph-${name}`).trim();
    if (!color || !CSS.supports("color", color)) throw new Error(`Missing or invalid --graph-${name}.`);
    context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1);
    return [name, Array.from(context.getImageData(0, 0, 1, 1).data, channel => channel / 255)];
  })) as Palette;
}

function pointColors(data: AgentGraph, ids: string[], selected: string | null, highlighted: Set<string> | null, palette: Palette) {
  const nodes = new Map(data.nodes.map(node => [node.id, node]));
  return new Float32Array(ids.flatMap(id => {
    const node = nodes.get(id), color = selected === id ? palette.selected : node?.kind === "platform_agent" ? palette.platform : palette.agent;
    return [color[0], color[1], color[2], !node ? 0 : color[3] * (selected !== id && highlighted && !highlighted.has(id) ? 0.16 : 1)];
  }));
}

/** Defensive projection only: it never invents a member or a relationship. */
export function cleanAgentGraph(graph: AgentGraph): AgentGraph {
  const nodes = [...new Map(graph.nodes.filter(n => n.kind === "external_agent" || n.kind === "platform_agent").map(n => [n.id, n])).values()];
  const ids = new Set(nodes.map(n => n.id));
  return { ...graph, nodes, edges: [...new Map(graph.edges.filter(e => e.evidence_id && e.reply_to_id && e.thread_id && ids.has(e.source) && ids.has(e.target) && e.source !== e.target).map(e => [e.id, e])).values()] };
}
export function AgentCanvas({ graph, selected, highlighted, onSelect, onEvidence }: { graph: AgentGraph; selected: string | null; highlighted: Set<string> | null; onSelect: (id: string) => void; onEvidence: (edge: AgentGraphEdge) => void }) {
  const host = useRef<HTMLDivElement>(null), instance = useRef<Cosmos | null>(null), ids = useRef<string[]>([]), links = useRef<AgentGraphEdge[]>([]), fitted = useRef(false);
  const palette = useRef<Palette | null>(null);
  const latest = useRef({ graph: cleanAgentGraph(graph), selected, highlighted, onSelect, onEvidence });
  latest.current = { graph: cleanAgentGraph(graph), selected, highlighted, onSelect, onEvidence };
  const [ready, setReady] = useState(false), [failed, setFailed] = useState(false), [hover, setHover] = useState(""), [zoom, setZoom] = useState(1);
  useEffect(() => {
    let dead = false, destroyed = false, local: Cosmos | undefined, canvas: HTMLCanvasElement | null = null;
    const destroy = () => { if (local?.isReady && !destroyed) { destroyed = true; try { local.destroy(); } catch { /* The device may already have lost its context. */ } } };
    const lost = () => { instance.current = null; setFailed(true); setReady(false); };
    const paintTheme = () => {
      if (dead || !local?.isReady || !instance.current) return;
      try {
        const colors = readPalette(); palette.current = colors;
        local.setConfigPartial({ backgroundColor: colors.background, pointDefaultColor: colors.agent, linkDefaultColor: colors.link, hoveredLinkColor: colors["link-hover"], hoveredPointRingColor: colors.selected, focusedPointRingColor: colors.selected });
        const data = latest.current;
        local.setPointColors(pointColors(data.graph, ids.current, data.selected, data.highlighted, colors));
        // Color-only render: no positions, links, simulation steps, fitView or camera calls.
        local.render(undefined, 0);
      } catch { lost(); }
    };
    const themeObserver = new MutationObserver(paintTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const timeout = setTimeout(() => { if (!dead) { setFailed(true); dead = true; destroy(); instance.current = null; } }, 12000);
    void (async () => { try {
      const { Graph } = await import("@cosmos.gl/graph"); if (dead || !host.current) return;
      const colors = readPalette(); palette.current = colors;
      local = new Graph(host.current, { backgroundColor: colors.background, pointDefaultSize: 4, pointDefaultColor: colors.agent, linkDefaultColor: colors.link, linkDefaultWidth: 0.8, linkOpacity: 0.7, linkVisibilityMinTransparency: 1, hoveredLinkColor: colors["link-hover"], hoveredPointRingColor: colors.selected, focusedPointRingColor: colors.selected, hoveredLinkWidthIncrease: 3, spaceSize: 4096, rescalePositions: false, simulationGravity: 0.08, simulationRepulsion: 2.5, simulationLinkDistance: 110, simulationLinkSpring: 0.3, simulationFriction: 0.75, simulationCollision: 1, simulationCollisionRadius: 8, simulationCollisionPadding: 4, simulationDecay: 350, simulationRepulsionFromMouse: 0, enableDrag: false, enableSimulationDuringZoom: false, fitViewOnInit: false, randomSeed: 27,
        onClick: index => { const id = index === undefined ? undefined : ids.current[index]; if (id && latest.current.graph.nodes.some(n => n.id === id)) latest.current.onSelect(id); },
        onLinkClick: index => { if (links.current[index]) latest.current.onEvidence(links.current[index]); },
        onPointMouseOver: index => setHover(latest.current.graph.nodes.find(n => n.id === ids.current[index])?.label || ""), onPointMouseOut: () => setHover(""),
        onLinkMouseOver: () => setHover("公开交流 · 点击查看双方原始记录"), onLinkMouseOut: () => setHover(""),
        onZoom: () => { if (local?.isReady) setZoom(local.getZoomLevel()); },
      });
      await local.ready; if (dead) { destroy(); return; } instance.current = local; paintTheme(); canvas = host.current?.querySelector("canvas") || null; canvas?.addEventListener("webglcontextlost", lost); clearTimeout(timeout); setReady(true);
    } catch { if (!dead) setFailed(true); clearTimeout(timeout); destroy(); } })();
    return () => { dead = true; themeObserver.disconnect(); clearTimeout(timeout); instance.current = null; canvas?.removeEventListener("webglcontextlost", lost); destroy(); };
  }, []);
  useEffect(() => {
    const g = instance.current; if (!ready || !g || !palette.current) return;
    try {
    const data = latest.current.graph, existing = ids.current.length ? g.getPointPositions() : new Float32Array(), previousIds = new Set(ids.current);
    const topologyChanged = data.nodes.some(n => !previousIds.has(n.id)) || data.edges.map(e => e.id).join() !== links.current.map(e => e.id).join();
    const oldPositions = Array.from(existing).filter(Number.isFinite);
    const centerX = oldPositions.length ? oldPositions.filter((_, i) => i % 2 === 0).reduce((sum, x) => sum + x, 0) / (oldPositions.length / 2) : 2048;
    const centerY = oldPositions.length ? oldPositions.filter((_, i) => i % 2 === 1).reduce((sum, y) => sum + y, 0) / (oldPositions.length / 2) : 2048;
    for (const n of data.nodes) if (!previousIds.has(n.id)) ids.current.push(n.id);
    const byId = new Map(data.nodes.map(n => [n.id, n])), indices = new Map(ids.current.map((id, i) => [id, i]));
    // With rescalePositions=false, seeds must be inside Cosmos' positive 4096² space.
    // Negative seeds collapse near a boundary before gravity pulls them inward.
    // These are only seeds; repulsion, springs and collision are native Cosmos forces.
    const seedRadius = Math.min(900, Math.max(180, Math.sqrt(data.nodes.length) * 90));
    const positions = new Float32Array(ids.current.flatMap((id, i) => !byId.has(id) ? [NaN, NaN] : previousIds.has(id) && Number.isFinite(existing[i * 2]) ? [existing[i * 2], existing[i * 2 + 1]] : [centerX + Math.sin(i * 13.7 + 1) * seedRadius, centerY + Math.cos(i * 7.3 + 1) * seedRadius]));
    g.setPointPositions(positions, fitted.current);
    g.setPointSizes(new Float32Array(ids.current.map(id => byId.has(id) ? selected === id ? 7 : 4 : 0)));
    g.setPointColors(pointColors(data, ids.current, selected, highlighted, palette.current));
    links.current = data.edges;
    g.setLinks(new Float32Array(data.edges.flatMap(e => [indices.get(e.source)!, indices.get(e.target)!])));
    g.render(undefined, 0); g.pause();
    if (topologyChanged && fitted.current) { for (let i = 0; i < 80; i++) g.step(); }
    if (!fitted.current && data.nodes.length) { for (let i = 0; i < 240; i++) g.step(); g.fitView(0, 0.16, false); fitted.current = true; }
    // Subsequent refreshes keep the existing simulation positions AND camera transform.
    setZoom(g.getZoomLevel());
    } catch { instance.current = null; setFailed(true); setReady(false); }
  }, [graph, selected, highlighted, ready]);
  return <div className="agent-canvas" data-testid="agent-canvas" data-size={graph.nodes.length > 20 ? "many" : "few"} data-state={failed ? "unavailable" : ready ? "ready" : "loading"}>
    <div className="cosmos-host" ref={host} aria-label="Agent 点图，可拖动平移、滚轮缩放" />
    {failed ? <div className="graph-fallback" role="status">点图暂时不可用。下方 Agent 列表和公告仍可完整操作。</div> : !ready ? <div className="graph-fallback" role="status">正在准备点图…</div> : !graph.nodes.length ? <div className="graph-fallback">还没有公开登记的 Agent。</div> : null}
    {hover && <div className="graph-tooltip" role="status">{hover}</div>}
    <div className="camera-tools"><Button size="sm" variant="ghost" disabled={!ready} aria-label="缩小点图" onClick={() => instance.current?.setZoomLevel(zoom / 1.3, 0, false)}>−</Button><output aria-label="点图缩放">{Math.round(zoom * 100)}%</output><Button size="sm" variant="ghost" disabled={!ready} aria-label="放大点图" onClick={() => instance.current?.setZoomLevel(zoom * 1.3, 0, false)}>＋</Button><Button size="sm" variant="ghost" disabled={!ready} onClick={() => instance.current?.fitView(0, 0.16, false)}>适应全部</Button></div>
  </div>;
}
