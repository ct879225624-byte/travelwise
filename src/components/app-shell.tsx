import Link from "next/link";
import { BookOpen, Calculator, Compass, Heart, PlaneTakeoff, Search, Shield } from "lucide-react";
import { cn } from "@/shared/utils";

const navItems = [
  { href: "/discover", label: "发现", icon: Compass },
  { href: "/guides", label: "攻略", icon: BookOpen },
  { href: "/calculate", label: "计算", icon: Calculator },
  { href: "/me", label: "我的", icon: Heart },
];

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-line/80 bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center gap-3 px-5 py-3 lg:px-8">
          <Link href="/" className="focus-ring flex items-center gap-2 rounded-xl" aria-label="TravelWise 首页">
            <span className="grid size-9 place-items-center rounded-xl bg-brand text-white shadow-sm"><PlaneTakeoff size={19} strokeWidth={2.4} /></span>
            <span className="text-[17px] font-extrabold tracking-[-.02em] text-brand-deep">TravelWise</span>
          </Link>
          <form action="/discover" className="order-3 flex basis-full md:order-none md:ml-5 md:flex-1 md:basis-auto md:max-w-sm" role="search">
            <label className="sr-only" htmlFor="global-search">搜索活动和攻略</label>
            <div className="relative w-full"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input type="search" id="global-search" name="q" placeholder="搜索活动或摘要" className="focus-ring h-10 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm outline-none placeholder:text-muted/70" /></div>
          </form>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="主导航">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className="focus-ring flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-muted transition hover:bg-surface-soft hover:text-brand">
                <Icon size={16} />{label}
              </Link>
            ))}
          </nav>
          <Link href="/admin" className="focus-ring hidden items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-bold text-muted hover:bg-surface-soft hover:text-brand sm:inline-flex"><Shield size={15} />管理入口</Link>
        </div>
      </header>
      <a href="#main-content" className="focus-ring sr-only z-30 rounded-lg bg-surface px-4 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">跳到正文</a>
      <main id="main-content" className="pb-24 lg:pb-0">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md lg:hidden" aria-label="移动端主导航">
        <div className="mx-auto grid max-w-md grid-cols-4">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={cn("focus-ring flex flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-semibold text-muted", "hover:text-brand")}>
              <Icon size={18} />{label}
            </Link>
          ))}
        </div>
      </nav>
      <footer className="mx-auto hidden max-w-6xl px-5 pb-10 pt-16 text-xs text-muted lg:block lg:px-8">
        <div className="flex items-center justify-between border-t border-line pt-5"><span>TravelWise · 让每个优惠都能被核对</span><span>TravelWise V1 · 基础预览</span></div>
      </footer>
    </div>
  );
}
