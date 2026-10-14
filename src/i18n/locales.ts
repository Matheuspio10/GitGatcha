/**
 * Supported interface languages (client-safe). The language is a cookie, not a
 * URL prefix: the first visit follows the browser (Accept-Language), and the
 * switcher in the header stores the player's choice.
 */
export const LOCALES = ['en', 'pt-BR'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'NEXT_LOCALE';

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  'pt-BR': 'Português (BR)',
};

/** Short form for the compact header picker. */
export const LOCALE_SHORT: Record<Locale, string> = {
  en: 'EN',
  'pt-BR': 'PT',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** The cookie when valid, else the first supported language of Accept-Language (any "pt" counts as pt-BR). */
export function pickLocale(cookie: string | undefined, acceptLanguage: string | null | undefined): Locale {
  if (isLocale(cookie)) return cookie;
  const wanted = (acceptLanguage ?? '')
    .split(',')
    .map(part => {
      const [tag, q] = part.trim().split(';q=');
      return { tag: tag.toLowerCase(), q: q === undefined ? 1 : Number(q) || 0 };
    })
    .filter(x => x.tag)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of wanted) {
    if (tag.startsWith('pt')) return 'pt-BR';
    if (tag.startsWith('en')) return 'en';
  }
  return DEFAULT_LOCALE;
}
