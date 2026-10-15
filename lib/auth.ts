import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { redis } from "./redis";

const allowed = () => (process.env.ALLOWED_EMAIL || "").trim().toLowerCase();

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/gmail.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ account, profile }) {
      const email = (profile?.email || "").toLowerCase();
      if (!allowed() || email !== allowed()) return false;
      if (account?.refresh_token) {
        await redis().set("auth:refresh", account.refresh_token);
      }
      return true;
    },
  },
};

/** Returns the session if (and only if) it belongs to ALLOWED_EMAIL. */
export async function requireUser() {
  const s = await getServerSession(authOptions);
  const email = (s?.user?.email || "").toLowerCase();
  if (!email || email !== allowed()) return null;
  return s;
}
