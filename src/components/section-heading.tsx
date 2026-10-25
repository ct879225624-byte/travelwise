import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function SectionHeading({ eyebrow, title, description, href, linkLabel }: Readonly<{ eyebrow: string; title: string; description?: string; href?: string; linkLabel?: string }>) {
  return <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="eyebrow">{eyebrow}</p><h2 className="mt-2 text-2xl font-extrabold tracking-[-.03em] text-brand-deep sm:text-3xl">{title}</h2>{description && <p className="mt-2 max-w-xl text-sm leading-6 text-muted">{description}</p>}</div>{href && linkLabel && <Link href={href} className="focus-ring inline-flex items-center gap-1 rounded-lg py-2 text-sm font-bold text-brand hover:text-brand-deep">{linkLabel}<ArrowRight size={16} /></Link>}</div>;
}
