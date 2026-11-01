import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LinkedText } from '@/components/linked-text';
import type * as Mentions from '@/lib/mentions';

vi.mock('@/lib/mentions', async (importOriginal) => ({
  ...(await importOriginal<typeof Mentions>()),
  useMentionedMembers: () =>
    new Map([
      ['maya.r', { id: 'm1', hasProfile: true }],
      ['hidden', { id: 'm2', hasProfile: false }],
    ]),
}));

describe('LinkedText', () => {
  it('draws an address as a link that opens elsewhere and vouches for nothing', () => {
    render(<LinkedText text="Mine is https://www.example.com/roho-cushion, try it." />);
    const link = screen.getByRole('link', { name: 'example.com/roho-cushion' });
    expect(link).toHaveAttribute('href', 'https://www.example.com/roho-cushion');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow ugc');
    expect(document.body).toHaveTextContent('Mine is example.com/roho-cushion, try it.');
  });

  it('links an @username to the profile, and leaves any other @name as words', () => {
    render(
      <MemoryRouter>
        <LinkedText text="Ask @maya.r, @hidden or @nobody. https://example.com/a" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: '@maya.r' })).toHaveAttribute('href', '/peers/m1');
    expect(screen.queryByRole('link', { name: '@hidden' })).toBeNull();
    expect(screen.queryByRole('link', { name: '@nobody' })).toBeNull();
    expect(document.body).toHaveTextContent('Ask @maya.r, @hidden or @nobody. example.com/a');
  });

  it('draws plain text as it is', () => {
    render(<LinkedText text="No links here." />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('No links here.')).toBeInTheDocument();
  });
});
