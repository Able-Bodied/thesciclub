import { describe, expect, it } from 'vitest';
import { listInWords, type MemberDetails, missingDetails } from '@/routes/profile/details-api';

const details = (o: Partial<MemberDetails> = {}): MemberDetails => ({
  displayName: 'Dana',
  birthDate: '1990-04-02',
  exactLevel: 'C7',
  completeness: 'Incomplete',
  injuryDate: '2013-01-01',
  injuryDatePrecision: 'year',
  city: 'San Jose',
  state: 'CA',
  photoPath: 'u1/profile.jpg',
  showInBrowse: true,
  ...o,
});

describe('what is still blank', () => {
  it('finds nothing on a complete profile', () => {
    expect(missingDetails(details())).toEqual([]);
  });

  // The state onboarding now leaves people in: name and birthday, nothing else.
  it('names everything a skipped signup leaves behind', () => {
    const bare = details({
      exactLevel: null,
      injuryDate: null,
      injuryDatePrecision: null,
      city: null,
      state: '',
      photoPath: null,
    });
    expect(missingDetails(bare)).toEqual([
      'a photo',
      'your injury level',
      'when you were injured',
      'your city',
      'your state',
    ]);
  });

  // 'Do not know' is an honest answer a lot of people will give, and counting
  // it as a gap would nag somebody to replace a fact with a guess.
  it('does not count "Do not know" as unanswered', () => {
    expect(missingDetails(details({ completeness: 'Do not know' }))).toEqual([]);
  });

  // Neither can be absent: the row requires both.
  it('never counts the name or the birthday', () => {
    expect(missingDetails(details({ displayName: '', birthDate: '' }))).toEqual([]);
  });
});

describe('listing them in words', () => {
  it('reads as a sentence rather than a comma dump', () => {
    expect(listInWords(['a photo'])).toBe('a photo');
    expect(listInWords(['a photo', 'your city'])).toBe('a photo and your city');
    expect(listInWords(['a photo', 'your city', 'your state'])).toBe(
      'a photo, your city and your state',
    );
  });

  it('is empty when nothing is missing', () => {
    expect(listInWords([])).toBe('');
  });
});
