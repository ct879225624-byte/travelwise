import Link from "next/link";
import { Filter, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { PromotionCard } from "@/components/promotion-card";
import { SectionHeading } from "@/components/section-heading";
import { StatusBadge } from "@/components/status-badge";
import { browseHref, browseSchema, type SearchParams } from "@/shared/browse";
import { browsePromotions } from "@/modules/intelligence/service";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "发现公开活动", description: "按类别、生命周期和信息可信度筛选已发布的锦江荟活动。" };

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = await searchParams; const filters = browseSchema.parse(raw);
  const result = await browsePromotions(filters);
  const totalPages = Math.max(1, Math.ceil(result.total / 12));
  return <section className="mx-auto max-w-6xl px-5 py-10 sm:py-14 lg:px-8">
    <SectionHeading eyebrow="Discover / 发现" title="发现值得核对的优惠" description="把公开活动筛成可判断的清单。活动生命周期、信息可信度和资格条件分别标记，官方已核实不等于当前仍可参与。" />
    <form method="get" className="mt-8 rounded-3xl border border-line bg-surface p-4 shadow-sm sm:p-5" aria-label="优惠筛选">
      <div className="flex items-center gap-2 text-sm font-extrabold text-brand-deep"><SlidersHorizontal size={17} />筛选公开活动</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="sm:col-span-2 lg:col-span-2"><span className="sr-only">关键词</span><div className="relative"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input type="search" name="q" defaultValue={filters.q} placeholder="搜索标题或摘要" className="focus-ring h-11 w-full rounded-xl border border-line bg-background pl-9 pr-3 text-sm outline-none" /></div></label>
        <label><span className="sr-only">类别</span><select name="category" defaultValue={filters.category} className="focus-ring h-11 w-full rounded-xl border border-line bg-background px-3 text-sm outline-none"><option value="">全部类别</option>{result.categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label><span className="sr-only">平台</span><select name="platform" defaultValue={filters.platform} className="focus-ring h-11 w-full rounded-xl border border-line bg-background px-3 text-sm outline-none"><option value="">全部平台</option>{result.platforms.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label><span className="sr-only">活动生命周期</span><select name="lifecycle" defaultValue={filters.lifecycle} className="focus-ring h-11 w-full rounded-xl border border-line bg-background px-3 text-sm outline-none"><option value="">全部生命周期</option><option value="scheduled">未开始</option><option value="active">进行中</option><option value="ended">已结束</option><option value="archived">已归档</option><option value="unknown">状态待确认</option></select></label>
        <label><span className="sr-only">核实状态</span><select name="verification" defaultValue={filters.verification} className="focus-ring h-11 w-full rounded-xl border border-line bg-background px-3 text-sm outline-none"><option value="">全部可信度</option><option value="official_verified">官方已核实</option><option value="community">社区经验</option><option value="unverified">待核实</option><option value="conflict">存在冲突</option><option value="reverify">需重新核实</option></select></label>
        <label><span className="sr-only">排序</span><select name="sort" defaultValue={filters.sort} className="focus-ring h-11 w-full rounded-xl border border-line bg-background px-3 text-sm outline-none"><option value="newest">最新发布</option><option value="updated">最近更新</option><option value="ending">即将截止</option></select></label>
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><button className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-white hover:bg-brand-deep" type="submit"><Filter size={16} />应用筛选</button><Link href="/discover" className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold text-muted hover:bg-surface-soft hover:text-brand"><RotateCcw size={15} />清除条件</Link></div>
    </form>
    <div className="mt-7 flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm font-bold text-brand-deep">共 {result.total} 条公开活动<span className="ml-2 text-xs font-normal text-muted">最多每页 12 条</span></p><div className="flex flex-wrap gap-2">{filters.lifecycle && <StatusBadge type="lifecycle" value={filters.lifecycle} />}{filters.verification && <StatusBadge type="verification" value={filters.verification} />}</div></div>
    {result.items.length ? <div className="mt-6 grid gap-5 md:grid-cols-2">{result.items.map((promotion) => <PromotionCard key={promotion.id} promotion={promotion} />)}</div> : <div className="mt-6 rounded-3xl border border-dashed border-line bg-surface p-8 text-center"><p className="text-lg font-extrabold text-brand-deep">没有匹配的公开活动</p><p className="mt-2 text-sm leading-6 text-muted">换一个关键词或清除筛选。未发布、已撤回和管理员私有内容不会出现在这里。</p><Link href="/discover" className="focus-ring mt-5 inline-flex rounded-xl border border-line px-4 py-3 text-sm font-bold text-brand hover:bg-surface-soft">查看全部公开内容</Link></div>}
    {result.items.length > 0 && totalPages > 1 && <nav className="mt-8 flex items-center justify-between" aria-label="活动分页"><span className="text-xs text-muted">第 {filters.page} / {totalPages} 页</span><div className="flex gap-2">{filters.page > 1 && <Link className="focus-ring rounded-xl border border-line bg-surface px-4 py-2 text-sm font-bold text-brand" href={browseHref("/discover", { ...filters, page: filters.page - 1 })}>上一页</Link>}{filters.page < totalPages && <Link className="focus-ring rounded-xl border border-line bg-surface px-4 py-2 text-sm font-bold text-brand" href={browseHref("/discover", { ...filters, page: filters.page + 1 })}>下一页</Link>}</div></nav>}
  </section>;
}
