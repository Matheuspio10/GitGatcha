import { NextAuthOptions } from 'next-auth';
import GithubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  session: {
    strategy: 'jwt',
  },
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: "Email", type: "email", placeholder: "dev@example.com" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email }
        });

        if (!user || !user.password) return null;

        const passwordsMatch = await bcrypt.compare(credentials.password, user.password);
        if (!passwordsMatch) return null;

        return user;
      }
    })
  ],
  callbacks: {
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.sub!;
        
        // Let's pass username to the session
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub! },
          select: { username: true, currency: true, name: true }
        });

        // Auto-populate username in DB if it's null (OAuth users)
        if (dbUser && !dbUser.username) {
          const fallbackUsername = dbUser.name || session.user.name || session.user.email?.split('@')[0] || 'user';
          try {
            await prisma.user.update({
              where: { id: token.sub! },
              data: { username: fallbackUsername }
            });
            dbUser.username = fallbackUsername;
          } catch {
            // Username might conflict (unique constraint), skip
          }
        }
        
        session.user.username = dbUser?.username || session.user.name || session.user.email?.split('@')[0];
        session.user.currency = dbUser?.currency || 0;
      }
      return session;
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    }
  },
  pages: {
    signIn: '/login', // Custom login page we will build
  }
};
