import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { validateProfileImage } from '@/lib/profileImage';
import { apiError, readBody, routeError } from '@/lib/apiResponse';
import { z } from 'zod';

const MAX_BIO_LENGTH = 160;
const MAX_NAME_LENGTH = 30;
const PREFERRED_LANGUAGES = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Go',
  'Rust', 'Ruby', 'Swift', 'Kotlin', 'PHP', 'Dart', 'Scala', 'Elixir',
  'Haskell', 'Lua', 'R', 'MATLAB', 'Shell',
] as const;

// The edit modal always sends every field: an empty name or an unknown language
// is ignored (as before), the images are checked by validateProfileImage below.
const bodySchema = z.object({
  image: z.string({ error: 'profile.avatar.invalid' }).nullable().optional(),
  bannerImage: z.string({ error: 'profile.banner.invalid' }).nullable().optional(),
  bio: z.string().max(MAX_BIO_LENGTH, { error: 'profile.bioTooLong' }).nullable().optional(),
  displayName: z.string().trim().min(1).max(MAX_NAME_LENGTH).optional().catch(undefined),
  preferredLanguage: z.enum(PREFERRED_LANGUAGES).nullable().optional().catch(undefined),
});

// Allow larger JSON payloads for base64 images
export const maxDuration = 10;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiError('common.unauthorized', 401);

    const body = await readBody(req, bodySchema);
    if (!body.ok) return body.response;
    const { image, bannerImage, bio, displayName, preferredLanguage } = body.data;

    const updateData: Prisma.UserUpdateInput = {};

    if (bio !== undefined) updateData.bio = bio?.trim() || null;

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
      return apiError(check.code, 400, check.values);
    }

    if (displayName !== undefined) updateData.name = displayName;
    if (preferredLanguage !== undefined) updateData.preferredLanguage = preferredLanguage;

    if (Object.keys(updateData).length === 0) return apiError('profile.noValidFields');

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
    return routeError(error, 'common.internal', 'Error updating profile');
  }
}
