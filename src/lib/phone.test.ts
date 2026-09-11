import { describe, expect, it } from 'vitest';
import { digitsOf, formatPhoneInput, isCompletePhone, toE164 } from '@/lib/phone';

describe('digitsOf', () => {
  it('strips punctuation', () => {
    expect(digitsOf('(408) 555-0112')).toBe('4085550112');
  });

  it('drops a country code the person typed themselves', () => {
    expect(digitsOf('+1 408 555 0112')).toBe('4085550112');
    expect(digitsOf('14085550112')).toBe('4085550112');
  });

  it('leaves a ten-digit number starting with 1 alone', () => {
    // 1-prefixed area codes do not exist in the US plan, but a partial entry
    // like "1408555011" must not lose its first digit mid-typing.
    expect(digitsOf('1408555011')).toBe('1408555011');
  });
});

describe('formatPhoneInput', () => {
  it('formats progressively, without adding characters too early', () => {
    expect(formatPhoneInput('4')).toBe('4');
    expect(formatPhoneInput('408')).toBe('408');
    expect(formatPhoneInput('4085')).toBe('(408) 5');
    expect(formatPhoneInput('408555')).toBe('(408) 555');
    expect(formatPhoneInput('4085550112')).toBe('(408) 555-0112');
  });

  it('is idempotent, so re-rendering a formatted value does not mangle it', () => {
    const once = formatPhoneInput('4085550112');
    expect(formatPhoneInput(once)).toBe(once);
  });

  it('ignores anything past ten digits', () => {
    expect(formatPhoneInput('40855501129999')).toBe('(408) 555-0112');
  });

  it('is empty for an empty input', () => {
    expect(formatPhoneInput('')).toBe('');
    expect(formatPhoneInput('abc')).toBe('');
  });
});

describe('toE164', () => {
  it('produces what Supabase auth and the invite list both use', () => {
    expect(toE164('(408) 555-0112')).toBe('14085550112');
    expect(toE164('408-555-0112')).toBe('14085550112');
    expect(toE164('+1 (408) 555 0112')).toBe('14085550112');
  });

  it('refuses an incomplete number rather than guessing', () => {
    expect(toE164('408555')).toBeNull();
    expect(toE164('')).toBeNull();
  });
});

describe('isCompletePhone', () => {
  it('is true at ten digits, whatever the punctuation', () => {
    expect(isCompletePhone('(408) 555-0112')).toBe(true);
    expect(isCompletePhone('408555011')).toBe(false);
  });
});
