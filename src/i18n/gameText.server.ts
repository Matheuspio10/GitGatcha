import { getTranslations } from 'next-intl/server';
import { fromTranslator, type GameNamespace, type GameText, type LooseTranslator } from './gameText';

/** Game data text for async server components, route handlers and metadata (see gameText.ts). */
export async function getGameText(namespace: GameNamespace): Promise<GameText> {
  return fromTranslator((await getTranslations(namespace)) as unknown as LooseTranslator);
}
