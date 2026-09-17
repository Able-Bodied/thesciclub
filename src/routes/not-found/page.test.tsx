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
    expect(screen.getByRole('link', { name: /go to peers/i })).toHaveAttribute('href', '/peers');
  });
});
