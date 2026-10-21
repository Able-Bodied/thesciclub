import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AvatarLink } from '@/components/member-avatar';

function renderLink(hasProfile: boolean) {
  render(
    <MemoryRouter>
      <AvatarLink memberId="m-1" hasProfile={hasProfile}>
        <span>SL</span>
      </AvatarLink>
    </MemoryRouter>,
  );
  return screen.getByText('SL').parentElement;
}

describe('AvatarLink', () => {
  it('opens the profile, for a pointer only', () => {
    const link = renderLink(true);
    expect(link).toHaveAttribute('href', '/peers/m-1');
    // The name beside it is the link a keyboard and a screen reader get.
    expect(link).toHaveAttribute('tabindex', '-1');
    expect(link).toHaveAttribute('aria-hidden', 'true');
  });

  it('is a plain picture when Peers would not show them', () => {
    const picture = renderLink(false);
    expect(picture?.tagName).toBe('SPAN');
    expect(picture).not.toHaveAttribute('href');
  });
});
