"use client";
import Link from "next/link";
import { useState } from "react";
import { eligibilityLabels, type Opportunity, type OpportunityFacts, type OpportunityValue } from "@/modules/personal/opportunity-model";
import { formatMicros, formatMinor, parseMinor } from "@/modules/decision/math";
import { formatInstant, formatLocalInput, parseLocalInput } from "@/shared/time";
import { usePersonalRequest } from "./personal-controls";

export type OpportunityView = Omit<Opportunity, "deadline" | "value"> & { deadline: string; value: (Omit<OpportunityValue, "valueMicros" | "quotedAt"> & { valueMicros: string; quotedAt: string }) | null };
const inputClass = "focus-ring mt-1 min-h-11 w-full min-w-0 rounded-xl border border-line bg-surface px-3 py-2 text-sm";
const buttonClass = "focus-ring inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-3 py-2 text-xs font-bold text-brand disabled:opacity-50";
export function Opportunities({ items, profiles, evaluatedAt }: { evaluatedAt: string; items: OpportunityView[]; profiles: Array<{ promotionId: string; facts: Record<string, unknown>; ruleFingerprint: string }> }) {
  const [eligibility, setEligibility] = useState(""); const [program, setProgram] = useState(""); const [sort, setSort] = useState("priority"); const [deadline, setDeadline] = useState(""); const [value, setValue] = useState("");
  const filtered = items.filter((o) => (!eligibility || o.eligibility.status === eligibility) && (!program || o.programId === program) && (!deadline || Date.parse(o.deadline) <= Date.parse(evaluatedAt) + Number(deadline) * 86400000) && (!value || (value === "calculated" ? o.value !== null : o.value === null)));
  if (sort === "deadline") filtered.sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline) || a.id.localeCompare(b.id));
  if (sort === "value") filtered.sort((a, b) => { if (!a.value) return b.value ? 1 : a.id.localeCompare(b.id); if (!b.value) return -1; const diff = BigInt(b.value.valueMicros) - BigInt(a.value.valueMicros); return diff > 0n ? 1 : diff < 0n ? -1 : a.id.localeCompare(b.id); });
  return <>
    {items.length > 0 && <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Filter label="资格筛选" value={eligibility} set={setEligibility} options={[["", "所有资格"], ...Object.entries(eligibilityLabels)]} />
      <Filter label="会员计划" value={program} set={setProgram} options={[["", "所有计划"], ...new Map(items.map((o) => [o.programId, o.programName])).entries()]} />
      <Filter label="截止时间" value={deadline} set={setDeadline} options={[["", "不限截止时间"], ["3", "3 天内"], ["14", "14 天内"], ["30", "30 天内"]]} />
      <Filter label="价值筛选" value={value} set={setValue} options={[["", "所有价值"], ["calculated", "可计算收益"], ["unknown", "收益待计算"]]} />
      <Filter label="机会排序" value={sort} set={setSort} options={[["priority", "推荐优先级"], ["deadline", "截止时间优先"], ["value", "价值从高到低"]]} />
    </div>}
    {items.length === 0 ? <div className="rounded-2xl bg-surface-soft p-6 text-sm leading-7 text-muted"><p className="font-bold text-brand-deep">暂无适用于你的正式优惠机会</p><p>活动需经人工审核发布且当前有效。完善会员资料后，系统会按真实记录匹配。</p><Link href="/me/records" className="focus-ring mt-3 inline-block rounded-lg py-2 font-bold text-brand">完善会员与权益 →</Link></div> : filtered.length === 0 ? <p role="status" className="rounded-2xl bg-surface-soft p-5 text-sm text-muted">没有符合筛选条件的机会。</p> : <div className="grid items-start gap-4 lg:grid-cols-2">{filtered.map((o) => <OpportunityCard key={o.id} item={o} facts={profiles.find((p) => p.promotionId === o.id && p.ruleFingerprint === o.fingerprint)?.facts ?? {}} />)}</div>}
  </>;
}
function Filter({ label, value, set, options }: { label: string; value: string; set: (value: string) => void; options: string[][] }) { return <label className="text-xs font-bold text-muted">{label}<select className={inputClass} value={value} onChange={(e) => set(e.target.value)}>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>; }
function OpportunityCard({ item: o, facts }: { item: OpportunityView; facts: Record<string, unknown> }) {
  const good = o.eligibility.status === "meets-known-conditions";
  return <article data-testid="opportunity" className="min-w-0 rounded-2xl border border-line bg-surface p-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-bold text-muted">{o.programName}</span><span className={`rounded-full px-3 py-1 text-xs font-bold ${good ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{eligibilityLabels[o.eligibility.status]}</span></div>
    <h3 className="mt-3 break-words text-lg font-extrabold text-brand-deep"><Link href={o.href} className="focus-ring rounded-lg">{o.title}</Link></h3>
    <p className="mt-3 text-xl font-black text-brand-deep">{o.value ? `${o.value.label} ¥${formatMicros(BigInt(o.value.valueMicros))}` : "收益待计算"}</p>
    {o.value && <p className="mt-1 text-xs leading-6 text-muted">按保存输入估算的净增量价值，尚未实现。</p>}
    <p className="mt-1 text-xs leading-6 text-muted">下一截止：{formatInstant(o.deadline, o.timeZone)}（{o.timeZone}）</p>
    <p className="mt-3 text-sm leading-6 text-brand-deep">{o.reasons.join("；")}</p>
    {o.eligibility.status === "fails-known-conditions" && <p className="mt-2 text-xs font-bold text-rose-800">条件核对结果，暂不建议按可参加安排消费。</p>}
    <p className="mt-3 rounded-xl bg-surface-soft p-3 text-sm font-bold leading-6 text-brand">下一步：{o.nextStep}</p>
    <div className="mt-4 flex flex-wrap gap-2"><Link className={buttonClass} href={o.href}>查看活动与官方来源</Link><Link className={buttonClass} href={`/calculate/rewards?promotion=${encodeURIComponent(o.slug)}`}>计算收益</Link></div>
    <details className="mt-4 text-xs leading-6 text-muted"><summary className="focus-ring min-h-11 cursor-pointer rounded-lg py-2 font-bold text-brand">查看匹配与排序依据</summary>
      <p>已满足：{o.satisfied.join("、") || "尚无已确认条件"}</p><p>未满足：{o.eligibility.conflicts.join("；") || "未发现已知冲突"}</p><p>尚未确认：{o.eligibility.missing.join("；") || "已知结构化条件已核对"}</p>{o.eligibility.reasons.map((r) => <p key={r}>{r}</p>)}
      <p className="mt-2">优先级 {o.score}：{o.scoreReasons.join("；")}。同分按截止时间、活动 ID 排序。</p>
      <div className="my-2 flex flex-wrap gap-2"><Link className={buttonClass} href={`/calculate/rates?promotion=${encodeURIComponent(o.slug)}`}>按房价比较</Link><Link className={buttonClass} href={`/calculate/offers?promotion=${encodeURIComponent(o.slug)}`}>按优惠比较</Link></div>
      <p className="break-all">关联规则：{o.rules.map((r) => `V${r.version} (${r.id})`).join("；") || "尚未关联"}</p>
      <ul>{o.sources.map((s) => <li key={s.id}><a className="focus-ring inline-block min-h-11 rounded-lg py-2 font-bold text-brand underline" href={s.url} target="_blank" rel="noreferrer">{s.label}</a></li>)}</ul>
      {o.value && <div className="mt-2 border-t border-line pt-3"><p>{o.value.formula}</p><p>计算来源：{o.value.source} · {formatInstant(o.value.quotedAt, o.timeZone)}</p><p>假设：{o.value.assumptions.join("；") || "使用保存的原始输入"}</p>{o.value.risks.map((r) => <p key={r}>{r}</p>)}<pre className="mt-2 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(o.value.inputs, null, 2)}</pre></div>}
    </details>
    <details className="mt-2"><summary className="focus-ring min-h-11 cursor-pointer rounded-lg py-2 text-xs font-bold text-brand">补充或重新确认个人条件</summary><FactsForm opportunity={o} facts={facts} /></details>
  </article>;
}
function FactsForm({ opportunity: o, facts }: { opportunity: OpportunityView; facts: Record<string, unknown> }) {
  const { run, busy, message, setMessage } = usePersonalRequest();
  return <form className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2" onSubmit={async (e) => {
    e.preventDefault(); const form = new FormData(e.currentTarget); const next: OpportunityFacts = {};
    try {
      for (const key of ["brand", "region", "channel"] as const) { const v = String(form.get(key) ?? "").trim(); if (v) next[key] = v; }
      if (form.get("enrolled")) next.enrolled = form.get("enrolled") === "true";
      for (const key of ["usesAlready", "nights"] as const) if (form.get(key) !== "") next[key] = Number(form.get(key));
      if (form.get("spend")) next.qualifyingSpendMinor = parseMinor(String(form.get("spend"))).toString();
      if (form.get("stayAt")) next.stayAt = parseLocalInput(String(form.get("stayAt")), o.timeZone).toISOString();
      await run("/api/personal/opportunities", { promotionId: o.id, fingerprint: o.fingerprint, facts: next });
    } catch { setMessage("请检查金额、晚数、次数和日期格式"); }
  }}>
    {[["brand", "酒店品牌"], ["region", "地区"], ["channel", "预订渠道"]].map(([name, label]) => <label key={name} className="text-xs text-muted">{label}<input name={name} defaultValue={typeof facts[name] === "string" ? facts[name] : ""} maxLength={120} className={inputClass} /></label>)}
    <label className="text-xs text-muted">报名状态<select name="enrolled" defaultValue={facts.enrolled === undefined ? "" : String(facts.enrolled)} className={inputClass}><option value="">尚未确认</option><option value="true">已完成报名</option><option value="false">尚未报名</option></select></label>
    <label className="text-xs text-muted">合资格消费（元）<input name="spend" inputMode="decimal" defaultValue={typeof facts.qualifyingSpendMinor === "string" ? formatMinor(BigInt(facts.qualifyingSpendMinor)) : ""} className={inputClass} /></label>
    {[["nights", "已确认入住晚数"], ["usesAlready", "已使用次数"]].map(([name, label]) => <label key={name} className="text-xs text-muted">{label}<input name={name} type="number" min="0" step="1" defaultValue={typeof facts[name] === "number" ? facts[name] : ""} className={inputClass} /></label>)}
    <label className="text-xs text-muted">入住日期与时间（{o.timeZone}）<input name="stayAt" type="datetime-local" defaultValue={typeof facts.stayAt === "string" ? formatLocalInput(new Date(facts.stayAt), o.timeZone) : ""} className={inputClass} /></label>
    <p className="text-xs leading-6 text-muted sm:col-span-2">仅填写有依据的实际条件；留空表示未知。会员等级、信用卡和权益请在会员资料中登记。</p><button disabled={busy} className={`${buttonClass} sm:col-span-2`}>保存并重新核对</button><p role="status" className="text-xs text-brand sm:col-span-2">{message}</p>
  </form>;
}
export type ReminderView = { id: string; title: string; detail: string; href: string; status: string; active: boolean; deadlineAt: string | null; timeZone: string; snoozedUntil: string | null };
export function ReminderCenter({ items }: { items: ReminderView[] }) {
  const [history, setHistory] = useState(false);
  const shown = items.filter((r) => history ? !r.active || !["pending", "read"].includes(r.status) : r.active && ["pending", "read"].includes(r.status));
  return <><div className="mb-4 flex flex-wrap gap-2"><button aria-pressed={!history} onClick={() => setHistory(false)} className={buttonClass}>待处理提醒</button><button aria-pressed={history} onClick={() => setHistory(true)} className={buttonClass}>已处理与稍后</button></div>{!shown.length ? <p className="rounded-2xl bg-surface-soft p-5 text-sm leading-7 text-muted">{history ? "暂无已处理或稍后的提醒。" : "当前没有需要处理的提醒，状态正常。"}</p> : <div className="space-y-3">{shown.map((r) => <ReminderItem key={r.id} reminder={r} />)}</div>}</>;
}
function ReminderItem({ reminder: r }: { reminder: ReminderView }) {
  const { run, busy, message } = usePersonalRequest();
  const labels: Record<string, string> = { pending: "待处理", read: "已读", completed: "已完成", ignored: "已忽略", snoozed: "稍后处理" };
  return <article data-testid="reminder" className="rounded-2xl border border-line p-4"><div className="flex flex-wrap justify-between gap-2"><Link href={r.href} className="focus-ring rounded-lg text-sm font-bold text-brand-deep">{r.title}</Link><span className="text-xs font-bold text-muted">{labels[r.status]}{!r.active && " · 已不适用"}</span></div><p className="mt-1 text-xs leading-6 text-muted">{r.detail}</p><p className="text-xs leading-6 text-muted">{r.deadlineAt ? `截止：${formatInstant(r.deadlineAt, r.timeZone)}（${r.timeZone}）` : "核对当前规则版本"}{r.snoozedUntil && ` · 稍后时间：${formatInstant(r.snoozedUntil, "Asia/Hong_Kong")}（香港）`}</p>{r.active && <div className="mt-3 flex flex-wrap gap-2">{[["read", "已读"], ["completed", "完成"], ["ignored", "忽略"], ["snoozed", "稍后一天"]].map(([status, title]) => <button key={status} disabled={busy || r.status === status} className={buttonClass} onClick={() => run(`/api/personal/reminders/${r.id}`, { status, ...(status === "snoozed" ? { snoozedUntil: new Date(Date.now() + 86400000).toISOString() } : {}) }, { method: "PATCH" })}>{title}</button>)}</div>}<p role="status" className="mt-1 text-xs text-brand">{message}</p></article>;
}
