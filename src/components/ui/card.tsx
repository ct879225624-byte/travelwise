import type { ComponentProps } from "react";
import { cn } from "@/shared/utils";

// shadcn/ui Card primitive, adapted to the TravelWise palette and React 19 refs.
// Source: https://ui.shadcn.com/r/styles/new-york/card.json
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card" className={cn("rounded-xl border border-line bg-surface text-foreground shadow-sm", className)} {...props} />;
}
