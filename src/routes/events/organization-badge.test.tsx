import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OrganizationBadge } from '@/routes/events/organization-badge';

describe('the short-code tile', () => {
  it('shrinks a four-letter code, which never fitted the tile', () => {
    // "Christopher & Dana Reeve Foundation" is CDRF, and four bold capitals
    // overflowed the small tile at every text size — it only became obvious
    // once the tile started scaling with the text.
    render(<OrganizationBadge organization={null} hostName="Christopher Dana Reeve Foundation" />);
    expect(screen.getByText('CDRF').className).toContain('0.76em');
  });

  it('shrinks three as well, because letters are not equal widths', () => {
    // NCS fits where WWM does not.
    render(<OrganizationBadge organization={null} hostName="Wheel With Me" />);
    expect(screen.getByText('WWM').className).toContain('0.88em');
  });

  it('leaves a short code at full size', () => {
    render(<OrganizationBadge organization={null} hostName="Bay Outreach" />);
    expect(screen.getByText('BO').className).toBe('');
  });
});
