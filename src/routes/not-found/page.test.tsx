import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import NotFoundPage from '@/routes/not-found/page';

describe('NotFoundPage', () => {
  it('says the address is wrong rather than showing an empty page', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByText(/does not go anywhere/i)).toBeInTheDocument();
  });

  it('offers a way out that does not depend on history', () => {
    // A member who opened a stale link has nothing behind them to go back to.
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Go to Home' })).toHaveAttribute('href', '/home');
  });

  // The tabs sit under the screen on a phone and above it on a wider one, so
  // the sentence carries both words and the layout shows the true one.
  it('points to the tabs below on a phone and above on a wider screen', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('below')).toHaveClass('md:hidden');
    expect(screen.getByText('above')).toHaveClass('hidden', 'md:inline');
  });
});
