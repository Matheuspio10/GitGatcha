import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { LOCALE_COOKIE, pickLocale } from './locales';
import { MESSAGES } from './messages';

/** next-intl without URL prefixes: the locale comes from the cookie or the browser. */
export default getRequestConfig(async () => {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  const locale = pickLocale(cookieStore.get(LOCALE_COOKIE)?.value, headerList.get('accept-language'));
  return {
    locale,
    messages: MESSAGES[locale],
    // Dates and numbers follow the language; the game clock is UTC
    timeZone: 'UTC',
  };
});
