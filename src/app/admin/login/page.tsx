import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { auth } from "@/auth";

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await auth();
  if (session?.user?.email && session.user.email.toLowerCase() === process.env.ADMIN_EMAIL?.trim().toLowerCase()) redirect("/admin");
  const { error } = await searchParams;
  async function login(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"), password: formData.get("password"), redirectTo: "/admin",
      });
    } catch (cause) {
      if (cause instanceof AuthError) redirect("/admin/login?error=invalid");
      throw cause;
    }
  }
  return <section className="mx-auto max-w-md px-5 py-16"><div className="rounded-3xl border border-line bg-surface p-7"><h1 className="text-2xl font-black text-brand-deep">管理后台登录</h1><p className="mt-2 text-sm text-muted">仅限已配置的单一管理员账户。</p>{error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">邮箱或密码不正确。</p>}<form action={login} className="mt-6 space-y-4"><label className="block text-sm font-bold text-brand-deep">邮箱<input name="email" type="email" autoComplete="username" required className="mt-2 w-full rounded-xl border border-line px-3 py-2" /></label><label className="block text-sm font-bold text-brand-deep">密码<input name="password" type="password" autoComplete="current-password" required className="mt-2 w-full rounded-xl border border-line px-3 py-2" /></label><button className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white">登录</button></form></div></section>;
}
