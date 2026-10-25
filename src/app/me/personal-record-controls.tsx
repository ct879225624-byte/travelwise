"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { formatMicros } from "@/modules/decision/math";
import { Field, SubmitStatus, formString, hongKongInstant, usePersonalRequest } from "./personal-controls";

const inputClass = "mt-1 w-full min-w-0 rounded-xl border border-line bg-surface px-3 py-2 text-sm";
const actionStatuses = ["saved", "planned", "registered", "participating", "in_progress", "likely_qualified", "qualified", "awaiting_reward", "claimed", "reward_credited", "completed", "abandoned", "failed", "expired"] as const;
export const statusLabels: Record<string, string> = { saved: "已收藏", planned: "计划参加", registered: "已报名", participating: "参与中", in_progress: "进行中", likely_qualified: "可能达标", qualified: "已确认达标", awaiting_reward: "待领奖", claimed: "已领取", reward_credited: "奖励到账", completed: "已完成", abandoned: "已放弃", failed: "失败", expired: "已过期", cancelled: "已取消" };
type ActionRow = { id: string; status: string; notes: string | null; progress: Record<string, unknown>; expectedRewardPoints: string | null; actualRewardPoints: string | null; rewardCreditedAt: string | null };
type TaskRow = { id: string; status: string };
type ScenarioRow = { id: string; name: string; notes: string | null; calculatorType: string; quotedAt: Date | null; quoteSource: string | null; pointValueMicros: bigint | null; inputSnapshot: Record<string, unknown>; result: Record<string, unknown>; ruleVersionIds: string[]; ruleSnapshots: Record<string, unknown>[]; membershipSnapshot: Record<string, unknown>; assumptions: string[]; unresolved: string[] };

export function ActionStatusControl({ action }: { action: ActionRow }) {
  const { busy, message, run } = usePersonalRequest();
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); await run(`/api/personal/actions/${action.id}`, { status: formString(data, "status"), notes: formString(data, "notes") || null, progress: { ...action.progress, qualificationNotes: formString(data, "progress") }, expectedRewardPoints: formString(data, "expectedRewardPoints") || null }, { method: "PATCH" }); }
  return <details className="min-w-0"><summary className="cursor-pointer text-xs font-bold text-brand">{statusLabels[action.status] ?? action.status} · 管理进度</summary><form onSubmit={submit} className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2"><Field label="活动进度"><select name="status" aria-label="活动进度" defaultValue={action.status} className={inputClass}>{actionStatuses.map((status) => <option key={status} value={status} disabled={status === "reward_credited" && !action.rewardCreditedAt}>{statusLabels[status]}</option>)}</select></Field><Field label="预计奖励积分（未到账不会增加余额）"><input name="expectedRewardPoints" defaultValue={action.expectedRewardPoints ?? ""} inputMode="numeric" pattern="[0-9]+" className={inputClass} /></Field><Field label="个人达标信息"><textarea name="progress" defaultValue={String(action.progress.qualificationNotes ?? "")} maxLength={2000} className={inputClass} placeholder="如已住晚数、核实条件、尚缺事项" /></Field><Field label="活动备注"><textarea name="notes" maxLength={2000} defaultValue={action.notes ?? ""} className={inputClass} /></Field><SubmitStatus busy={busy} message={message} label="保存参与进度" /></form>{action.rewardCreditedAt ? <p className="mt-3 text-xs font-bold text-emerald-700">已确认到账 {action.actualRewardPoints ?? "未知"} 分。到账记录会保留，变更进度不会再次入账。</p> : <RewardCreditControl action={action} />}</details>;
}

function RewardCreditControl({ action }: { action: ActionRow }) {
  const { busy, message, setMessage, run } = usePersonalRequest();
  const [expiry, setExpiry] = useState("unknown");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); if (!window.confirm("确认这笔奖励已经实际到账？保存后会创建积分批次，请先核对实际积分。")) return; try { await run("/api/personal/rewards/credit", { actionId: action.id, actualPoints: formString(data, "actualPoints"), ...(formString(data, "earnedAt") ? { earnedAt: hongKongInstant(formString(data, "earnedAt")) } : {}), expiryStatus: expiry, expiresAt: expiry === "known" ? hongKongInstant(formString(data, "expiresAt"), true) : null, evidenceNote: formString(data, "evidenceNote") || null }, { keyField: "idempotencyKey" }); } catch (error) { setMessage(error instanceof Error ? error.message : "请检查输入"); } }
  return <details className="mt-4 min-w-0 rounded-xl bg-surface-soft p-3"><summary className="cursor-pointer text-xs font-bold text-brand">确认奖励实际到账</summary><form onSubmit={submit} className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2"><Field label="实际到账积分"><input name="actualPoints" required defaultValue={action.expectedRewardPoints ?? ""} inputMode="numeric" pattern="[0-9]+" className={inputClass} /></Field><Field label="实际到账时间（香港时间，留空为现在）"><input name="earnedAt" type="datetime-local" className={inputClass} /></Field><Field label="积分到期状态"><select value={expiry} onChange={(event) => setExpiry(event.target.value)} className={inputClass}><option value="unknown">未知到期日</option><option value="known">有明确到期日</option><option value="never">有依据确认永不过期</option></select></Field>{expiry === "known" && <Field label="到期日（香港时间）"><input name="expiresAt" type="date" required className={inputClass} /></Field>}<Field label="到账证据或人工备注"><textarea name="evidenceNote" maxLength={2000} className={inputClass} /></Field><SubmitStatus busy={busy} message={message} label="确认奖励到账并入账" /></form></details>;
}

export function TaskCompleteButton({ task }: { task: TaskRow }) {
  const { busy, message, run } = usePersonalRequest();
  if (task.status === "completed") return <span className="text-xs font-bold text-emerald-700">已完成</span>;
  if (task.status === "cancelled") return <span className="text-xs text-muted">已取消</span>;
  return <div className="text-xs"><button disabled={busy} className="focus-ring rounded-lg border border-line px-3 py-2 font-bold text-brand disabled:opacity-50" onClick={() => run(`/api/personal/tasks/${task.id}`, {}, { method: "PATCH" })}>{busy ? "保存中…" : "标记完成"}</button>{message && <span role="status" className="ml-2 break-words">{message}</span>}</div>;
}

export function ScenarioControls({ scenario }: { scenario: ScenarioRow }) {
  const { busy, message, setMessage, run } = usePersonalRequest();
  const router = useRouter();
  async function edit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); await run(`/api/personal/scenarios/${scenario.id}`, { name: formString(data, "name"), notes: formString(data, "notes") || null }, { method: "PATCH" }); }
  async function remove() { if (window.confirm("删除这条私人方案？此操作不能撤销。")) await run(`/api/personal/scenarios/${scenario.id}`, {}, { method: "DELETE" }); }
  function recalculate() {
    try { const target = scenario.calculatorType === "rate-comparison" ? "rates" : scenario.calculatorType === "offer-comparison" ? "offers" : "rewards"; sessionStorage.setItem("travelwise:recalculate", JSON.stringify({ calculatorType: scenario.calculatorType, inputSnapshot: scenario.inputSnapshot })); router.push(`/calculate/${target}?restore=1`); }
    catch { setMessage("浏览器暂时无法保存原始输入，请允许本网站使用会话存储后重试。"); }
  }
  const json = (value: unknown) => JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item, 2);
  const labels: Record<string, string> = { "rate-comparison": "房价与积分", "offer-comparison": "优惠方案对比", "activity-reward": "活动收益" };
  return <details className="min-w-0 border-b border-line py-3 last:border-0"><summary className="cursor-pointer break-words font-bold text-brand-deep">{scenario.name} · {labels[scenario.calculatorType] ?? scenario.calculatorType}</summary><div className="mt-3 min-w-0 space-y-3 text-xs leading-5 text-muted">
    <p>报价时间：{scenario.quotedAt ? new Date(scenario.quotedAt).toLocaleString("zh-CN", { timeZone: "Asia/Hong_Kong" }) : "未登记"}（香港时间） · 来源：{scenario.quoteSource || "未登记"}</p><p>每积分估值：{scenario.pointValueMicros === null ? "未知" : `${formatMicros(scenario.pointValueMicros)} 元`}</p>
    <p className="break-all">规则版本：{scenario.ruleVersionIds.length ? scenario.ruleVersionIds.join("，") : "无关联规则版本"}</p><p>假设：{scenario.assumptions.length ? scenario.assumptions.join("；") : "无"}</p><p>未确认：{scenario.unresolved.length ? scenario.unresolved.join("；") : "无"}</p>
    <details><summary className="cursor-pointer font-bold">原始输入与会员快照</summary><pre className="mt-2 max-h-64 min-w-0 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-surface-soft p-3">{json({ input: scenario.inputSnapshot, membership: scenario.membershipSnapshot })}</pre></details><details><summary className="cursor-pointer font-bold">规则依据与历史结果</summary><pre className="mt-2 max-h-64 min-w-0 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-surface-soft p-3">{json({ rules: scenario.ruleSnapshots, result: scenario.result })}</pre></details>
    <form onSubmit={edit} className="grid min-w-0 gap-3"><Field label="方案名称"><input name="name" defaultValue={scenario.name} required maxLength={160} className={inputClass} /></Field><Field label="方案备注"><textarea name="notes" defaultValue={scenario.notes ?? ""} maxLength={2000} className={inputClass} /></Field><button disabled={busy} className="justify-self-start rounded-lg border border-line px-3 py-2 font-bold text-brand disabled:opacity-50">保存名称和备注</button></form><p>重新计算恢复原始报价和手动参数，并读取当前关联规则；请重新核对资格。再次保存时会记录最新会员资料，并保留这份历史快照。重新保存后会生成新方案。</p><div className="flex flex-wrap gap-2"><button onClick={recalculate} className="focus-ring rounded-lg bg-brand px-3 py-2 font-bold text-white">根据原始输入重新计算</button><button onClick={remove} disabled={busy} className="focus-ring rounded-lg border border-rose-200 px-3 py-2 font-bold text-rose-700 disabled:opacity-50">删除方案</button></div>{message && <p role="status" className="break-words">{message}</p>}
  </div></details>;
}
