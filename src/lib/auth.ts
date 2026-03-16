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
        session.user.id = token.sub!;
        
        // Allow client to update the session with the new username
        if (trigger === 'update' && newSession?.username) {
          token.username = newSession.username;
        }
        if (trigger === 'update' && newSession?.image !== undefined) {
          token.image = newSession.image;
        }

        // Only fetch if token is missing username (initial login) or to sync currency
        if (!token.username || token.hasSetupProfile === undefined) {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.sub! },
            select: { username: true, currency: true, hasSetupProfile: true, image: true }
          });
          
          if (dbUser) {
            token.username = dbUser.username;
            token.hasSetupProfile = dbUser.hasSetupProfile;
            token.image = dbUser.image;
          }
          session.user.currency = dbUser?.currency || 0;
        }

        session.user.username = token.username as string | undefined;
        session.user.hasSetupProfile = token.hasSetupProfile as boolean | undefined;
        session.user.image = token.image as string | undefined;
      }
      return session;
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.sub = user.id;
        token.username = (user as any).username;
        token.hasSetupProfile = (user as any).hasSetupProfile;
        token.image = (user as any).image;
      }
      if (trigger === 'update') {
        if (session?.username) {
          token.username = session.username;
        }
        if (session?.hasSetupProfile !== undefined) {
          token.hasSetupProfile = session.hasSetupProfile;
        }
        if (session?.image !== undefined) {
          if (session.image === 'refresh') {
             const dbUser = await prisma.user.findUnique({
               where: { id: token.sub! },
               select: { image: true }
             });
             token.image = dbUser?.image || null;
          } else {
             token.image = session.image;
          }
        }
      }
      return token;
    }
  },
  pages: {
    signIn: '/login', // Custom login page we will build
  }
};
