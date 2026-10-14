import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { enforceRateLimit } from '@/lib/rateLimit';
import { frameById, titleById } from '@/lib/collections';
import { cosmeticOptions, equippedCosmetics, getCosmeticContext } from '@/lib/cosmeticsService';
import { apiError, readBody } from '@/lib/apiResponse';
import { getGameText } from '@/i18n/gameText.server';
import type { GameText } from '@/i18n/gameText';
import { frameText, titleText } from '@/components/PlayerCosmetics';
import { z } from 'zod';

// The picker sends { title } or { frame }: an id, or null to take it off
const bodySchema = z.object({
  title: z.string({ error: 'profile.unknownTitle' }).max(100, { error: 'profile.unknownTitle' }).nullable().optional(),
  frame: z.string({ error: 'profile.unknownFrame' }).max(100, { error: 'profile.unknownFrame' }).nullable().optional(),
}).optional();

/** "Locked: <requirement>" with the requirement in the player's language (English from src/lib as the fallback). */
async function lockedError(requirement: (achText: GameText) => string, english: string) {
  let text = english;
  try {
    text = requirement(await getGameText('gameAchievements'));
  } catch {
    // No request locale: keep the English requirement
  }
  return apiError('profile.locked', 403, { requirement: text });
}

/** The player's set progress, every title/frame (locked or not) and what is equipped. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return apiError('common.unauthorized', 401);

  const [state, user] = await Promise.all([
    getCosmeticContext(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { title: true, frame: true } }),
  ]);
  if (!state || !user) return apiError('common.userNotFound', 404);
  return NextResponse.json({ sets: state.progress, ...cosmeticOptions(state.ctx), equipped: equippedCosmetics(user) });
}

/** Equips a title and a frame (null takes it off). Only unlocked ones can be equipped. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return apiError('common.unauthorized', 401);
  const limited = await enforceRateLimit(req, 'profile-cosmetics', 30, 60, userId);
  if (limited) return limited;

  const parsed = await readBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data ?? {};
  const state = await getCosmeticContext(userId);
  if (!state) return apiError('common.userNotFound', 404);

  const data: { title?: string | null; frame?: string | null } = {};
  if (body.title !== undefined) {
    if (body.title === null) data.title = null;
    else {
      const title = titleById(body.title);
      if (!title) return apiError('profile.unknownTitle');
      if (!title.unlocked(state.ctx)) return lockedError(achText => titleText(achText, title, 'requirement'), title.requirement);
      data.title = title.id;
    }
  }
  if (body.frame !== undefined) {
    if (body.frame === null) data.frame = null;
    else {
      const frame = frameById(body.frame);
      if (!frame) return apiError('profile.unknownFrame');
      if (!frame.unlocked(state.ctx)) return lockedError(achText => frameText(achText, frame, 'requirement'), frame.requirement);
      data.frame = frame.id;
    }
  }

  const user = await prisma.user.update({ where: { id: userId }, data, select: { title: true, frame: true } });
  return NextResponse.json({ success: true, equipped: equippedCosmetics(user) });
}
