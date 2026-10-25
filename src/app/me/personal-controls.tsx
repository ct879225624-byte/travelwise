"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { parseMinor, parsePointValue } from "@/modules/decision/math";

const inputClass = "mt-1 w-full min-w-0 rounded-xl border border-line bg-surface px-3 py-2 text-sm";
type Benefit = { name: string; kind: string; expiresAt: string | null; usedAt: string | null };
type Membership = { membershipTier: string | null; pointsValidUntil: string | null; tierExpiresAt: string | null; benefits: Benefit[]; cardHeld: boolean | null; cardType: string | null; notes: string | null };
type Program = { code: string; name: string; pointsName: string; membership?: Membership };
type Batch = { id: string; source: string; remainingPoints: string; expiryStatus: string; expiresAt: string | null };
type LinkedAction = { id: string; title: string };

export function localDate(value: string | null) { return value ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)) : ""; }
export function formString(form: FormData, name: string) { return String(form.get(name) ?? "").trim(); }
export function hongKongInstant(value: string, endOfDay = false) { return value ? new Date(`${value}${value.includes("T") ? "" : endOfDay ? "T23:59:59" : "T00:00:00"}+08:00`).toISOString() : null; }

export function usePersonalRequest() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef(false);
  const intent = useRef<{ signature: string; key: string } | null>(null);
  const router = useRouter();
  async function run(url: string, body: Record<string, unknown>, options: { method?: string; keyField?: string; reset?: HTMLFormElement } = {}) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setMessage("保存中…");
    try {
      const signature = JSON.stringify({ url, body });
      const storageKey = `travelwise:pending:${url}:${String(body.op ?? "")}`;
      if (intent.current?.signature !== signature) {
        let previous: { signature?: string; key?: string } | null = null;
        try { previous = JSON.parse(sessionStorage.getItem(storageKey) ?? "null"); } catch { /* Storage may be disabled. */ }
        intent.current = { signature, key: previous?.signature === signature && previous.key ? previous.key : crypto.randomUUID() };
      }
      // Retain an unacknowledged request across refresh, including a lost response.
      if (options.keyField) try { sessionStorage.setItem(storageKey, JSON.stringify(intent.current)); } catch { /* In-memory protection remains available. */ }
      const payload = options.keyField ? { ...body, [options.keyField]: intent.current.key } : body;
      const response = await fetch(url, { method: options.method ?? "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "保存失败，请重试");
      if (options.keyField) try { sessionStorage.removeItem(storageKey); } catch { /* No persistent storage to clear. */ }
      setMessage("已保存");
      if (options.reset) { options.reset.reset(); intent.current = null; }
      router.refresh();
      return result;
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败，请重试"); }
    finally { pending.current = false; setBusy(false); }
  }
  return { busy, message, setMessage, run };
}

export function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block min-w-0 text-xs font-bold text-muted">{label}{children}</label>; }
export function SubmitStatus({ busy, message, label }: { busy: boolean; message: string; label: string }) { return <div className="col-span-full flex flex-wrap items-center gap-3"><button disabled={busy} className="focus-ring rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy ? "保存中…" : label}</button><span role="status" className="break-words text-xs text-brand">{message}</span></div>; }

export function PersonalControls({ programs, batches, actions }: { programs: Program[]; batches: Batch[]; actions: LinkedAction[] }) {
  const options = programs.length ? programs : [{ code: "jinjiang-rewards", name: "锦江荟", pointsName: "锦江积分" }];
  return <section className="mt-8 min-w-0 rounded-[2rem] border border-line bg-surface p-5 sm:p-7" aria-label="个人记录操作">
    <h2 className="text-lg font-extrabold text-brand-deep">登记与管理</h2>
    <div className="mt-4 divide-y divide-line">
      <FormPanel title="会员资料与持有权益"><MembershipForm programs={options} /></FormPanel>
      <FormPanel title="核对已知会员条件"><MembershipCheck programs={options} /></FormPanel>
      <FormPanel title="新增积分到账 / 期初余额"><CreditForm programs={options} /></FormPanel>
      <FormPanel title="登记积分兑换或现金优惠"><RealizedForm programs={options} actions={actions} /></FormPanel>
      <FormPanel title="调整错误账目 / 确认积分到期"><AdjustmentForm programs={options} /><ExpiryForm batches={batches} /></FormPanel>
      <FormPanel title="新增站内待办"><TaskForm actions={actions} batches={batches} /></FormPanel>
    </div>
  </section>;
}

function FormPanel({ title, children }: { title: string; children: ReactNode }) { return <details className="min-w-0 py-4"><summary className="cursor-pointer text-sm font-bold text-brand">{title}</summary><div className="mt-4 space-y-4">{children}</div></details>; }
function ProgramSelect({ programs, onChange }: { programs: Program[]; onChange?: (code: string) => void }) { return <Field label="会员计划"><select name="programCode" className={inputClass} onChange={(event) => onChange?.(event.target.value)}>{programs.map((program) => <option key={program.code} value={program.code}>{program.name}</option>)}</select></Field>; }

function MembershipCheck({ programs }: { programs: Program[] }) {
  const { busy, message, run } = usePersonalRequest();
  const [result, setResult] = useState<{ status: string; reasons: string[] } | null>(null);
  return <form className="grid min-w-0 gap-4 sm:grid-cols-2" onSubmit={async (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const response = await run("/api/personal/qualification", { programCode: formString(data, "programCode"), requiredTiers: formString(data, "requiredTiers").split(/[,，]/).map((v) => v.trim()).filter(Boolean), cardRequired: data.has("cardRequired") }); if (response) setResult(response); }}><ProgramSelect programs={programs} /><Field label="本次活动明确要求的等级（多个用逗号分隔）"><input name="requiredTiers" maxLength={1000} className={inputClass} placeholder="如：白金，黑金；没有等级要求可留空" /></Field><label className="text-xs text-muted"><input type="checkbox" name="cardRequired" /> 本次条件要求持有联名卡</label><p className="col-span-full text-xs leading-5 text-muted">按已保存的最新资料核对，仅涵盖你列出的条件；不会据此断言符合所有活动或已获官方验证。</p><SubmitStatus busy={busy} message={message} label="使用当前资料核对" />{result && <p role="status" className="col-span-full break-words text-xs leading-5 text-brand">{result.status === "meets-known-conditions" ? "根据登记资料，符合本次列出的已知条件。" : result.status === "fails-known-conditions" ? "登记资料不符合本次列出的条件。" : "信息不足。"} {result.reasons.join("；")} 其他活动条件仍需逐项核实。</p>}</form>;
}

function MembershipForm({ programs }: { programs: Program[] }) {
  const [code, setCode] = useState(programs[0].code);
  const current = programs.find((program) => program.code === code)?.membership;
  return <div><ProgramSelect programs={programs} onChange={setCode} /><MembershipFields key={`${code}:${JSON.stringify(current)}`} code={code} current={current} /></div>;
}

function MembershipFields({ code, current }: { code: string; current?: Membership }) {
  const { busy, message, setMessage, run } = usePersonalRequest();
  const [benefits, setBenefits] = useState<Benefit[]>(current?.benefits ?? []);
  function updateBenefit(index: number, change: Partial<Benefit>) { setBenefits((items) => items.map((item, position) => position === index ? { ...item, ...change } : item)); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    try {
      const held = formString(data, "cardHeld");
      await run("/api/personal/membership", { programCode: code, membershipTier: formString(data, "membershipTier") || null, pointsValidUntil: hongKongInstant(formString(data, "pointsValidUntil"), true), tierExpiresAt: hongKongInstant(formString(data, "tierExpiresAt"), true), cardHeld: held === "unknown" ? null : held === "yes", cardType: formString(data, "cardType") || null, notes: formString(data, "notes") || null, benefits: benefits.map((_, index) => ({ name: formString(data, `benefitName-${index}`), kind: formString(data, `benefitKind-${index}`), expiresAt: hongKongInstant(formString(data, `benefitExpiry-${index}`), true), usedAt: hongKongInstant(formString(data, `benefitUsed-${index}`)) })) });
    } catch (error) { setMessage(error instanceof Error ? error.message : "请检查输入"); }
  }
  return <form onSubmit={submit} className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
    <Field label="会员等级（可以未知）"><select name="membershipTier" defaultValue={current?.membershipTier ?? ""} className={inputClass}>{["", "普通", "银卡", "金卡", "白金", "黑金", ...(["普通", "银卡", "金卡", "白金", "黑金", ""].includes(current?.membershipTier ?? "") ? [] : [current!.membershipTier!])].map((tier) => <option key={tier} value={tier}>{tier || "未知"}</option>)}</select></Field>
    <Field label="会员等级到期日（香港时间）"><input name="tierExpiresAt" type="date" defaultValue={localDate(current?.tierExpiresAt ?? null)} className={inputClass} /></Field>
    <Field label="人工登记的积分有效期（不能代替各批次到期日）"><input name="pointsValidUntil" type="date" defaultValue={localDate(current?.pointsValidUntil ?? null)} className={inputClass} /></Field>
    <Field label="是否持有联名卡"><select name="cardHeld" defaultValue={current?.cardHeld === null || current?.cardHeld === undefined ? "unknown" : current.cardHeld ? "yes" : "no"} className={inputClass}><option value="unknown">未知</option><option value="yes">持有</option><option value="no">未持有</option></select></Field>
    <Field label="卡种或权益类型（不填卡号）"><input name="cardType" maxLength={120} defaultValue={current?.cardType ?? ""} className={inputClass} /></Field>
    <Field label="会员备注"><textarea name="notes" maxLength={2000} defaultValue={current?.notes ?? ""} className={inputClass} /></Field>
    <div className="col-span-full space-y-3"><p className="text-xs font-bold text-muted">持有的券或权益</p>{benefits.map((benefit, index) => <div key={index} className="grid min-w-0 gap-3 rounded-xl bg-surface-soft p-3 sm:grid-cols-2"><Field label={`权益 ${index + 1} 名称`}><input name={`benefitName-${index}`} required maxLength={200} value={benefit.name} onChange={(event) => updateBenefit(index, { name: event.target.value })} className={inputClass} /></Field><Field label="类型"><input name={`benefitKind-${index}`} required maxLength={80} value={benefit.kind} onChange={(event) => updateBenefit(index, { kind: event.target.value })} className={inputClass} placeholder="优惠券 / 早餐 / 延迟退房" /></Field><Field label="权益到期日"><input name={`benefitExpiry-${index}`} type="date" value={localDate(benefit.expiresAt)} onChange={(event) => updateBenefit(index, { expiresAt: hongKongInstant(event.target.value, true) })} className={inputClass} /></Field><Field label="已使用日期（未使用留空）"><input name={`benefitUsed-${index}`} type="date" value={localDate(benefit.usedAt)} onChange={(event) => updateBenefit(index, { usedAt: hongKongInstant(event.target.value) })} className={inputClass} /></Field><button type="button" onClick={() => setBenefits((items) => items.filter((_, position) => position !== index))} className="justify-self-start text-xs font-bold text-rose-700">移除此项权益</button></div>)}<button type="button" onClick={() => setBenefits((items) => [...items, { name: "", kind: "", expiresAt: null, usedAt: null }])} disabled={benefits.length >= 50} className="rounded-lg border border-line px-3 py-2 text-xs font-bold text-brand">添加一项权益</button></div>
    <p className="col-span-full text-xs leading-5 text-muted">保存表示本次人工核对；会员等级仅用于已知条件判断，活动仍需逐项核对资格。</p><SubmitStatus busy={busy} message={message} label="保存会员资料" />
  </form>;
}

function CreditForm({ programs }: { programs: Program[] }) {
  const { busy, message, setMessage, run } = usePersonalRequest();
  const [expiry, setExpiry] = useState("unknown");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); try { await run("/api/personal/points", { op: "credit", programCode: formString(data, "programCode"), source: formString(data, "source"), sourceType: formString(data, "sourceType"), points: formString(data, "points"), ...(formString(data, "earnedAt") ? { earnedAt: hongKongInstant(formString(data, "earnedAt")) } : {}), expiryStatus: expiry, expiresAt: expiry === "known" ? hongKongInstant(formString(data, "expiresAt"), true) : null, evidenceNote: formString(data, "evidenceNote") || null }, { keyField: "idempotencyKey", reset: form }); } catch (error) { setMessage(error instanceof Error ? error.message : "请检查输入"); } }
  return <form onSubmit={submit} className="grid min-w-0 gap-4 sm:grid-cols-2"><ProgramSelect programs={programs} /><Field label="到账积分"><input name="points" required inputMode="numeric" pattern="[0-9]+" className={inputClass} /></Field><Field label="来源说明"><input name="source" required maxLength={200} className={inputClass} placeholder="如：期初余额 / 10 月住宿" /></Field><Field label="来源类型"><select name="sourceType" className={inputClass}><option value="initial_balance">期初余额登记</option><option value="hotel_stay">酒店住宿获得</option><option value="activity_reward">活动奖励</option><option value="credit_card">信用卡积分</option><option value="other">其他明确来源</option></select></Field><Field label="实际到账时间（香港时间，留空为现在）"><input type="datetime-local" name="earnedAt" className={inputClass} /></Field><Field label="到期状态"><select name="expiryStatus" value={expiry} onChange={(event) => setExpiry(event.target.value)} className={inputClass}><option value="unknown">未知到期日</option><option value="known">有明确到期日</option><option value="never">有依据确认永不过期</option></select></Field>{expiry === "known" && <Field label="到期日（香港时间，当日结束）"><input name="expiresAt" type="date" required className={inputClass} /></Field>}<Field label="证据或人工备注"><textarea name="evidenceNote" maxLength={2000} className={inputClass} /></Field><p className="col-span-full text-xs leading-5 text-muted">只登记已经到账的积分。期初余额无需补齐过去的消费记录。</p><SubmitStatus busy={busy} message={message} label="确认积分到账" /></form>;
}

function RealizedForm({ programs, actions }: { programs: Program[]; actions: LinkedAction[] }) {
  const { busy, message, setMessage, run } = usePersonalRequest();
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); try { const amount = (name: string) => formString(data, name) ? parseMinor(formString(data, name)).toString() : null; await run("/api/personal/rewards/realize", { programCode: formString(data, "programCode"), actionId: formString(data, "actionId") || null, source: formString(data, "source"), points: formString(data, "points"), cashMinor: amount("cash"), pointValueMicros: formString(data, "pointValue") ? parsePointValue(formString(data, "pointValue")).toString() : null, costMinor: amount("cost"), foregoneValueMinor: amount("foregone"), note: formString(data, "note") || null }, { keyField: "idempotencyKey", reset: form }); } catch (error) { setMessage(error instanceof Error ? error.message : "请检查输入"); } }
  return <form onSubmit={submit} className="grid min-w-0 gap-4 sm:grid-cols-2"><ProgramSelect programs={programs} /><Field label="关联活动（可选）"><select name="actionId" className={inputClass}><option value="">无</option>{actions.map((action) => <option key={action.id} value={action.id}>{action.title}</option>)}</select></Field><Field label="兑现记录名称"><input name="source" required maxLength={200} className={inputClass} placeholder="如：积分抵扣住宿" /></Field><Field label="实际消耗积分（现金优惠填 0）"><input name="points" required defaultValue="0" inputMode="numeric" pattern="[0-9]+" className={inputClass} /></Field><Field label="可证明的现金节省（元；没有基准留空）"><input name="cash" inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" className={inputClass} /></Field><Field label="每积分机会成本（元；未知留空）"><input name="pointValue" inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,6})?" className={inputClass} placeholder="如 0.02" /></Field><Field label="额外参与成本（元；没有填 0）"><input name="cost" defaultValue="0" inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" className={inputClass} /></Field><Field label="放弃其他权益的价值（元；没有填 0）"><input name="foregone" defaultValue="0" inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" className={inputClass} /></Field><Field label="现金基准、交易依据与备注"><textarea name="note" maxLength={2000} className={inputClass} placeholder="如：同条件现金价 260 元，实际支付 100 元。没有比较基准请说明。" /></Field><p className="col-span-full text-xs leading-5 text-muted">保存时同时扣减可用积分并记录兑现。未填现金基准的记录不计入已证明现金节省；综合价值会扣除积分机会成本、参与成本和放弃的权益价值。</p><SubmitStatus busy={busy} message={message} label="确认兑换与兑现记录" /></form>;
}

function AdjustmentForm({ programs }: { programs: Program[] }) {
  const { busy, message, run } = usePersonalRequest();
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); await run("/api/personal/points", { op: "adjustment", programCode: formString(data, "programCode"), points: formString(data, "points"), source: "手动调整错误账目", note: formString(data, "note") }, { keyField: "idempotencyKey", reset: form }); }
  return <form onSubmit={submit} className="grid min-w-0 gap-4 sm:grid-cols-2"><ProgramSelect programs={programs} /><Field label="调整积分（增加填正数，减少加负号）"><input name="points" required inputMode="text" pattern="-?[0-9]+" className={inputClass} placeholder="如 100 或 -100" /></Field><Field label="调整原因（会保留流水）"><textarea name="note" required maxLength={2000} className={inputClass} /></Field><SubmitStatus busy={busy} message={message} label="保存账目调整" /></form>;
}

function ExpiryForm({ batches }: { batches: Batch[] }) {
  const { busy, message, run } = usePersonalRequest();
  const due = batches.filter((batch) => batch.expiryStatus === "known" && batch.expiresAt && new Date(batch.expiresAt) <= new Date() && BigInt(batch.remainingPoints) > 0n);
  return <form onSubmit={async (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); await run("/api/personal/points", { op: "expire", batchId: formString(data, "batchId") }, { keyField: "idempotencyKey" }); }} className="grid min-w-0 gap-4 border-t border-line pt-4 sm:grid-cols-2"><Field label="确认已到期批次"><select name="batchId" required className={inputClass} disabled={!due.length}><option value="">{due.length ? "选择要记入到期流水的批次" : "没有待确认的已到期批次"}</option>{due.map((batch) => <option key={batch.id} value={batch.id}>{batch.source} · {batch.remainingPoints} 分</option>)}</select></Field><p className="self-end text-xs leading-5 text-muted">已知到期的积分会立即排除在可用余额之外；此操作补记到期流水。未知到期日不会自动过期。</p>{due.length > 0 && <SubmitStatus busy={busy} message={message} label="确认积分到期" />}</form>;
}

function TaskForm({ actions, batches }: { actions: LinkedAction[]; batches: Batch[] }) {
  const { busy, message, setMessage, run } = usePersonalRequest();
  const [source, setSource] = useState("unconfirmed");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); try { const association = formString(data, "association"); await run("/api/personal/tasks", { title: formString(data, "title"), actionId: association.startsWith("action:") ? association.slice(7) : null, pointBatchId: association.startsWith("batch:") ? association.slice(6) : null, deadlineAt: source === "unconfirmed" ? null : hongKongInstant(formString(data, "deadlineAt")), deadlineSource: source, priority: Number(formString(data, "priority")), notes: formString(data, "notes") || null }, { keyField: "draftKey", reset: form }); } catch (error) { setMessage(error instanceof Error ? error.message : "请检查输入"); } }
  return <form onSubmit={submit} className="grid min-w-0 gap-4 sm:grid-cols-2"><Field label="待办标题"><input name="title" required maxLength={240} className={inputClass} placeholder="报名 / 预订 / 完成住宿 / 核实达标 / 领奖 / 检查到账" /></Field><Field label="关联记录"><select name="association" className={inputClass}><option value="">无</option>{actions.map((action) => <option key={action.id} value={`action:${action.id}`}>活动：{action.title}</option>)}{batches.map((batch) => <option key={batch.id} value={`batch:${batch.id}`}>积分：{batch.source}</option>)}</select></Field><Field label="截止时间来源"><select name="deadlineSource" value={source} onChange={(event) => setSource(event.target.value)} className={inputClass}><option value="unconfirmed">尚未确认</option><option value="official">官方确认</option><option value="rule-derived">根据规则推算（仍需核实顺延）</option><option value="manual">人工设定</option></select></Field>{source !== "unconfirmed" && <Field label="具体截止时间（香港时间）"><input name="deadlineAt" type="datetime-local" required className={inputClass} /></Field>}<Field label="优先级"><select name="priority" defaultValue="2" className={inputClass}><option value="1">高</option><option value="2">中</option><option value="3">低</option></select></Field><Field label="时间依据与备注"><textarea name="notes" maxLength={2000} className={inputClass} /></Field><p className="col-span-full text-xs leading-5 text-muted">仅在打开网站时显示待办和到期提示。节假日顺延未核实时，请保留“根据规则推算”或“尚未确认”。</p><SubmitStatus busy={busy} message={message} label="确认创建待办" /></form>;
}
