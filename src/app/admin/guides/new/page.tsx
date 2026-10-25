import { requireAdmin } from "@/modules/admin/auth";
import { listGuideCategories } from "@/modules/admin/service";
import { GuideForm } from "@/app/admin/guide-form";
export default async function NewGuidePage() { await requireAdmin(); const categories = await listGuideCategories(); return <section className="mx-auto max-w-5xl px-5 py-10 lg:px-8"><h1 className="text-3xl font-black text-brand-deep">新建攻略草稿</h1><div className="mt-8 rounded-3xl border border-line bg-surface p-6 sm:p-8"><GuideForm categories={categories} /></div></section>; }
