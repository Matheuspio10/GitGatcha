export const INVOCATION_COSTS: Record<string, { fragments: number, bits: number }> = {
  'Common': { fragments: 30, bits: 200 },
  'Uncommon': { fragments: 60, bits: 500 },
  'Rare': { fragments: 120, bits: 1200 },
  'Epic': { fragments: 250, bits: 3000 },
  'Legendary': { fragments: 500, bits: 8000 }
};

export function getInvocationCost(rarity: string) {
  return INVOCATION_COSTS[rarity] || INVOCATION_COSTS['Common'];
}
