import { describe, expect, it } from 'vitest';
import { type BrowseMemberRow, toMember } from '@/lib/members';
import { makeMember } from '@/test/factory';

// The existing profile fixture, in the API's snake_case spelling.
const row = Object.fromEntries(
  Object.entries(makeMember()).map(([key, value]) => [
    key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
    value,
  ]),
) as unknown as BrowseMemberRow;

describe('linked organization identities', () => {
  it('maps administrator links independently of affiliations', () => {
    const member = toMember({
      ...row,
      affiliations: ['A different group'],
      represented_organizations: [
        { id: 'org-id', name: 'Able Bodied', short_code: 'AB', logo_path: 'organizations/ab.png' },
      ],
    });
    expect(member.representedOrganizations).toEqual([
      { id: 'org-id', name: 'Able Bodied', shortCode: 'AB', logoPath: 'organizations/ab.png' },
    ]);
    expect(member.affiliations).toEqual(['A different group']);
  });
  it('accepts a profile from before the migration without inventing a link', () => {
    const legacy = { ...row };
    delete legacy.represented_organizations;
    expect(toMember(legacy).representedOrganizations).toEqual([]);
  });
});
