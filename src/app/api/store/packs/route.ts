import { NextResponse } from 'next/server';
import { getSerializablePacks, PACK_CATEGORIES } from '@/lib/packDefinitions';

export async function GET() {
  return NextResponse.json({
    packs: getSerializablePacks(),
    categories: PACK_CATEGORIES,
  });
}
