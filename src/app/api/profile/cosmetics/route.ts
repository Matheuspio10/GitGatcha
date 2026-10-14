import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { enforceRateLimit } from '@/lib/rateLimit';
import { frameById, titleById } from '@/lib/collections';
import { cosmeticOptions, equippedCosmetics, getCosmeticContext } from '@/lib/cosmeticsService';

/** The player's set progress, every title/frame (locked or not) and what is equipped. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [state, user] = await Promise.all([
    getCosmeticContext(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { title: true, frame: true } }),
  ]);
  if (!state || !user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  return NextResponse.json({ sets: state.progress, ...cosmeticOptions(state.ctx), equipped: equippedCosmetics(user) });
}

/** Equips a title and a frame (null takes it off). Only unlocked ones can be equipped. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, 'profile-cosmetics', 30, 60, userId);
  if (limited) return limited;

  let body: { title?: unknown; frame?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // No body or invalid JSON
  }
  const state = await getCosmeticContext(userId);
  if (!state) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const data: { title?: string | null; frame?: string | null } = {};
  if (body.title !== undefined) {
    if (body.title === null) data.title = null;
    else {
      const title = typeof body.title === 'string' ? titleById(body.title) : null;
      if (!title) return NextResponse.json({ error: 'Unknown title' }, { status: 400 });
      if (!title.unlocked(state.ctx)) return NextResponse.json({ error: `Locked: ${title.requirement}` }, { status: 403 });
      data.title = title.id;
    }
  }
  if (body.frame !== undefined) {
    if (body.frame === null) data.frame = null;
    else {
      const frame = typeof body.frame === 'string' ? frameById(body.frame) : null;
      if (!frame) return NextResponse.json({ error: 'Unknown frame' }, { status: 400 });
      if (!frame.unlocked(state.ctx)) return NextResponse.json({ error: `Locked: ${frame.requirement}` }, { status: 403 });
      data.frame = frame.id;
    }
  }

  const user = await prisma.user.update({ where: { id: userId }, data, select: { title: true, frame: true } });
  return NextResponse.json({ success: true, equipped: equippedCosmetics(user) });
}
