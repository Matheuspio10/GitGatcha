/**
 * Every message namespace, statically imported (one JSON file per area and
 * language under /messages), merged into one object per locale. Adding a
 * namespace: create messages/<locale>/<name>.json for every locale and list it here.
 */
import type { Locale } from './locales';

import en_common from '../../messages/en/common.json';
import en_nav from '../../messages/en/nav.json';
import en_store from '../../messages/en/store.json';
import en_inventory from '../../messages/en/inventory.json';
import en_collection from '../../messages/en/collection.json';
import en_forge from '../../messages/en/forge.json';
import en_onboarding from '../../messages/en/onboarding.json';
import en_notifications from '../../messages/en/notifications.json';
import en_battle from '../../messages/en/battle.json';
import en_teamBuilder from '../../messages/en/teamBuilder.json';
import en_leaderboard from '../../messages/en/leaderboard.json';
import en_social from '../../messages/en/social.json';
import en_profile from '../../messages/en/profile.json';
import en_public from '../../messages/en/public.json';
import en_game from '../../messages/en/game.json';
import en_wiki from '../../messages/en/wiki.json';
import ptBR_common from '../../messages/pt-BR/common.json';
import ptBR_nav from '../../messages/pt-BR/nav.json';
import ptBR_store from '../../messages/pt-BR/store.json';
import ptBR_inventory from '../../messages/pt-BR/inventory.json';
import ptBR_collection from '../../messages/pt-BR/collection.json';
import ptBR_forge from '../../messages/pt-BR/forge.json';
import ptBR_onboarding from '../../messages/pt-BR/onboarding.json';
import ptBR_notifications from '../../messages/pt-BR/notifications.json';
import ptBR_battle from '../../messages/pt-BR/battle.json';
import ptBR_teamBuilder from '../../messages/pt-BR/teamBuilder.json';
import ptBR_leaderboard from '../../messages/pt-BR/leaderboard.json';
import ptBR_social from '../../messages/pt-BR/social.json';
import ptBR_profile from '../../messages/pt-BR/profile.json';
import ptBR_public from '../../messages/pt-BR/public.json';
import ptBR_game from '../../messages/pt-BR/game.json';
import ptBR_wiki from '../../messages/pt-BR/wiki.json';

export const NAMESPACES = ['common', 'nav', 'store', 'inventory', 'collection', 'forge', 'onboarding', 'notifications', 'battle', 'teamBuilder', 'leaderboard', 'social', 'profile', 'public', 'game', 'wiki'] as const;

/** English is the source of truth: its shape types every key (see global.d.ts). */
const EN = { common: en_common, nav: en_nav, store: en_store, inventory: en_inventory, collection: en_collection, forge: en_forge, onboarding: en_onboarding, notifications: en_notifications, battle: en_battle, teamBuilder: en_teamBuilder, leaderboard: en_leaderboard, social: en_social, profile: en_profile, public: en_public, game: en_game, wiki: en_wiki };
export type Messages = typeof EN;

// Portuguese must have the same keys (messages.test.ts also checks placeholders)
const PT_BR: Messages = { common: ptBR_common, nav: ptBR_nav, store: ptBR_store, inventory: ptBR_inventory, collection: ptBR_collection, forge: ptBR_forge, onboarding: ptBR_onboarding, notifications: ptBR_notifications, battle: ptBR_battle, teamBuilder: ptBR_teamBuilder, leaderboard: ptBR_leaderboard, social: ptBR_social, profile: ptBR_profile, public: ptBR_public, game: ptBR_game, wiki: ptBR_wiki };

export const MESSAGES: Record<Locale, Messages> = { en: EN, 'pt-BR': PT_BR };
