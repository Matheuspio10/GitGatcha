import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { randomInt, randomUUID } from 'node:crypto';
import { enforceRateLimit } from '@/lib/rateLimit';
import { STARTING_BITS } from '@/lib/onboarding';
import { apiError, readBody } from '@/lib/apiResponse';
import { z } from 'zod';

// Same rules as before (an e-mail and a password of 6+ characters), now bounded
const bodySchema = z.object({
  email: z.string({ error: 'auth.invalidInput' }).min(1, { error: 'auth.invalidInput' }).max(254, { error: 'auth.invalidInput' }),
  password: z.string({ error: 'auth.invalidInput' }).min(6, { error: 'auth.invalidInput' }).max(200, { error: 'auth.invalidInput' }),
}, { error: 'auth.invalidInput' });

/**
 * A free username based on the e-mail's local part (usernames are unique: two
 * "john@…" addresses must not make the second sign-up fail).
 */
async function availableUsername(localPart: string): Promise<string> {
  const base = (localPart.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 14) || 'player').padEnd(3, '_');
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = attempt === 0 ? base : `${base}_${randomInt(1000, 10000)}`;
    const taken = await prisma.user.findFirst({ where: { username: { equals: candidate, mode: 'insensitive' } }, select: { id: true } });
    if (!taken) return candidate;
  }
  return `player_${randomUUID().slice(0, 8)}`;
}

export async function POST(req: Request) {
  try {
    // Mass sign-ups farm the starting BITS: a handful of accounts per IP per hour
    const limited = await enforceRateLimit(req, 'register', 5, 60 * 60);
    if (limited) return limited;

    const body = await readBody(req, bodySchema);
    if (!body.ok) return body.response;
    const { email, password } = body.data;

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      return apiError('auth.emailExists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        // Provisional name from the e-mail; the player confirms or changes it in the setup screen
        username: await availableUsername(email.split('@')[0]),
        password: hashedPassword,
        currency: STARTING_BITS,
        bitsTransactions: { create: { amount: STARTING_BITS, balanceAfter: STARTING_BITS, reason: 'starting_bits' } },
        xp: 0,
        level: 1
      }
    });

    return NextResponse.json({ success: true, user: { id: user.id, email: user.email } });

  } catch (error) {
    console.error('Register error:', error);
    return apiError('common.internal', 500);
  }
}
