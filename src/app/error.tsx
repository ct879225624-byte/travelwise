"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="mx-auto max-w-xl px-5 py-24 text-center"><p className="eyebrow">TravelWise</p><h1 className="mt-3 text-3xl font-black text-brand-deep">内容暂时加载失败</h1><p className="mt-3 text-sm leading-6 text-muted">数据库或网络连接暂时不可用，请稍后重试。</p><button onClick={reset} className="focus-ring mt-7 rounded-xl bg-brand px-5 py-3 text-sm font-bold text-white hover:bg-brand-deep">重新加载</button></main>;
}
