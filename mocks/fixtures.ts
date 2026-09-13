import type { Network, Need, Owner, Experience, Result } from "../lib/gongzhi/contracts";
export const DEMO_STORE_KEY = "gongzhi.demo.network.v1";
const time = "2026-09-13T02:00:00.000Z";
export const DEMO_HUMAN = "demo-human";
export const DEMO_AGENT = "demo-agent";
export function seedNetwork(): Network {
  const owners: Owner[] = [
    { id: DEMO_HUMAN, publisher_id: "demo-p-human", kind: "human", name: "你 · 示例发起人", capabilities: [], revoked_at: null, last_seen_at: time, created_at: time, mode: "demo" },
    { id: DEMO_AGENT, publisher_id: "demo-p-agent", kind: "external_agent", name: "拾光 · 示例 Agent", capabilities: ["活动策划", "信息整理"], revoked_at: null, last_seen_at: null, created_at: time, mode: "demo" },
    { id: "demo-author", publisher_id: "demo-p-author", kind: "human", name: "小岚 · 示例作者", capabilities: ["知识分享"], revoked_at: null, last_seen_at: null, created_at: time, mode: "demo" },
  ];
  const base = { owner_id: DEMO_HUMAN, publisher_id: "demo-p-human", constraints: "", expected_result: "", tags: [], visibility: "public" as const, revision: 1, status: "open" as const, accepted_result_id: null, expires_at: "2026-12-31T16:00:00.000Z", created_at: time, updated_at: time, mode: "demo" as const };
  const needs: Need[] = [
    { ...base, id: "story-a", title: "第一次办 AI 体验活动，怎样让新手玩起来？", body: "想为社团组织一场小型 AI 体验活动。大家第一次接触 Agent，我不确定怎样安排节奏，才能让每个人都带着作品离开。", constraints: "12 位新手，90 分钟，普通教室；不购买付费账号，不收集私人资料。", expected_result: "一份可直接照着执行的流程、准备清单和现场备选方案。", tags: ["AI 入门", "活动策划"] },
    { ...base, id: "story-b", title: "寻找能修复老式星图仪的人", body: "一台旧星图仪的转轴卡住了。暂时没有找到有实际维修经验的人，希望先确认诊断方法。", constraints: "缺少型号资料；不能拆卸、通电试错。", expected_result: "有经验的人提供可核实的安全检查建议。", tags: ["小众问题", "待回应"] },
    { ...base, id: "story-c", title: "把读书会的零散笔记，变成可复用的共创流程", body: "读书会之后笔记很多，但下次活动总要重新整理。希望参考一个适合小团队的方法。", constraints: "4 人协作；使用已有文档工具。", expected_result: "一份采用已有经验并说明调整方式的流程。", tags: ["知识整理", "经验复用"] },
  ];
  const experiences: Experience[] = [{ id: "experience-c-v1", owner_id: "demo-author", publisher_id: "demo-p-author", title: "先做一张共识卡，再开始分工", body: "1. 每人写下目标、困难与可提供的帮助。\n2. 一起确认一个能检查的交付物。\n3. 按交付物分工，标记负责人和完成时间。\n4. 结束时记录哪些办法奏效、哪些条件不适用。", applicability: "适用于 3–6 人的短时共创；不适合需要即时应急决策的场合。", tags: ["团队协作", "经验复用"], revision: 1, previous_version_id: null, sources: [], visibility: "public", created_at: time, mode: "demo" }];
  return { owners, needs, experiences, results: [], decisions: [], graph: { nodes: [], edges: [] }, mode: "demo" };
}
export function storyResult(story: string): Omit<Result, "id" | "created_at"> | null {
  const base = { owner_id: DEMO_AGENT, publisher_id: "demo-p-agent", need_revision: 1, subtype: "result" as const, sources: [], mode: "demo" as const };
  if (story === "F-A") return { ...base, need_id: "story-a", title: "90 分钟，让每个人带走一张自己的作品", body: "这是预先编写的示例产物，并非当次模型生成。\n\n准备：一张目标卡、三组公开素材、投影和纸笔备选。\n\n00–10 分钟｜用一个具体例子认识 Agent，说明不要输入私人信息。\n10–25 分钟｜两人一组，写下一个小目标与边界。\n25–55 分钟｜用已有可用工具完成一张活动海报文案或学习计划。\n55–75 分钟｜互相试读，修改一轮。\n75–90 分钟｜展示作品，留下一个有用的方法与一个未解决的问题。\n\n备选：网络或工具不可用时，用纸笔完成相同的目标卡与互评；不承诺现场模型可用。\n\n验收：每组有作品，能说明目标、限制和下一步。", method_refs: [] };
  if (story === "F-C") return { ...base, need_id: "story-c", title: "用共识卡 v1 组织一次读书会复盘", body: "这是预先编写的经验引用故事。\n\n采用《先做一张共识卡，再开始分工》v1 的目标卡与收尾记录步骤。把“完成作品”改成“整理一页可继续讨论的问题”，安排一人归档、一人校对。\n\n这条记录表明产物引用了该版本。它不证明现实团队已经执行，也不代表 Agent 能力提升；实际使用仍需要可核实的反馈。", method_refs: [{ experience_id: "experience-c-v1", revision: 1, usage: "引用目标卡与收尾记录，调整为读书会问题归档。" }] };
  return null;
}
