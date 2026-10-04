import NextAuth from "next-auth";
import { buildAuthConfig } from "@/lib/server/auth-config";

export const { handlers, auth, signIn, signOut } = NextAuth(() => buildAuthConfig());
