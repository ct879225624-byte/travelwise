import { cn } from "@/shared/utils";

const lifecycle = {
  scheduled: ["未开始", "bg-sky-50 text-sky-800 border-sky-200"], active: ["进行中", "bg-emerald-50 text-emerald-800 border-emerald-200"],
  ended: ["已结束", "bg-slate-100 text-slate-700 border-slate-200"], archived: ["已归档", "bg-slate-100 text-slate-700 border-slate-200"], unknown: ["状态待确认", "bg-amber-50 text-amber-800 border-amber-200"],
} as const;
const verification = {
  official_verified: ["官方已核实", "bg-violet-50 text-violet-800 border-violet-200"], community: ["社区经验", "bg-cyan-50 text-cyan-800 border-cyan-200"],
  unverified: ["待核实", "bg-amber-50 text-amber-800 border-amber-200"], conflict: ["存在冲突", "bg-rose-50 text-rose-800 border-rose-200"], reverify: ["需重新核实", "bg-orange-50 text-orange-800 border-orange-200"],
} as const;

export function StatusBadge({ type, value }: Readonly<{ type: "lifecycle" | "verification"; value: string }>) {
  const item = type === "lifecycle" ? lifecycle[value as keyof typeof lifecycle] : verification[value as keyof typeof verification];
  const [label, color] = item ?? ["未知状态", "bg-slate-100 text-slate-700 border-slate-200"];
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold", color)}>{label}</span>;
}

export function statusLabel(type: "lifecycle" | "verification", value: string) {
  const item = type === "lifecycle" ? lifecycle[value as keyof typeof lifecycle] : verification[value as keyof typeof verification];
  return item?.[0] ?? "未知状态";
}
