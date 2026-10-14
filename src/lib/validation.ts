/**
 * Request body validation for the API routes (zod), kept free of Next.js so it
 * can be unit tested. Routes use `readBody` from `apiResponse.ts`, which turns a
 * failure into a translated 400.
 *
 * Errors are message keys of `messages/<locale>/apiErrors.json`, never English
 * text: a schema can name the key to show with `{ error: 'profile.bioTooLong' }`
 * (`{max}` / `{min}` are filled from the failed check), anything else becomes
 * `common.invalidRequest`.
 */
import { z } from 'zod';
import { MESSAGES, type Messages } from '../i18n/messages';

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

/** A key of messages/<locale>/apiErrors.json, e.g. "common.notEnoughBits". */
export type ApiErrorCode = Leaves<Messages['apiErrors']>;
export type ErrorValues = Record<string, string | number>;

export type BodyResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ApiErrorCode; values?: ErrorValues; issues: string[] };

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  if (typeof value !== 'string') return false;
  const leaf = value.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], MESSAGES.en.apiErrors);
  return typeof leaf === 'string';
}

/** Checks an already-parsed JSON body (`undefined` when there was none or it wasn't JSON). */
export function parseBody<S extends z.ZodType>(raw: unknown, schema: S): BodyResult<z.output<S>> {
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };

  const issues = result.error.issues.map(issue => `${issue.path.join('.') || '(body)'}: ${issue.code}`);
  const named = result.error.issues.find(issue => isApiErrorCode(issue.message));
  if (!named) return { ok: false, code: 'common.invalidRequest', issues };

  const values: ErrorValues = {};
  if ('maximum' in named) values.max = Number(named.maximum);
  if ('minimum' in named) values.min = Number(named.minimum);
  return { ok: false, code: named.message as ApiErrorCode, values, issues };
}

// Building blocks shared by the route schemas

/** A database id (cuid/uuid) or another opaque identifier sent back by the client. */
export const idSchema = z.string().trim().min(1).max(100);
/** A pack id from packDefinitions (checked against the catalog by the route). */
export const packIdSchema = z.string().trim().min(1).max(100);
