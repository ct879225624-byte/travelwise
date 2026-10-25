import Link from "next/link";

export default function NotFound() { return <div className="mx-auto max-w-xl px-5 py-24 text-center"><p className="eyebrow">404</p><h1 className="mt-3 text-3xl font-black text-brand-deep">这条情报不存在</h1><p className="mt-3 text-sm text-muted">它可能已经归档，或还没有公开发布。</p><Link href="/discover" className="focus-ring mt-7 inline-flex rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white">返回发现</Link></div>; }
