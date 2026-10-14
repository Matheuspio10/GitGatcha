/**
 * Validation of profile avatar/banner values (pure, unit tested).
 *
 * Accepted values:
 * - avatar: an uploaded `data:image/(png|jpeg|webp);base64,...` up to MAX_AVATAR_BYTES
 * - banner: the same (up to MAX_BANNER_BYTES), a known `preset:<id>`, or `color:#rrggbb`
 *
 * External URLs are rejected: they would let a profile hot-link (and track viewers
 * through) arbitrary third-party hosts.
 */

/** Must match PRESET_BANNERS in src/components/EditProfileModal.tsx. */
export const BANNER_PRESET_IDS = ['cyber', 'aurora', 'ember', 'ocean', 'void', 'neon'] as const;

export const MAX_AVATAR_BYTES = 300 * 1024;
export const MAX_BANNER_BYTES = 600 * 1024;

import type { ApiErrorCode, ErrorValues } from './validation';

export type ProfileImageKind = 'avatar' | 'banner';

/** On failure, `code` is a key of messages/<locale>/apiErrors.json. */
export type ProfileImageCheck = { ok: true } | { ok: false; code: ApiErrorCode; values?: ErrorValues };

const DATA_URL_PREFIX = /^data:image\/(png|jpeg|webp);base64,/;
const BASE64_BODY = /^[A-Za-z0-9+/]+={0,2}$/;
const HEX_COLOR = /^color:#[0-9a-fA-F]{6}$/;

/** Decoded byte size of a base64 payload. */
export function base64DecodedSize(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function checkDataUrl(value: string, maxBytes: number, kind: ProfileImageKind): ProfileImageCheck {
  const prefix = value.match(DATA_URL_PREFIX);
  if (!prefix) return { ok: false, code: `profile.${kind}.format` };

  const body = value.slice(prefix[0].length);
  // Cheap length check first, so oversized payloads never reach the regex
  if (base64DecodedSize(body) > maxBytes) {
    return { ok: false, code: `profile.${kind}.tooLarge`, values: { maxKb: Math.round(maxBytes / 1024) } };
  }
  if (body.length === 0 || body.length % 4 !== 0 || !BASE64_BODY.test(body)) {
    return { ok: false, code: `profile.${kind}.corrupt` };
  }
  return { ok: true };
}

/** Validates a non-null avatar/banner value sent by the client. */
export function validateProfileImage(value: unknown, kind: ProfileImageKind): ProfileImageCheck {
  if (typeof value !== 'string') return { ok: false, code: `profile.${kind}.invalid` };

  if (kind === 'banner') {
    if (value.startsWith('preset:')) {
      const id = value.slice('preset:'.length);
      return (BANNER_PRESET_IDS as readonly string[]).includes(id)
        ? { ok: true }
        : { ok: false, code: 'profile.unknownBannerPreset' };
    }
    if (value.startsWith('color:')) {
      return HEX_COLOR.test(value) ? { ok: true } : { ok: false, code: 'profile.bannerColor' };
    }
  }

  if (value.startsWith('data:')) {
    return checkDataUrl(value, kind === 'avatar' ? MAX_AVATAR_BYTES : MAX_BANNER_BYTES, kind);
  }

  return { ok: false, code: `profile.${kind}.external` };
}
