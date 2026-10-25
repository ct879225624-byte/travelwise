"use client";

import { startTransition, useActionState, type ReactNode } from "react";

export function ActionForm({ action, children, className }: { action: (form: FormData) => Promise<{ error: string } | undefined>; children: ReactNode; className?: string }) {
  const [state, submit, pending] = useActionState(async (_: { error: string } | undefined, form: FormData) => action(form), undefined);
  return <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); startTransition(() => submit(form)); }} className={className}><fieldset disabled={pending} className="min-w-0 border-0 p-0 [display:contents]">{children}</fieldset>{pending && <p role="status" className="mt-3 text-sm text-muted">正在保存…</p>}{state?.error && <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{state.error}</p>}</form>;
}
