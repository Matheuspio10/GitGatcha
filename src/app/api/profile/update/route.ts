'use client';

import { useSession } from 'next-auth/react';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

const MAX_BIO_LENGTH = 160;
const MAX_IMAGE_SIZE = 300 * 1024; // 300KB in base64

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

    const updateData: any = {};

    // Validate and set bio
    if (bio !== undefined) {
      if (typeof bio === 'string' && bio.length <= MAX_BIO_LENGTH) {
        updateData.bio = bio.trim() || null;
      } else if (bio !== null) {
        return NextResponse.json({ error: `Bio must be ${MAX_BIO_LENGTH} characters or less` }, { status: 400 });
      }
    }

    // Validate and set avatar image (base64)
    if (image !== undefined) {
      if (image === null) {
        updateData.image = null;
      } else if (typeof image === 'string') {
        if (image.length > MAX_IMAGE_SIZE) {
          return NextResponse.json({ error: 'Avatar image is too large. Please use a smaller image.' }, { status: 400 });
        }
        updateData.image = image;
      }
    }

    // Validate and set banner image (base64 or preset key)
    if (bannerImage !== undefined) {
      if (bannerImage === null) {
        updateData.bannerImage = null;
      } else if (typeof bannerImage === 'string') {
        // Allow presets (short strings like "preset:cyber") or base64
        if (!bannerImage.startsWith('preset:') && !bannerImage.startsWith('color:') && bannerImage.length > MAX_IMAGE_SIZE * 2) {
          return NextResponse.json({ error: 'Banner image is too large.' }, { status: 400 });
        }
        updateData.bannerImage = bannerImage;
      }
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
      where: { id: session.user.id },
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
