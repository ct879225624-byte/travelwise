import { requireAdmin } from "@/modules/admin/auth";
import { PromotionForm } from "@/app/admin/promotion-form";
import { listRules } from "@/modules/admin/service";
export default async function NewPromotionPage() { await requireAdmin(); const rows = await listRules(); const rules = rows.flatMap(({ rule, version }) => version ? [{ id: version.id, label: `${rule.name} · V${version.version} · ${version.publicationStatus}` }] : []); return <section className="mx-auto max-w-5xl px-5 py-10 lg:px-8"><h1 className="text-3xl font-black text-brand-deep">新建活动草稿</h1><p className="mt-2 text-sm text-muted">保存后只进入后台，发布前不会出现在公开页面。</p><div className="mt-8 rounded-3xl border border-line bg-surface p-6 sm:p-8"><PromotionForm rules={rules} /></div></section>; }
