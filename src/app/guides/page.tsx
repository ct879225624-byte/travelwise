import Link from "next/link";
import { BookOpen, Search } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { StatusBadge } from "@/components/status-badge";
import { listGuideCategories, listPublishedGuides } from "@/modules/knowledge/service";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "锦江荟攻略", description: "阅读已发布的锦江荟规则与玩法攻略，查看关联活动和来源。" };

export default async function GuidesPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const params = await searchParams; const search = typeof params.q === "string" ? params.q.slice(0, 100) : ""; const category = typeof params.category === "string" ? params.category : "";
  const [guides, categories] = await Promise.all([listPublishedGuides(search, category), listGuideCategories()]);
  return <section className="mx-auto max-w-6xl px-5 py-10 sm:py-14 lg:px-8">
    <SectionHeading eyebrow="Knowledge / 攻略中心" title="锦江荟知识库" description="攻略正文保持可读，规则、活动和来源通过真实关系连接。未发布内容不会被搜索或索引。" />
    <div className="mt-8 flex gap-2 overflow-x-auto pb-1" aria-label="攻略分类">{categories.map((item) => <Link key={item.id} href={`/guides?category=${item.slug}${search ? `&q=${encodeURIComponent(search)}` : ""}`} className={`focus-ring shrink-0 rounded-full border px-3.5 py-2 text-xs font-bold ${category === item.slug ? "border-brand bg-brand text-white" : "border-line bg-surface text-brand hover:bg-surface-soft"}`}>{item.name}</Link>)}</div>
    <form method="get" className="mt-5 flex flex-col gap-3 sm:flex-row"><label className="relative flex-1"><span className="sr-only">搜索攻略</span><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input type="search" name="q" defaultValue={search} placeholder="搜索标题、摘要或正文" className="focus-ring h-11 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm outline-none" /></label>{category && <input type="hidden" name="category" value={category} />}<button className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-white hover:bg-brand-deep"><Search size={16} />搜索攻略</button></form>
    <div className="mt-7 flex items-center justify-between border-b border-line pb-4"><p className="text-sm font-bold text-brand-deep">{guides.length ? `找到 ${guides.length} 篇已发布攻略` : "暂无匹配攻略"}</p>{(search || category) && <Link className="focus-ring text-sm font-bold text-muted hover:text-brand" href="/guides">清除条件</Link>}</div>
    {guides.length ? <div className="mt-6 grid gap-5 md:grid-cols-2">{guides.map(({ guide, category: item, program }) => <article key={guide.id} className="flex h-full flex-col rounded-3xl border border-line bg-surface p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-brand/35"><div className="flex items-center justify-between gap-3"><span className="text-xs font-bold text-brand">{item.name}</span><StatusBadge type="verification" value={guide.verificationStatus} /></div><h2 className="mt-4 text-xl font-black leading-tight text-brand-deep"><Link href={`/guides/${guide.slug}`} className="hover:text-brand">{guide.title}</Link></h2><p className="mt-3 text-sm leading-7 text-muted">{guide.summary}</p><div className="mt-5 flex flex-wrap gap-2">{guide.tags.map((tag) => <span key={tag} className="rounded-full bg-surface-soft px-2.5 py-1 text-xs font-semibold text-brand">{tag}</span>)}</div><div className="mt-auto flex items-center justify-between gap-3 pt-6 text-xs text-muted"><span>{program.name} · 更新于 {guide.updatedAt.toLocaleDateString("zh-CN")}</span><Link href={`/guides/${guide.slug}`} className="focus-ring inline-flex items-center gap-1 rounded-lg py-2 font-bold text-brand">阅读 <BookOpen size={14} /></Link></div></article>)}</div> : <div className="mt-6 rounded-3xl border border-dashed border-line bg-surface p-9 text-center"><BookOpen className="mx-auto text-brand" size={28} /><h2 className="mt-4 text-lg font-extrabold text-brand-deep">没有可公开阅读的攻略</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted">换个关键词或清除分类。草稿、待审核、已撤回和 DEMO 内容不会出现在公开知识库。</p></div>}
  </section>;
}
