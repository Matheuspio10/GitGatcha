import { NextAuthOptions } from 'next-auth';
import { STARTING_BITS } from '@/lib/onboarding';
import GithubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { grantGithubLinkRewards } from '@/lib/githubLink';
import { payReferralSafe } from '@/lib/referralService';
import { getClientIp, rateLimit } from '@/lib/rateLimit';

export const authOptions: NextAuthOptions = {
  // The adapter is typed for a plain client; the global `omit: password` only drops a column it never reads
  adapter: PrismaAdapter(prisma as unknown as Parameters<typeof PrismaAdapter>[0]) as unknown as NextAuthOptions['adapter'],
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
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        // Slow down password guessing (15-minute windows). Keyed by e-mail + IP rather than
        // e-mail alone, so nobody can lock a player out just by knowing their address.
        const headers = new Headers(req?.headers as Record<string, string> | undefined);
        const ip = getClientIp(headers) ?? 'unknown';
        const [byEmailAndIp, byIp] = await Promise.all([
          rateLimit(`login:email-ip:${credentials.email.toLowerCase()}:${ip}`, 10, 900),
          rateLimit(`login:ip:${ip}`, 30, 900),
        ]);
        if (!byEmailAndIp.ok || !byIp.ok) throw new Error('TooManyAttempts');

        // The only query that loads the password hash (omitted everywhere else, see prisma.ts)
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          select: { id: true, email: true, name: true, username: true, image: true, password: true },
        });

        if (!user || !user.password) return null;

        const passwordsMatch = await bcrypt.compare(credentials.password, user.password);
        if (!passwordsMatch) return null;

        // Never hand the hash to NextAuth (it would travel into the JWT callback)
        const { password: _hash, ...safeUser } = user;
        void _hash;
        return safeUser;
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
        token.username = user.username;
        token.hasSetupProfile = user.hasSetupProfile;
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
  events: {
    // Google / GitHub sign-ups get STARTING_BITS from the schema default: record it in the history
    async createUser({ user }) {
      try {
        await prisma.bitsTransaction.create({ data: { userId: user.id, amount: STARTING_BITS, balanceAfter: STARTING_BITS, reason: 'starting_bits' } });
      } catch (err) {
        console.error('[Auth] Could not record the starting BITS:', (err as Error).message);
      }
    },
    // Fires when a GitHub account gets attached to a player (sign-up with GitHub or "Connect GitHub")
    async linkAccount({ user, account }) {
      if (account.provider !== 'github') return;
      try {
        await grantGithubLinkRewards(user.id, account.access_token);
      } catch (err) {
        console.error('[Auth] GitHub link rewards failed:', (err as Error).message);
      }
      // An invited player connecting GitHub pays the referral (never throws)
      await payReferralSafe(user.id);
    },
  },
  pages: {
    signIn: '/login', // Custom login page we will build
    error: '/login', // the login page shows ?error= codes (e.g. TooManyAttempts) instead of next-auth's default page
  }
};
