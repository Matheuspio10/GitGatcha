import type { Locale } from './locales';
import type { Messages } from './messages';

// Typed translation keys: t('store.buy') fails type-checking when the key doesn't exist
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}
