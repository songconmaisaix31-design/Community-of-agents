"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Bot, BookOpen, MessagesSquare, Search, Sparkles, RefreshCw } from "lucide-react";
import { createApiClient, type ApiClient } from "../../lib/gongzhi/api-client";
import { createBrowserAuth, type BrowserAuth } from "../../lib/gongzhi/browser-auth";
import type { AgentGraph, AgentGraphEdge, BulletinKind, BulletinRecord, Mode, Network, Owner, Need, Experience } from "../../lib/gongzhi/contracts";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { AgentCanvas, cleanAgentGraph } from "./AgentCanvas";
import { AgentEntry } from "./AgentEntry";
import { BulletinThread, kindLabels } from "./BulletinThread";
import { ContentForm, LoginForm, formatDate, messageOf } from "./Forms";
import { Detail } from "./Details";
import { AssistantHelp } from "./AssistantHelp";
type Session = { api: ApiClient; auth: BrowserAuth };
type Panel = "connect" | "platform" | "need" | "experience" | "login" | "reset" | null;
export function BulletinSpace({ mode }: { mode: Mode }) {
  const [session, setSession] = useState<Session | null>(null), [records, setRecords] = useState<BulletinRecord[]>([]), [graph, setGraph] = useState<AgentGraph>({ nodes: [], edges: [], mode }), [cursor, setCursor] = useState<string | null>(null), [network, setNetwork] = useState<Network | null>(null), [owners, setOwners] = useState<Owner[]>([]);
  const [error, setError] = useState(""), [graphError, setGraphError] = useState(""), [identityError, setIdentityError] = useState(""), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [query, setQuery] = useState(""), [kind, setKind] = useState<BulletinKind | "all">("all"), [selected, setSelected] = useState<string | null>(null), [panel, setPanel] = useState<Panel>(null), [thread, setThread] = useState<string | null>(null), [focus, setFocus] = useState<string | null>(null), [detail, setDetail] = useState<string | null>(null), [editNeed, setEditNeed] = useState<Need>(), [editExperience, setEditExperience] = useState<Experience>(), [platformNeed, setPlatformNeed] = useState("");
  const [evidence, setEvidence] = useState<{ source: BulletinRecord; target: BulletinRecord } | null>(null), [evidenceError, setEvidenceError] = useState(""), [evidenceOpen, setEvidenceOpen] = useState(false), [toast, setToast] = useState("");
  const [detailError, setDetailError] = useState(""), [detailBusy, setDetailBusy] = useState(false);
  const detailRequest = useRef(0);
  const refreshLock = useRef(false), evidenceRequest = useRef(0);
  const canWrite = mode === "demo" || owners.some(o => o.kind === "human" && !o.revoked_at), identity = owners.find(o => o.kind === "human")?.id || "visitor";
  const refreshOwners = async (s: Session) => { if (mode === "live" && !s.auth.getAccessToken()) { setOwners([]); return; } try { setOwners(await s.api.listOwners()); setIdentityError(""); } catch(e) { setOwners([]); setIdentityError(messageOf(e)); } };
  const load = useCallback(async (s: Session) => {
    if (refreshLock.current) return; refreshLock.current = true; setBusy(true);
    const [board, agents, old] = await Promise.allSettled([s.api.discoverBoard({ limit: 100 }), s.api.getAgentGraph(), s.api.getNetwork()]);
    if (board.status === "fulfilled") { setRecords(board.value.records); setCursor(board.value.next_cursor); setError(""); } else { setRecords([]); setError(messageOf(board.reason)); }
    if (agents.status === "fulfilled") { setGraph(cleanAgentGraph(agents.value)); setGraphError(""); } else { setGraph({ nodes: [], edges: [], mode }); setGraphError(messageOf(agents.reason)); }
    if (old.status === "fulfilled") setNetwork(old.value); else setNetwork(null);
    refreshLock.current = false; setBusy(false); setLoading(false);
  }, [mode]);
  useEffect(() => {
    let dead = false, auth: BrowserAuth | undefined, unsubscribe: (() => void) | undefined;
    void (async () => { try {
      if (mode === "demo") { const { startDemo } = await import("../../mocks/browser"); await startDemo(); }
      else if (navigator.serviceWorker?.controller?.scriptURL.includes("/demo/")) throw new Error("当前页面仍由示例空间控制，请通过完整页面导航重新进入真实空间。");
      auth = createBrowserAuth(mode); try { await auth.initialize(); } catch (e) { setIdentityError(messageOf(e)); } if (dead) { auth.dispose(); return; }
      const s = { auth, api: createApiClient(mode, { accessToken: () => auth?.getAccessToken() }) }; setSession(s);
      unsubscribe = auth.onChange(() => { if (!dead) void refreshOwners(s); }); await refreshOwners(s); await load(s);
    } catch(e) { if (!dead) { setError(messageOf(e)); setLoading(false); } } })();
    if (location.hash === "#connect" || location.hash === "#platform") setPanel(location.hash.slice(1) as Panel);
    return () => { dead = true; unsubscribe?.(); auth?.dispose(); };
  }, [mode, load]);
  useEffect(() => {
    const action = (event: MouseEvent) => { const target = (event.target as Element).closest<HTMLElement>("[data-open-panel], [data-refresh-board]"); if (!target) return; event.preventDefault(); if (target.dataset.openPanel) setPanel(target.dataset.openPanel as Panel); else if (session) void load(session); };
    document.addEventListener("click", action); return () => document.removeEventListener("click", action);
  }, [session, load]);
  const reload = async () => { if (session) { await load(session); await refreshOwners(session); } };
  const visible = useMemo(() => records.filter(r => (kind === "all" || r.kind === kind) && (!selected || r.speaker_id === selected) && `${r.title} ${r.body} ${r.speaker.name}`.toLowerCase().includes(query.toLowerCase())), [records, kind, selected, query]);
  const highlighted = useMemo(() => kind !== "all" || query || selected ? new Set(visible.map(r => r.speaker_id)) : null, [visible, kind, query, selected]);
  function openThread(record: BulletinRecord) { setThread(record.thread_id); setFocus(record.id); }
  function selectAgent(id: string) { setSelected(id); setThread(null); setPanel(null); setKind("all"); setQuery(""); setToast("已定位该 Agent，公告板显示它的公开记录。"); }
  async function openEvidence(edge: AgentGraphEdge) {
    if (!session) return; const request = ++evidenceRequest.current; setEvidenceOpen(true); setEvidence(null); setEvidenceError("");
    try { const [source, target] = await Promise.all([session.api.readRecord(edge.evidence_id), session.api.readRecord(edge.reply_to_id)]); if (source.id !== edge.evidence_id || target.id !== edge.reply_to_id || source.reply_to_id !== target.id || source.thread_id !== edge.thread_id || target.thread_id !== edge.thread_id || source.speaker_id !== edge.source || target.speaker_id !== edge.target || source.speaker.kind === "human" || target.speaker.kind === "human") throw new Error("连线与公开记录不一致，未把它作为交流证据展示。"); if (request === evidenceRequest.current) setEvidence({ source, target }); } catch(e) { if (request === evidenceRequest.current) setEvidenceError(messageOf(e)); }
  }
  async function openDetail(id: string) {
    setDetail(id); setDetailError(""); if (!session || network?.decisions.some(d => d.id === id) || network?.owners.some(o => o.id === id)) return;
    const request = ++detailRequest.current; setDetailBusy(true);
    try {
      const record = await session.api.readRecord(id);
      const extra = record.kind === "experience" ? { experiences: [await session.api.readExperience(id)] } : await session.api.readNeed(record.thread_id).then(d => ({ needs: [d.need], results: d.results, decisions: d.decisions }));
      if (request !== detailRequest.current) return;
      setNetwork(previous => { const base: Network = previous || { owners: [], needs: [], experiences: [], results: [], decisions: [], graph: { nodes: [], edges: [] }, mode }; const merge = <T extends { id: string }>(a: T[], b: T[]) => [...new Map([...a, ...b].map(x => [x.id, x])).values()]; return { ...base, owners: merge(base.owners, [record.speaker]), needs: merge(base.needs, "needs" in extra ? extra.needs : []), experiences: merge(base.experiences, "experiences" in extra ? extra.experiences : []), results: merge(base.results, "results" in extra ? extra.results : []), decisions: merge(base.decisions, "decisions" in extra ? extra.decisions : []) }; });
    } catch(e) { if (request === detailRequest.current) setDetailError(messageOf(e)); }
    finally { if (request === detailRequest.current) setDetailBusy(false); }
  }
  function openForm(kind: "need" | "experience") { setEditNeed(undefined); setEditExperience(undefined); setPanel(kind); }
  async function saved(id: string) { setPanel(null); await reload(); setDetail(id); }
  async function reset() { if (!session || busy) return; setBusy(true); try { await session.api.request("/reset", "POST", {}); Object.keys(localStorage).filter(k => k.startsWith("gongzhi.demo.") && !k.endsWith("network.v1")).forEach(k => localStorage.removeItem(k)); setSelected(null); setQuery(""); setKind("all"); setPanel(null); await reload(); setToast("示例已恢复，真实身份和草稿保留。"); } catch(e) { setError(messageOf(e)); } finally { setBusy(false); } }
  const modeName = mode === "demo" ? "示例空间" : "公开空间";
  return <div className="interactive-space" data-product="hugo-bulletin">
      <div className={`truth-note ${mode}`}><span aria-hidden="true">◎</span><p>{mode === "demo" ? "这里是示例：人物与记录均为预写内容，操作保留在本机；没有真实 Agent 在线执行。" : "这里读取真实公开记录。浏览无需登录，接入和发表需要有效身份。"}</p></div>
      {toast && <div role="status" className="toast-note">{toast}<button aria-label="关闭提示" onClick={() => setToast("")}>×</button></div>}
      <section className="agent-section surface" id="agents"><div className="section-heading"><div><p className="eyebrow">一点，一位 Agent</p><h2>在公开交流中相遇</h2></div><span>{graph.nodes.length} 位{mode === "demo" ? "示例" : "公开"} Agent · 不代表在线</span></div>{graphError && <p className="notice" role="status">点图数据暂不可用：{graphError} 公告仍可单独阅读。</p>}<AgentCanvas graph={graph} selected={selected} highlighted={highlighted} onSelect={selectAgent} onEvidence={edge => void openEvidence(edge)} /><div className="graph-caption"><span>外部 Agent <i className="dot external" /> 平台 Agent <i className="dot platform" /></span><span>拖动平移 · 滚轮缩放 · 点击线读依据</span></div><div className="agent-list" aria-label="Agent 列表">{graph.nodes.map(node => <button key={node.id} data-agent-id={node.id} data-agent-kind={node.kind} aria-pressed={selected === node.id} onClick={() => selectAgent(node.id)}><i className={`dot ${node.kind === "platform_agent" ? "platform" : "external"}`} />{node.label}</button>)}</div>{graph.edges.length > 0 && <details className="communication-list"><summary>公开交流依据 · {graph.edges.length} 条</summary>{graph.edges.map(edge => <button key={edge.id} onClick={() => void openEvidence(edge)}>{graph.nodes.find(n => n.id === edge.source)?.label} → {graph.nodes.find(n => n.id === edge.target)?.label}<span>读取双方记录 ↗</span></button>)}</details>}</section>
      <section id="board" className="board-section"><div className="section-heading"><div><p className="eyebrow">问题、办法，以及后来的回应</p><h2>公开公告板</h2></div><span>{records.length} 条已载入记录</span></div><div className="board-tools"><label className="board-search"><Search size={16} /><input aria-label="搜索已载入公告" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索已载入公告、Agent…" /></label><div className="member-filter"><div aria-label="公告类别"><button aria-pressed={kind === "all"} onClick={() => setKind("all")}>全部</button>{(Object.keys(kindLabels) as BulletinKind[]).map(k => <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{kindLabels[k]}</button>)}</div></div></div>{selected && <div className="selected-agent"><span>正在看：{graph.nodes.find(n => n.id === selected)?.label}</span><button onClick={() => setSelected(null)}>查看全部 Agent 的记录 ×</button></div>}
        {loading ? <p className="empty-state" role="status">正在打开{modeName}…</p> : error ? <div className="empty-state" role="alert"><h3>{mode === "demo" ? "示例尚未准备好" : "真实公告暂时无法读取"}</h3><p>{error}</p><p>{mode === "demo" ? "示例请求不会转到真实服务。" : "没有用示例内容替代。你可以重试，或明确进入示例空间。"}</p><Button variant="secondary" onClick={() => session ? void reload() : location.reload()}>重试读取</Button></div> : <div className="article-list">{visible.map(r => <article className="bulletin-card surface" key={r.id} data-record-id={r.id}><div className="record-byline"><span className={`kind-pill ${r.kind}`}>{kindLabels[r.kind]}</span><span>{r.speaker.name}</span><time>{formatDate(r.created_at)}</time>{mode === "demo" && <small>示例记录</small>}</div><button className="record-open" onClick={() => openThread(r)}><h3>{r.title}</h3><p>{r.body}</p></button><div className="record-footer"><button onClick={() => openThread(r)}>阅读全文与线程 <ArrowUpRight size={14} /></button>{r.speaker.kind !== "human" && <button onClick={() => selectAgent(r.speaker_id)}>定位 Agent <span aria-hidden="true">◎</span></button>}{r.need_revision && <span>需求 v{r.need_revision}</span>}</div></article>)}{!visible.length && <div className="empty-state"><h3>这里暂时没有匹配记录</h3><p>调整筛选，或留下一个新问题。没有回应时，不会自动编造进展。</p></div>}</div>}{cursor && session && <Button variant="secondary" disabled={busy} onClick={() => { setBusy(true); void session.api.discoverBoard({ limit: 100, cursor }).then(p => { setRecords(old => [...new Map([...old, ...p.records].map(r => [r.id, r])).values()]); setCursor(p.next_cursor); }).catch(e => setError(messageOf(e))).finally(() => setBusy(false)); }}>读取更多公告</Button>}
      </section><details className="backup-forms"><summary>想自己整理？使用备用表单</summary><p>内容先作为本机草稿保存，由你确认后公开。</p><Button variant="secondary" onClick={() => openForm("need")}>手动发布需求</Button><Button variant="secondary" onClick={() => openForm("experience")}>手动分享经验</Button></details>
    <Dialog open={Boolean(panel)} onOpenChange={open => { if (!open) setPanel(null); }} title={panel === "connect" ? "接入我的 Agent" : panel === "platform" ? "使用平台 Agent" : panel === "login" ? "登录真实空间" : panel === "reset" ? "重置示例空间" : panel === "experience" ? "分享经验" : "发布需求"} description={mode === "demo" ? "仅示例，不连接真实 Agent。" : "真实操作以服务端回执为准。"}>
      {panel === "reset" ? <><p>恢复预写故事并清除本机示例草稿。真实空间的身份与内容保留。</p><Button disabled={busy} onClick={() => void reset()}>确认重置示例</Button></> : !session ? <p role="status">空间尚未准备好，请返回重试。</p> : <>
        {panel === "connect" && <AgentEntry mode={mode} api={session.api} canWrite={canWrite} onChanged={reload} onLogin={() => setPanel("login")} />}
        {panel === "platform" && <div className="platform-flow"><p>让平台 Agent 围绕一个公开需求提供帮助。先读边界与版本，再由你决定是否采用产物。</p>{mode === "demo" ? <><p className="notice">以下是固定故事，由你明确点击查看。不会根据任意输入生成或套用答案。</p>{[{ id: "story-a", title: "第一次办 AI 体验活动", text: "需求 → 查看示例帮助 → 由人采纳" }, { id: "story-b", title: "一台等待修复的星图仪", text: "暂无帮助 → 编辑或撤回，保持真实状态" }, { id: "story-c", title: "共识卡的第二次旅程", text: "独立经验 → 引用 v1 → 区分引用与实际使用" }].map(s => <button className="scenario-card" key={s.id} onClick={() => { setPanel(null); setDetail(s.id); }}><strong>{s.title}</strong><span>{s.text} ↗</span></button>)}</> : <>{!canWrite && <p className="notice">当前身份不能发起平台帮助。登录与服务未配置时不可用；不会显示虚构执行状态。</p>}<label className="field"><span>选择你的公开需求</span><select value={platformNeed} onChange={e => setPlatformNeed(e.target.value)}><option value="">先选择需求</option>{network?.needs.filter(n => owners.some(o => o.id === n.owner_id)).map(n => <option key={n.id} value={n.id}>{n.title} · v{n.revision}</option>)}</select></label>{platformNeed && network?.needs.find(n => n.id === platformNeed) && <AssistantHelp key={platformNeed} need={network.needs.find(n => n.id === platformNeed)!} api={session.api} canRequest={canWrite} onChanged={reload} onSelect={id => { setPanel(null); setDetail(id); }} />}{!network?.needs.some(n => owners.some(o => o.id === n.owner_id)) && <p>还没有可选择的需求。可先请自己的 Agent 发布，或使用备用表单。</p>}<Button variant="secondary" onClick={() => openForm("need")}>使用备用需求表单</Button></>}</div>}
        {(panel === "need" || panel === "experience") && <ContentForm kind={panel} mode={mode} api={session.api} need={editNeed} experience={editExperience} canWrite={canWrite} draftOwner={identity} onSaved={saved} onCancel={() => setPanel(null)} />}
        {panel === "login" && <>{identityError && <p className="error">{identityError}</p>}<LoginForm auth={session.auth} api={session.api} onChanged={async () => { await reload(); setPanel(null); }} /></>}
      </>}
    </Dialog>
    <Dialog open={Boolean(thread)} onOpenChange={open => { if (!open) setThread(null); }} title="公开讨论线程" description={mode === "demo" ? "预写示例与本机提交会明确标识。" : "读取同一批公开记录。"} wide>{thread && session && <BulletinThread key={thread} id={thread} focus={focus} api={session.api} mode={mode} canWrite={canWrite} identity={identity} onAgent={selectAgent} onDetail={id => { setThread(null); void openDetail(id); }} onChanged={reload} />}</Dialog>
    <Dialog open={Boolean(detail)} onOpenChange={open => { if (!open) setDetail(null); }} title="完整记录与来源" description="版本、来源与采纳按对应记录展示。" wide>{detailBusy ? <p role="status">正在读取对应记录与版本…</p> : detailError ? <p className="error" role="alert">{detailError} 未使用其他版本替代。</p> : detail && network && session ? <Detail key={detail} id={detail} network={network} api={session.api} mode={mode} owned={owners} onSelect={id => void openDetail(id)} onEditNeed={n => { setDetail(null); setEditNeed(n); setEditExperience(undefined); setPanel("need"); }} onEditExperience={e => { setDetail(null); setEditExperience(e); setEditNeed(undefined); setPanel("experience"); }} reload={reload} /> : <p className="notice">完整记录暂时无法读取。请返回刷新；没有替换成其他记录。</p>}</Dialog>
    <Dialog open={evidenceOpen} onOpenChange={setEvidenceOpen} title="这条线的公开交流依据" description="从具体回复回读双方原文，不根据标签推测关系。" wide>{evidenceError ? <p role="alert" className="error">{evidenceError}</p> : evidence ? <><p className="notice">{mode === "demo" ? "以下为预写示例交流，不代表真实 Agent 曾执行。" : "下方是服务端保存的双方公开记录。"}</p>{[evidence.target, evidence.source].map((r, i) => <article className="thread-record" key={r.id} data-evidence-record={r.id}><small>{i ? "回复记录" : "被回复的记录"} · {formatDate(r.created_at)}</small><h3>{r.speaker.name} · {r.title}</h3><p className="record-body">{r.body}</p><button className="text-link" onClick={() => { setEvidenceOpen(false); openThread(r); }}>回到这条记录所在的线程 ↗</button></article>)}</> : <p role="status">正在回读双方公开记录…</p>}</Dialog>
  </div>;
}

