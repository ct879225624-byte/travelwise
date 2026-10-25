import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";
import { createLoginAttemptLimiter } from "@/shared/login-attempts";

const inputSchema = z.object({ email: z.email(), password: z.string().min(1).max(200) });
const dummyHash = "$2b$12$R9gY0aqP2KE3e9juYnTAPuZZktolpUFnOq6Y6FKx1XQ9VFbB3Y9ou";
const loginAttempts = createLoginAttemptLimiter();

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/admin/login" },
  providers: [Credentials({
    credentials: {
      email: { label: "管理员邮箱", type: "email" },
      password: { label: "密码", type: "password" },
    },
    authorize: async (raw) => {
      if (!loginAttempts.consume()) return null;
      const input = inputSchema.safeParse(raw);
      const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
      const passwordHash = process.env.ADMIN_PASSWORD_HASH ?? dummyHash;
      const passwordMatches = input.success && await compare(input.data.password, passwordHash);
      if (!input.success || !email || !process.env.ADMIN_PASSWORD_HASH || input.data.email.toLowerCase() !== email || !passwordMatches) return null;
      loginAttempts.success();
      return { id: "travelwise-admin", email, name: "TravelWise 管理员" };
    },
  })],
});
