import { describe, expect, it } from 'vitest';
import { defaultGroupName } from '@/lib/introductions';
import { listNames } from '@/routes/peers/connect-form';

describe('a new group’s name when none is typed', () => {
  it('names two, three, or the first three and how many more, as the database does', () => {
    expect(defaultGroupName(['Ana Ruiz', 'Bo Chan'])).toBe('Ana & Bo');
    expect(defaultGroupName(['Ana Ruiz', 'Bo Chan', 'Cy Park'])).toBe('Ana, Bo & Cy');
    expect(defaultGroupName(['Ana', 'Bo', 'Cy', 'Di', 'Ed'])).toBe('Ana, Bo, Cy & 2 more');
  });
});

describe('listNames', () => {
  it('joins names as a sentence would', () => {
    expect(listNames(['Ana'])).toBe('Ana');
    expect(listNames(['Ana', 'Bo'])).toBe('Ana and Bo');
    expect(listNames(['Ana', 'Bo', 'Cy'])).toBe('Ana, Bo and Cy');
  });
});
