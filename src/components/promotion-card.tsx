import Link from "next/link";
import { ArrowUpRight, CalendarDays, CircleAlert, Coins, ShieldCheck } from "lucide-react";
import type { PublicPromotion } from "@/modules/intelligence/model";
import { formatInstant } from "@/shared/time";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";

export function DemoMark() {
  return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-extrabold tracking-[.08em] text-amber-800"><CircleAlert size={12} />DEMO</span>;
}

export function PromotionCard({ promotion }: Readonly<{ promotion: PublicPromotion }>) {
  return (
    <Card role="article" className="group flex h-full flex-col rounded-3xl p-5 shadow-[0_10px_35px_rgba(23,72,61,.05)] transition hover:-translate-y-0.5 hover:border-brand/35 hover:shadow-[0_16px_40px_rgba(23,72,61,.11)] sm:p-6" data-testid="promotion-card">
      <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-surface-soft px-2.5 py-1 text-[11px] font-bold text-brand">{promotion.category}</span><span className="text-[11px] font-semibold text-muted">{promotion.platform}</span>{promotion.isDemo && <DemoMark />}</div><StatusBadge type="lifecycle" value={promotion.lifecycleStatus} /></div>
      <h3 className="mt-5 text-xl font-bold leading-tight tracking-[-.02em] text-brand-deep">{promotion.title}</h3>
      <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted">{promotion.summary}</p>
      <div className="mt-5 grid gap-3 border-t border-line pt-4 text-xs text-muted">
        <div className="flex items-start gap-2"><Coins size={15} className="mt-0.5 shrink-0 text-accent" /><span><strong className="text-brand-deep">奖励：</strong>{promotion.rewardAmount ? `${promotion.rewardAmount} ${promotion.rewardUnit ?? promotion.pointsName}` : "暂无明确奖励信息"}</span></div>
        <div className="flex items-start gap-2"><CalendarDays size={15} className="mt-0.5 shrink-0 text-brand" /><span><strong className="text-brand-deep">活动期：</strong>{promotion.startsAt ? formatInstant(promotion.startsAt, promotion.timeZone) : "未知"} — {promotion.endsAt ? formatInstant(promotion.endsAt, promotion.timeZone) : "未知"}</span></div>
        <div className="flex items-center gap-2"><ShieldCheck size={15} className="text-violet-700" /><StatusBadge type="verification" value={promotion.verificationStatus} /></div>
      </div>
      <p className="mt-4 text-[11px] text-muted">更新于 {formatInstant(promotion.updatedAt, promotion.timeZone)}</p>
      <Link href={`/discover/${promotion.slug}`} className="focus-ring mt-6 inline-flex items-center justify-between rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-deep">查看规则与证据<ArrowUpRight size={17} /></Link>
    </Card>
  );
}
