"use client";
import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import type { ApiClient } from "../../lib/gongzhi/api-client";
import type { Need, Run } from "../../lib/gongzhi/contracts";
import { Button } from "../ui/button";
import { messageOf } from "./Forms";
const runLabels: Record<Run["status"], string> = { queued: "服务已确认：排队中", running: "服务已确认：正在处理", succeeded: "服务已确认：产物已提交，等待你的决定", failed: "这次帮助未完成", cancelled: "这次帮助已取消", timed_out: "这次帮助已超时", unknown: "执行状态未知，请核实已有请求" };
export function AssistantHelp({ need, api, canRequest, onChanged, onSelect }: { need: Need; api: ApiClient; canRequest: boolean; onChanged: () => Promise<void>; onSelect: (id: string) => void }) {
  const storageKey = `gongzhi.live.run.${need.owner_id}.${need.id}.${need.revision}`;
  const [key, setKey] = useState(""), [runId, setRunId] = useState<string | null>(null), [run, setRun] = useState<Run | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const locked = useRef(false);
  useEffect(() => { let key = crypto.randomUUID(), runId: string | null = null; if (canRequest) { try { const saved = JSON.parse(localStorage.getItem(storageKey) || "null"); if (typeof saved?.key === "string") key = saved.key; if (typeof saved?.runId === "string") runId = saved.runId; } catch { /* In-memory key remains stable through retries. */ } } setKey(key); setRunId(runId); setRun(null); setError(""); }, [storageKey, canRequest]);
  const remember = (knownRunId: string | null) => { try { localStorage.setItem(storageKey, JSON.stringify({ key, runId: knownRunId })); } catch { /* Never invent a receipt if browser storage is unavailable. */ } };
  async function request(kind: "start" | "read" | "cancel") { if (locked.current || !canRequest || !key) return; locked.current = true; setBusy(true); setError(""); remember(runId); try {
    const received = kind === "start" ? await api.startRun({ need_id: need.id, need_revision: need.revision, idempotency_key: key }) : kind === "cancel" ? await api.cancelRun(runId!) : await api.readRun(runId!);
    setRun(received); setRunId(received.id); remember(received.id); await onChanged();
  } catch(e) { setError(messageOf(e)); } finally { setBusy(false); locked.current = false; } }
  const active = run?.status === "queued" || run?.status === "running";
  return <section className="assistant-help"><h4><Sparkles size={16} /> 平台体验助手</h4><p>针对这个需求的当前版本，请助手尝试提供一份产物。服务未配置或额度不可用时会明确返回失败。</p>{!canRequest && <p className="notice">当前不可请求：需登录为需求发起人并建立发布身份。</p>}{["closed", "accepted"].includes(need.status) ? <p className="muted">需求已结束，不再发起帮助。</p> : <div className="action-row">{!runId && <Button variant="secondary" disabled={!canRequest || busy || !key} onClick={() => void request("start")}><Sparkles size={15} />{error ? "用同一次请求重试" : "请平台体验助手帮忙"}</Button>}{runId && <Button variant="secondary" disabled={busy || !canRequest} onClick={() => void request("read")}>查看已有请求状态</Button>}{active && <Button variant="ghost" disabled={busy || !canRequest} onClick={() => void request("cancel")}>取消这次帮助</Button>}</div>}{busy && <p role="status">正在等待服务响应；收到回执前不确认已开始或完成执行。</p>}{run && <div className="notice" role="status"><strong>{runLabels[run.status]}</strong>{run.error && <p>{run.error.message}</p>}{run.result_id && <button className="text-link" onClick={() => onSelect(run.result_id!)}>查看这次提交的产物</button>}</div>}{runId && !run && <p className="notice">本机保存了一次请求的回执编号，请查看已有状态，不会自动新开任务。</p>}{error && <div className="error" role="alert">{error}<p>没有用示例产物替代失败。重试会使用原请求标识；若状态未知，请先核实已有请求。</p></div>}</section>;
}
