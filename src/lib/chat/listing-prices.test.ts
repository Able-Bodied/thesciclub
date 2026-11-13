import { describe, expect, it } from 'vitest';
import { formatPrice, parsePrice } from '@/lib/chat/listing-prices';

// The owner, 2026-11-12: a For sale listing has a price, kept in cents.
describe('a listing price', () => {
  it('reads what a seller types, in cents, and says it back the same', () => {
    expect(parsePrice('')).toBeNull();
    expect(parsePrice(' $1,200 ')).toBe(120_000);
    expect(parsePrice('12.5')).toBe(1250);
    expect(parsePrice('0.10')).toBe(10);
    for (const bad of ['twelve', '12.505', '-5', '1e3', '$10000000.01']) {
      expect(parsePrice(bad)).toBeUndefined();
    }
    expect([120_000, 1250, 10, 0].map(formatPrice)).toEqual(['$1,200', '$12.50', '$0.10', 'Free']);
  });
});
