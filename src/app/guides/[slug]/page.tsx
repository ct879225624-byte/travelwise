import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, ExternalLink, FileCheck2, Link2, ShieldCheck } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { getPublishedGuide } from "@/modules/knowledge/service";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const result = await getPublishedGuide((await params).slug);
  return result ? { title: result.guide.title, description: result.guide.summary } : { title: "攻略不存在" };
}

export default async function GuideDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const result = await getPublishedGuide(slug); if (!result) notFound();
  const { guide, category, program, linkedRules, linkedPromotions, linkedEvidence, history } = result;
  return <article className="mx-auto max-w-5xl px-5 py-10 sm:py-14 lg:px-8"><Link href="/guides" className="focus-ring inline-flex items-center gap-2 rounded-lg text-sm font-bold text-brand"><ArrowLeft size={16} />返回攻略中心</Link>
    <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]"><main className="rounded-[2rem] border border-line bg-surface p-6 shadow-sm sm:p-10"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-surface-soft px-3 py-1.5 text-xs font-bold text-brand">{category.name}</span><span className="text-xs font-semibold text-muted">{program.name}</span><StatusBadge type="verification" value={guide.verificationStatus} /></div><h1 className="mt-6 text-3xl font-black leading-tight tracking-[-.04em] text-brand-deep sm:text-5xl">{guide.title}</h1><p className="mt-5 text-base leading-8 text-muted">{guide.summary}</p><div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-y border-line py-4 text-xs text-muted"><span>发布于 {guide.publishedAt?.toLocaleDateString("zh-CN") ?? "未记录"}</span><span>更新于 {guide.updatedAt.toLocaleDateString("zh-CN")}</span><span>{history.length ? `已记录 ${history.length} 个版本` : "暂无修订记录"}</span></div><div className="mt-8 space-y-5 text-[15px] leading-8 text-brand-deep">{guide.body.split(/\n\s*\n/).map((paragraph, index) => <p key={`${guide.id}-${index}`}>{paragraph}</p>)}</div><div className="mt-8 flex flex-wrap gap-2 border-t border-line pt-6">{guide.tags.map((tag) => <span key={tag} className="rounded-full bg-surface-soft px-3 py-1 text-xs font-bold text-brand">#{tag}</span>)}</div></main>
      <aside className="space-y-4"><div className="rounded-3xl border border-line bg-surface p-5"><div className="flex items-center gap-2 text-sm font-extrabold text-brand-deep"><Link2 size={16} />关联内容</div>{linkedRules.length ? <div className="mt-4 space-y-3"><p className="text-xs font-bold text-muted">规则</p>{linkedRules.map(({ rule, version }) => <div key={version.id} className="rounded-xl bg-surface-soft p-3 text-sm text-brand-deep"><span className="font-bold">{rule.name}</span><span className="mt-1 block text-xs text-muted">规则版本 V{version.version}</span></div>)}</div> : <p className="mt-4 text-sm text-muted">暂无已发布规则关联。</p>}{linkedPromotions.length ? <div className="mt-5 space-y-3"><p className="text-xs font-bold text-muted">活动</p>{linkedPromotions.map(({ promotion }) => <Link key={promotion.id} href={`/discover/${promotion.slug}`} className="focus-ring block rounded-xl bg-surface-soft p-3 text-sm font-bold text-brand hover:bg-brand/10">{promotion.title}<ArrowUpRight size={14} className="ml-1 inline" /></Link>)}</div> : null}</div>
      <div className="rounded-3xl border border-line bg-surface p-5"><div className="flex items-center gap-2 text-sm font-extrabold text-brand-deep"><FileCheck2 size={16} />来源引用</div><p className="mt-2 text-xs text-muted">{linkedEvidence.length} 条公开证据</p>{linkedEvidence.map(({ evidence: item }) => <div key={item.id} className="mt-4 border-t border-line pt-3"><p className="text-sm font-bold text-brand-deep">{item.sourceLabel}</p><p className="mt-1 text-xs leading-5 text-muted">{item.excerpt}</p>{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="focus-ring mt-2 inline-flex items-center gap-1 text-xs font-bold text-brand">打开来源<ExternalLink size={12} /></a>}</div>)}</div>
      <div className="rounded-3xl border border-brand/15 bg-surface-soft p-5"><div className="flex items-center gap-2 text-sm font-extrabold text-brand-deep"><ShieldCheck size={16} />阅读边界</div><p className="mt-2 text-xs leading-5 text-muted">攻略是解释层；具体活动资格和时间以关联活动页面及来源证据为准。</p></div></aside></div>
  </article>;
}
