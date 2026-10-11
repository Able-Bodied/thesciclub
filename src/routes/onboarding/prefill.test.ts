import { describe, expect, it } from 'vitest';
import { nameFromMetadata } from '@/routes/onboarding/prefill';

describe('the name a provider gave', () => {
  it('prefers full_name, which Google sends', () => {
    expect(nameFromMetadata({ full_name: 'Dana Smith', name: 'Dana' })).toBe('Dana Smith');
  });

  it('falls back to name', () => {
    expect(nameFromMetadata({ name: ' Dana ' })).toBe('Dana');
  });

  it('is empty when there is none, as Apple often leaves it', () => {
    expect(nameFromMetadata({})).toBe('');
    expect(nameFromMetadata(null)).toBe('');
    expect(nameFromMetadata({ full_name: '   ', name: 42 })).toBe('');
  });
});
