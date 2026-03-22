import { getMilestoneForTier, LOYALTY_MILESTONES } from '../loyaltyService';

describe('getMilestoneForTier', () => {
  it('should return the correct milestone for a valid tier', () => {
    const validTiers = LOYALTY_MILESTONES.map(m => m.tier);

    for (const tier of validTiers) {
      const result = getMilestoneForTier(tier);
      expect(result).toBeDefined();
      expect(result?.tier).toBe(tier);
    }
  });

  it('should return undefined for an invalid tier', () => {
    const result = getMilestoneForTier('invalid_tier');
    expect(result).toBeUndefined();
  });

  it('should return undefined for an empty string', () => {
    const result = getMilestoneForTier('');
    expect(result).toBeUndefined();
  });
});
