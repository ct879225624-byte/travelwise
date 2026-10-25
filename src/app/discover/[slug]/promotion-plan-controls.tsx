"use client";
import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";

type TaskDraft = { key: string; title: string; deadlineAt: string | null };
const inputClass = "mt-1 w-full min-w-0 rounded-lg border border-line bg-surface px-3 py-2 text-xs";

export function PromotionPlanControls({ promotionId, authenticated, taskDrafts }: { promotionId: string; authenticated: boolean; taskDrafts: TaskDraft[] }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [cycleKey, setCycleKey] = useState("default");
  const [actionId, setActionId] = useState<string | null>(null);
  const [savedCycle, setSavedCycle] = useState<string | null>(null);
  async function post(url: string, value: Record<string, unknown>) { const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error ?? "保存失败，请重试"); return body; }
  async function save(status: "saved" | "planned") {
    if (pending.current) return;
    if (!cycleKey.trim()) { setMessage("请填写参与周期"); return; }
    pending.current = true; setBusy(true); setMessage("保存中…");
    try { const body = await post("/api/personal/actions", { promotionId, status, cycleKey: cycleKey.trim() }); setActionId(body.id ?? body.action?.id ?? null); setSavedCycle(cycleKey.trim()); setMessage(status === "saved" ? "已收藏活动" : "已加入我的计划。可继续核对待办草稿。"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "保存失败"); }
    finally { pending.current = false; setBusy(false); }
  }
  async function confirmTasks(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending.current || !actionId || savedCycle !== cycleKey.trim()) return;
    const form = new FormData(event.currentTarget); const selected = taskDrafts.filter((draft) => form.has(`select-${draft.key}`));
    if (!selected.length) { setMessage("请至少选择一项待办"); return; }
    pending.current = true; setBusy(true); setMessage("创建待办中…");
    try {
      for (const draft of selected) { const source = String(form.get(`source-${draft.key}`) ?? "unconfirmed"); await post("/api/personal/tasks", { actionId, draftKey: `promotion:${actionId}:${draft.key}`, title: draft.title, deadlineSource: source, deadlineAt: source === "unconfirmed" ? null : draft.deadlineAt, priority: 2, notes: String(form.get(`note-${draft.key}`) ?? "") || null }); }
      setMessage("选中的待办已创建。重复确认不会重复创建。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "创建失败，可重试未完成的待办"); }
    finally { pending.current = false; setBusy(false); }
  }
  return <div className="mt-5 min-w-0 rounded-2xl border border-line bg-surface-soft p-4"><p className="text-sm leading-6 text-muted">收藏和加入计划会写入当前 Owner 的私人记录。同一活动的不同真实参与请使用不同周期。</p><label className="mt-3 block text-xs font-bold text-muted">参与周期<input aria-label="参与周期" maxLength={80} value={cycleKey} onChange={(event) => { setCycleKey(event.target.value); setActionId(null); }} className={inputClass} placeholder="如 2026-10 / 第一次住宿" /></label><div className="mt-3 flex flex-wrap items-center gap-2"><button disabled={busy} onClick={() => save("saved")} className="focus-ring rounded-xl border border-line px-4 py-3 text-sm font-bold text-brand disabled:opacity-50">收藏活动</button><button disabled={busy} onClick={() => save("planned")} className="focus-ring rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white disabled:opacity-50">加入我的计划</button>{!authenticated && <Link href="/admin/login?callbackUrl=/me" className="text-xs font-bold text-brand">登录后使用</Link>}{authenticated && <Link href="/me/records#activities" className="text-xs font-bold text-brand">查看我的活动</Link>}</div>
    {actionId && savedCycle === cycleKey.trim() && <details className="mt-4 min-w-0"><summary className="cursor-pointer text-sm font-bold text-brand">核对活动待办草稿</summary><p className="mt-2 text-xs leading-5 text-muted">以下草稿尚未创建。请按活动实际需要选择，并核对日期来源；涉及节假日顺延且窗口不确定时，请选择“尚未确认”。</p><form onSubmit={confirmTasks} className="mt-3 space-y-3">{taskDrafts.map((draft) => <div key={draft.key} className="min-w-0 rounded-xl border border-line bg-surface p-3"><label className="flex items-start gap-2 text-xs font-bold text-brand-deep"><input name={`select-${draft.key}`} type="checkbox" className="mt-0.5 shrink-0" /><span>{draft.title}</span></label><p className="mt-2 text-xs text-muted">规则中的基础时间：{draft.deadlineAt ? new Date(draft.deadlineAt).toLocaleString("zh-CN", { timeZone: "Asia/Hong_Kong", hour12: false }) + "（香港时间）" : "未知"}</p><label className="mt-2 block text-xs text-muted">时间来源<select name={`source-${draft.key}`} defaultValue={draft.deadlineAt ? "rule-derived" : "unconfirmed"} className={inputClass}><option value="unconfirmed">尚未确认（不设置确定截止时间）</option>{draft.deadlineAt && <><option value="rule-derived">根据规则推算，仍需核实顺延</option><option value="official">已逐项核对为官方确认日期</option><option value="manual">采用此日期作为人工提醒</option></>}</select></label><label className="mt-2 block text-xs text-muted">时间依据或备注<input name={`note-${draft.key}`} maxLength={2000} className={inputClass} /></label></div>)}<label className="flex items-start gap-2 text-xs leading-5 text-muted"><input type="checkbox" required className="mt-1 shrink-0" /><span>我已核对所选任务的必要性、时间和来源，确认创建站内待办。</span></label><button disabled={busy} className="focus-ring rounded-lg bg-brand px-3 py-2 text-xs font-bold text-white disabled:opacity-50">确认创建选中的待办</button></form></details>}{message && <p role="status" className="mt-3 break-words text-sm font-bold text-brand">{message}</p>}
  </div>;
}
