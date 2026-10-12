import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { validateProfileImage } from '@/lib/profileImage';

const MAX_BIO_LENGTH = 160;

// Allow larger JSON payloads for base64 images
export const maxDuration = 10;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { image, bannerImage, bio, displayName, preferredLanguage } = body;

    const updateData: Prisma.UserUpdateInput = {};

    // Validate and set bio
    if (bio !== undefined) {
      if (typeof bio === 'string' && bio.length <= MAX_BIO_LENGTH) {
        updateData.bio = bio.trim() || null;
      } else if (bio !== null) {
        return NextResponse.json({ error: `Bio must be ${MAX_BIO_LENGTH} characters or less` }, { status: 400 });
      }
    }

    // Validate avatar and banner. A value the profile already has (e.g. a GitHub
    // avatar URL from before this check) is sent back unchanged by the edit modal:
    // keep it instead of failing the whole save.
    const userId = session.user.id;
    let current: { image: string | null; bannerImage: string | null } | null = null;
    const loadCurrent = async () =>
      (current ??= await prisma.user.findUnique({
        where: { id: userId },
        select: { image: true, bannerImage: true },
      }));

    const imageFields = [
      { field: 'image', value: image, kind: 'avatar' },
      { field: 'bannerImage', value: bannerImage, kind: 'banner' },
    ] as const;

    for (const { field, value, kind } of imageFields) {
      if (value === undefined) continue;
      if (value === null) {
        updateData[field] = null;
        continue;
      }
      const check = validateProfileImage(value, kind);
      if (check.ok) {
        updateData[field] = value;
        continue;
      }
      if ((await loadCurrent())?.[field] === value) continue; // unchanged legacy value
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    // Validate and set display name
    if (displayName !== undefined && typeof displayName === 'string') {
      const trimmed = displayName.trim();
      if (trimmed.length >= 1 && trimmed.length <= 30) {
        updateData.name = trimmed;
      }
    }

    // Validate and set preferred language
    if (preferredLanguage !== undefined) {
      const validLanguages = [
        'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Go',
        'Rust', 'Ruby', 'Swift', 'Kotlin', 'PHP', 'Dart', 'Scala', 'Elixir',
        'Haskell', 'Lua', 'R', 'MATLAB', 'Shell', null
      ];
      if (preferredLanguage === null || validLanguages.includes(preferredLanguage)) {
        updateData.preferredLanguage = preferredLanguage;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        username: true,
        name: true,
        image: true,
        bio: true,
        bannerImage: true,
        preferredLanguage: true,
      }
    });

    return NextResponse.json({ success: true, user: updated });
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
