import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, CalendarClock, Coins, ListChecks, Sparkles, WalletCards } from "lucide-react";
import { getOwner } from "@/modules/personal/auth";
import { dashboard } from "@/modules/personal/service";
import { personalOpportunityEngine } from "@/modules/personal/opportunity-service";
import { formatMinor } from "@/modules/decision/math";
import { Opportunities, ReminderCenter } from "./opportunity-controls";
import { ScenarioControls, TaskCompleteButton } from "./personal-record-controls";

export const dynamic = "force-dynamic";
export const metadata = { title: "今日决策 · 我的 TravelWise", robots: { index: false, follow: false } };
const date = (d: Date) => d.toLocaleDateString("zh-CN", { timeZone: "Asia/Hong_Kong" });
export default async function MePage() {
  if (!await getOwner()) redirect("/admin/login?callbackUrl=/me");
  const [data, engine] = await Promise.all([dashboard(), personalOpportunityEngine()]);
  const pending = engine.reminders.filter((r) => r.active && ["pending", "read"].includes(r.status));
  const tasks = data.tasks.filter((t) => t.status === "todo" && !engine.reminders.some((r) => r.active && r.sourceKey.startsWith(`task:${t.id}:`)));
  const attention = engine.opportunities.filter((o) => o.eligibility.status !== "fails-known-conditions");
  const incomplete = engine.opportunities.filter((o) => ["information-insufficient", "rule-pending-verification"].includes(o.eligibility.status)).length;
  return <div className="mx-auto max-w-6xl px-5 py-8 sm:py-12 lg:px-8">
    <header className="rounded-[2rem] border border-brand/15 bg-surface-soft p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="eyebrow">我的 TravelWise · 私人决策首页</p><span className="text-xs font-bold text-muted">{date(new Date())} · 香港时间</span></div>
      <h1 className="mt-4 text-3xl font-black tracking-tight text-brand-deep sm:text-4xl">今天有什么值得我做？</h1>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">从你保存的会员、活动和积分出发，先看值得关注的机会，再决定下一步。</p>
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric href="#opportunities" icon={<Sparkles size={17} />} label="值得关注的机会" value={`${attention.length} 项`} />
        <Metric href="#next" icon={<CalendarClock size={17} />} label="7 天内截止的提醒" value={`${pending.filter((r) => r.deadlineAt && r.deadlineAt.getTime() > Date.parse(engine.evaluatedAt) && r.deadlineAt.getTime() <= Date.parse(engine.evaluatedAt) + 7 * 86400000).length} 项`} />
        <Metric href="#overview" icon={<Coins size={17} />} label="30 天内到期积分" value={`${data.summary.expiringPoints.toLocaleString("zh-CN")} 分`} />
        <Metric href="#opportunities" icon={<ListChecks size={17} />} label="需要补充或核对" value={`${incomplete + (data.wallets.length ? data.wallets.filter(({ wallet }) => !wallet.membershipTier || wallet.membershipTier === "未知" || wallet.cardHeld === null).length : 1) + data.batches.filter((b) => b.remainingPoints > 0n && b.expiryStatus === "unknown").length} 项`} />
      </div>
      <nav className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs font-bold text-brand" aria-label="个人决策导航"><Link className="focus-ring rounded-lg py-2" href="/me/records">管理会员、积分与记录 →</Link><Link className="focus-ring rounded-lg py-2" href="/discover">公共发现</Link><Link className="focus-ring rounded-lg py-2" href="/calculate">计算中心</Link><Link className="focus-ring rounded-lg py-2" href="/">公共首页</Link></nav>
    </header>
    <Section id="opportunities" icon={<Sparkles size={20} />} title="我的优惠机会" description="仅匹配已审核发布、当前有效且有官方核实来源的正式活动。资格仍以官方最终核验为准。">
      <Opportunities evaluatedAt={engine.evaluatedAt} items={engine.opportunities.map((o) => ({ ...o, deadline: o.deadline.toISOString(), value: o.value ? { ...o.value, valueMicros: o.value.valueMicros.toString(), quotedAt: o.value.quotedAt.toISOString() } : null }))} profiles={engine.profiles} />
    </Section>
    <Section id="next" icon={<Bell size={20} />} title="接下来要做的事" description="站内提醒与个人待办。日期未知时保留待确认，已读、已完成和忽略状态会被保存。">
      <ReminderCenter items={engine.reminders.map((r) => ({ ...r, deadlineAt: r.deadlineAt?.toISOString() ?? null, snoozedUntil: r.snoozedUntil?.toISOString() ?? null }))} />
      {tasks.length > 0 && <div className="mt-5 space-y-3"><h3 className="text-sm font-bold text-brand-deep">其他个人待办</h3>{tasks.map((t) => <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line p-4"><div className="min-w-0"><p className="break-words text-sm font-bold text-brand-deep">{t.title}</p><p className="mt-1 text-xs text-muted">{t.deadlineAt && t.deadlineSource !== "unconfirmed" ? `截止 ${date(t.deadlineAt)} · 香港时间` : "截止时间尚未确认"}</p></div><TaskCompleteButton task={{ id: t.id, status: t.status }} /></div>)}</div>}
    </Section>
    <Section id="overview" icon={<WalletCards size={20} />} title="我的权益概览" description="可用积分、预计返还与已实现收益分别记账。">
      <div className="grid gap-3 sm:grid-cols-3"><Metric href="/me/records#points" icon={<Coins size={17} />} label="可用积分" value={`${data.summary.availablePoints.toLocaleString("zh-CN")} 分`} /><Metric href="/me/records#activities" icon={<CalendarClock size={17} />} label="预计积分（未到账）" value={`${data.summary.expectedPoints.toLocaleString("zh-CN")} 分`} /><Metric href="/me/records#earnings" icon={<WalletCards size={17} />} label="已实现 · 有依据的现金节省" value={`¥${formatMinor(data.summary.realizedCashMinor)}`} /></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{data.wallets.length ? data.wallets.map(({ wallet: w, program: p }) => <div key={w.id} className="rounded-2xl border border-line p-4"><p className="text-sm font-bold text-brand-deep">{p.name} · {w.membershipTier ?? "等级待补充"}</p><p className="mt-2 text-xs leading-6 text-muted">可用余额：{data.batches.filter((b) => b.walletId === w.id && (!b.expiresAt || b.expiresAt.getTime() > Date.parse(engine.evaluatedAt))).reduce((sum, b) => sum + b.remainingPoints, 0n).toLocaleString("zh-CN")} {p.pointsName}<br />等级有效期：{w.tierExpiresAt ? date(w.tierExpiresAt) : "尚未确认"}<br />已登记权益 {w.benefits.length} 项 · 信用卡：{w.cardHeld === null ? "待确认" : w.cardHeld ? w.cardType ?? "已持有，卡种待补充" : "未持有"}</p></div>) : <Link href="/me/records" className="focus-ring rounded-2xl bg-surface-soft p-5 text-sm font-bold text-brand">还没有会员权益，先完善个人资料 →</Link>}</div>
      {data.batches.length === 0 ? <Link href="/me/records" className="focus-ring mt-4 block rounded-2xl bg-surface-soft p-4 text-sm font-bold text-brand">还没有积分记录，添加会员积分 →</Link> : <p className="mt-4 text-xs leading-6 text-muted">{data.batches.filter((b) => b.expiryStatus === "unknown" && b.remainingPoints > 0n).length} 个批次的到期日尚未确认；{data.batches.filter((b) => b.expiresAt && b.expiresAt <= new Date() && b.remainingPoints > 0n).length} 个批次已过期，已排除可用余额。</p>}
      <h3 className="mt-7 text-sm font-bold text-brand-deep">最近保存的计算方案</h3><div className="mt-3 space-y-4">{data.scenarios.length ? data.scenarios.slice(0, 3).map((s) => <ScenarioControls key={s.id} scenario={s} />) : <Link href="/calculate" className="focus-ring block rounded-2xl bg-surface-soft p-4 text-sm text-brand">暂无保存方案，前往计算中心核对价值 →</Link>}</div>
    </Section>
  </div>;
}
function Metric({ href, icon, label, value }: { href: string; icon: React.ReactNode; label: string; value: string }) { return <Link href={href} className="focus-ring min-w-0 rounded-2xl border border-line bg-surface p-4"><div className="flex items-start gap-2 text-brand">{icon}<span className="text-xs font-bold leading-5 text-muted">{label}</span></div><p className="mt-3 break-words text-xl font-black text-brand-deep sm:text-2xl">{value}</p></Link>; }
function Section({ id, icon, title, description, children }: { id: string; icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) { return <section id={id} className="mt-8 scroll-mt-28 rounded-[2rem] border border-line bg-surface p-5 sm:p-7"><div className="mb-5"><div className="flex items-center gap-2 text-brand">{icon}<h2 className="text-xl font-extrabold text-brand-deep">{title}</h2></div><p className="mt-2 text-xs leading-6 text-muted">{description}</p></div>{children}</section>; }
