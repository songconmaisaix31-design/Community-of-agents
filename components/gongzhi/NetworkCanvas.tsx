"use client";
import { useEffect, useRef, useState } from "react";
import { Focus, Minus, Plus } from "lucide-react";
import type { Graph as CosmosGraph } from "@cosmos.gl/graph";
import type { Graph } from "../../lib/gongzhi/contracts";
import { Button } from "../ui/button";
export function NetworkCanvas({ graph, onSelect, onEvidence, selected }: { graph: Graph; onSelect: (id: string) => void; onEvidence: (id: string) => void; selected: string | null }) {
  const container = useRef<HTMLDivElement>(null), instance = useRef<CosmosGraph | null>(null), callbacks = useRef({ onSelect, onEvidence }), [failure, setFailure] = useState(false), [ready, setReady] = useState(false), [hover, setHover] = useState("");
  const [labels, setLabels] = useState<{ id: string; title: string; x: number; y: number }[]>([]);
  callbacks.current = { onSelect, onEvidence };
  useEffect(() => {
    let disposed = false, destroyed = false; let local: CosmosGraph | undefined; setFailure(false); setReady(false); setLabels([]);
    const destroy = () => { if (local?.isReady && !destroyed) { destroyed = true; local.destroy(); } };
    const timeout = setTimeout(() => { if (!disposed) { disposed = true; instance.current = null; setFailure(true); setReady(false); destroy(); } }, 12000);
    const updateLabels = () => { if (disposed || !local?.isReady) return; const positions = local.getPointPositions(); setLabels(graph.nodes.flatMap((n, i) => { if (n.type === "owner") return []; const [x, y] = local!.spaceToScreenPosition([positions[i * 2], positions[i * 2 + 1]]); return Number.isFinite(x) && Number.isFinite(y) ? [{ id: n.id, title: n.label, x, y }] : []; }).slice(0, 20)); };
    const initialize = async () => { try {
      const { Graph } = await import("@cosmos.gl/graph"); if (disposed || !container.current) return;
      const indices = new Map(graph.nodes.map((n, i) => [n.id, i])); const edges = graph.edges.filter(e => e.evidence_id && indices.has(e.source) && indices.has(e.target));
      local = new Graph(container.current, { backgroundColor: "#0b1420", pointDefaultSize: 5, pointDefaultColor: "#e6c194", linkDefaultColor: "#526b82", linkDefaultWidth: 1.1, hoveredLinkColor: "#e9c296", hoveredLinkWidthIncrease: 3, pointSizeScale: 1, simulationRepulsion: 1.5, simulationLinkDistance: 160, simulationDecay: 200, simulationRepulsionFromMouse: 0, enableDrag: false, fitViewOnInit: true, fitViewDelay: 0, fitViewPadding: 0.3, fitViewDuration: 0, randomSeed: 19, onClick(index) { if (index !== undefined && graph.nodes[index]) callbacks.current.onSelect(graph.nodes[index].id); }, onLinkClick(index) { if (edges[index]) callbacks.current.onEvidence(edges[index].evidence_id); }, onLinkMouseOver(index) { const edge = edges[index]; if (edge) setHover(`${{ published: "发布记录", replied: "回应记录", accepted: "采纳决定", referenced: "版本引用" }[edge.type]} · 点击查看依据`); }, onLinkMouseOut() { setHover(""); }, onPointMouseOver(index) { setHover(graph.nodes[index]?.label || ""); }, onPointMouseOut() { setHover(""); }, onZoom: updateLabels });
      await local.ready; if (disposed) { destroy(); return; } instance.current = local;
      // Cosmos generates and settles the layout; no custom force engine.
      local.setPointPositions(new Float32Array(graph.nodes.flatMap((_, i) => [(i % 4) * 100, Math.floor(i / 4) * 100])));
      local.setPointColors(new Float32Array(graph.nodes.flatMap(n => n.type === "owner" ? [0.62, 0.73, 0.89, 1] : n.type === "experience" ? [0.59, 0.78, 0.72, 1] : n.type === "result" ? [0.78, 0.68, 0.86, 1] : [0.9, 0.74, 0.54, 1])));
      local.setPointSizes(new Float32Array(graph.nodes.map(n => n.type === "need" ? 6 : 4)));
      local.setLinks(new Float32Array(edges.flatMap(e => [indices.get(e.source)!, indices.get(e.target)!])));
      local.render();
      // Settle synchronously so selection and reduced-motion mode never drift.
      local.pause(); for (let i = 0; i < 160; i++) local.step(); local.fitView(0, 0.28, false); setReady(true); clearTimeout(timeout); requestAnimationFrame(updateLabels);
    } catch { clearTimeout(timeout); if (!disposed) { setFailure(true); setReady(false); } destroy(); } };
    void initialize(); return () => { disposed = true; clearTimeout(timeout); instance.current = null; destroy(); };
  }, [graph]);
  useEffect(() => { if (!instance.current || !ready || !selected) return; const index = graph.nodes.findIndex(n => n.id === selected); if (index >= 0) instance.current.zoomToPointByIndex(index, 0, 1.2, true, false); }, [selected, graph.nodes, ready]);
  return <div className="network-canvas" data-testid="network-canvas"><div ref={container} className="cosmos-host" aria-label="交互星图，可拖动平移、滚轮缩放；完整记录同时提供列表" />{ready && !failure && <div className="graph-label-layer" aria-hidden="true">{labels.map(label => <span className="graph-node-label" key={label.id} data-node-id={label.id} style={{ left: label.x, top: label.y }}>{label.title}</span>)}</div>}{failure ? <div className="graph-placeholder" role="status"><Focus size={30} /><p>当前设备无法打开星图</p><small>完整列表仍可搜索、查看与操作。</small></div> : !graph.nodes.length ? <div className="graph-placeholder"><Focus size={30} /><p>这里等待第一颗星</p><small>当前筛选下没有公开记录。</small></div> : !ready ? <div className="graph-placeholder" role="status">正在展开星群…</div> : null}<div className="canvas-heading"><span className="tiny-label">每一颗星，都有来处</span><h2>从一个小小的连接开始</h2><p>选择星点看记录，选择连线看依据。</p></div>{hover && <div className="graph-tooltip">{hover}</div>}<div className="canvas-legend"><span><i className="dot owner" />人与 Agent</span><span><i className="dot need" />需求</span><span><i className="dot experience" />经验</span><span><i className="dot result" />产物</span></div><div className="canvas-controls"><Button variant="secondary" size="icon" aria-label="放大星图" disabled={!ready} onClick={() => instance.current?.zoom(instance.current.getZoomLevel() * 1.3, 0, false)}><Plus size={16} /></Button><Button variant="secondary" size="icon" aria-label="缩小星图" disabled={!ready} onClick={() => instance.current?.zoom(instance.current.getZoomLevel() * 0.75, 0, false)}><Minus size={16} /></Button><Button variant="secondary" size="icon" aria-label="显示全部星点" disabled={!ready} onClick={() => instance.current?.fitView(0, 0.28, false)}><Focus size={16} /></Button></div><div className="canvas-footnote">星点只对应公开记录 · 距离不代表能力排名</div></div>;
}
