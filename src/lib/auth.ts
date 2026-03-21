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
    async session({ session, token, trigger, newSession }) {
      if (token && session.user) {
        // Core fields requested (id, name, email)
        session.user.id = token.sub!;
        session.user.name = token.name as string | undefined;
        session.user.email = token.email as string | undefined;
        
        // Remove image to save cookie space
        if ('image' in session.user) {
          delete session.user.image;
        }

        // Allow client to update the session with the new username
        if (trigger === 'update' && newSession?.username) {
          token.username = newSession.username;
        }

        // Only fetch if token is missing username (initial login) or to sync currency
        if (!token.username || token.hasSetupProfile === undefined) {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.sub! },
            select: { username: true, currency: true, hasSetupProfile: true }
          });
          
          if (dbUser) {
            token.username = dbUser.username;
            token.hasSetupProfile = dbUser.hasSetupProfile;
            token.currency = dbUser.currency;
          }
        }

        // Keep necessary app custom fields, but no large provider data
        session.user.username = token.username as string | undefined;
        session.user.hasSetupProfile = token.hasSetupProfile as boolean | undefined;
        session.user.currency = (token.currency as number) || 0;
      }
      return session;
    },
    async jwt({ token, user, account, trigger, session }) {
      // Remove unnecessary large fields to fix Vercel 494 Request Header Too Large
      if (account) {
        delete token.accessToken;
        delete token.refreshToken;
        delete token.access_token;
        delete token.refresh_token;
      }
      if (token.picture) delete token.picture;
      if (token.image) delete token.image;

      if (user) {
        token.sub = user.id;
        token.username = (user as any).username;
        token.hasSetupProfile = (user as any).hasSetupProfile;
      }

      if (trigger === 'update') {
        if (session?.username) {
          token.username = session.username;
        }
        if (session?.hasSetupProfile !== undefined) {
          token.hasSetupProfile = session.hasSetupProfile;
        }
      }

      // Explicitly return only what's needed to keep JWT cookie minimal
      return {
        sub: token.sub,
        name: token.name,
        email: token.email,
        username: token.username,
        hasSetupProfile: token.hasSetupProfile,
        currency: token.currency,
      };
    }
  },
  pages: {
    signIn: '/login', // Custom login page we will build
  }
};
