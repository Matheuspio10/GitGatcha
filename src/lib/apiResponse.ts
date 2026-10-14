/**
 * Error responses of the API routes, in the player's language.
 *
 * Every error body is `{ error, code }`: `error` is the message translated with
 * the request's locale (the screens show it as is), `code` the stable key of
 * `messages/<locale>/apiErrors.json` for code that needs to tell errors apart.
 */
import { NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';
import type { z } from 'zod';
import { MESSAGES } from '../i18n/messages';
import { UserFacingError } from './userLock';
import { parseBody, type ApiErrorCode, type ErrorValues } from './validation';

type LooseTranslator = (key: string, values?: ErrorValues) => string;

/** English text of a key with its {values} filled in, for when there is no request locale. */
function englishMessage(code: ApiErrorCode, values?: ErrorValues): string {
  const template = code.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], MESSAGES.en.apiErrors) as string;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (values && name in values ? String(values[name]) : match));
}

export async function errorMessage(code: ApiErrorCode, values?: ErrorValues): Promise<string> {
  try {
    const t = (await getTranslations('apiErrors')) as unknown as LooseTranslator;
    return t(code, values);
  } catch {
    return englishMessage(code, values);
  }
}

export async function apiError(
  code: ApiErrorCode,
  status = 400,
  values?: ErrorValues,
  init?: { extra?: Record<string, unknown>; headers?: HeadersInit },
) {
  return NextResponse.json(
    { error: await errorMessage(code, values), code, ...init?.extra },
    { status, headers: init?.headers },
  );
}

/**
 * Reads and validates the JSON body. A missing or malformed body is checked as
 * `undefined`, so the schema decides whether it is acceptable.
 *
 *   const body = await readBody(req, schema);
 *   if (!body.ok) return body.response;
 */
export async function readBody<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<{ ok: true; data: z.output<S> } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = undefined;
  }
  const result = parseBody(raw, schema);
  if (result.ok) return { ok: true, data: result.data };
  return { ok: false, response: await apiError(result.code, 400, result.values, { extra: { issues: result.issues } }) };
}

/**
 * The catch-all of a route: a UserFacingError becomes its translated message
 * and status; anything else is logged under `label` and answered with `fallback` (500).
 */
export async function routeError(err: unknown, fallback: ApiErrorCode, label: string) {
  if (err instanceof UserFacingError) return apiError(err.code, err.status, err.values);
  console.error(`${label}:`, err);
  return apiError(fallback, 500);
}
