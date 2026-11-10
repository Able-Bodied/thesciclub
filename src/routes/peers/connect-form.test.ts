import { describe, expect, it } from 'vitest';
import { listNames } from '@/routes/peers/connect-form';

describe('listNames', () => {
  it('joins names as a sentence would', () => {
    expect(listNames(['Ana'])).toBe('Ana');
    expect(listNames(['Ana', 'Bo'])).toBe('Ana and Bo');
    expect(listNames(['Ana', 'Bo', 'Cy'])).toBe('Ana, Bo and Cy');
  });
});
