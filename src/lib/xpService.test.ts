import { describe, it, expect } from 'vitest';
import { xpForLevel } from './xpService';

describe('xpForLevel', () => {
  it('should return 0 for level 1 and below', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(0)).toBe(0);
    expect(xpForLevel(-5)).toBe(0);
  });

  it('should return the correct XP for documented levels', () => {
    // Math.pow(2, 1.5) = 2.828427... * 100 = 282.8427...
    // Math.floor(282.8427...) = 282
    // Math.pow(5, 1.5) = 11.1803... * 100 = 1118.03...
    // Math.floor(1118.03...) = 1118
    // Math.pow(10, 1.5) = 31.6227... * 100 = 3162.27...
    // Math.floor(3162.27...) = 3162
    expect(xpForLevel(2)).toBe(282);
    expect(xpForLevel(5)).toBe(1118);
    expect(xpForLevel(10)).toBe(3162);
  });

  it('should correctly calculate XP for higher levels', () => {
    // 100 * 50^1.5 = 100 * 353.55339 = 35355.339... -> 35355
    expect(xpForLevel(50)).toBe(35355);
    // 100 * 100^1.5 = 100 * 1000 = 100000
    expect(xpForLevel(100)).toBe(100000);
  });
});
