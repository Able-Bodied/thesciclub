import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AttachmentGrid } from '@/routes/chat/attachment-grid';

/**
 * The signing is stubbed: it is a storage call, and what this file is about is
 * what gets drawn once the URLs are known — and what does not, when one is
 * not.
 */
const urls = vi.hoisted(() => new Map<string, string>());
vi.mock('@/lib/chat/attachments', () => ({
  useAttachmentUrls: (paths: readonly string[]) =>
    new Map([...urls].filter(([path]) => paths.includes(path))),
}));

beforeEach(() => {
  urls.clear();
  urls.set('threads/t/a.webp', 'https://signed/a');
  urls.set('threads/t/b.webp', 'https://signed/b');
});

describe('the photographs on a message', () => {
  it('draws one button per photograph the reader may see, numbered', () => {
    render(<AttachmentGrid paths={['threads/t/a.webp', 'threads/t/b.webp']} from="Bo" />);
    expect(
      screen.getByRole('button', { name: 'Photograph 1 of 2 from Bo. Open it.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Photograph 2 of 2 from Bo. Open it.' }),
    ).toBeInTheDocument();
  });

  // A path the policy refuses — or a file since deleted — never gets a URL.
  // It is left out rather than drawn as a broken tile, and the numbering is
  // of what is shown.
  it('leaves out a photograph with no URL, and numbers the rest', () => {
    urls.delete('threads/t/a.webp');
    render(<AttachmentGrid paths={['threads/t/a.webp', 'threads/t/b.webp']} from="Bo" />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Photograph 1 of 1/ })).toBeInTheDocument();
  });

  it('draws nothing at all when no photograph can be shown', () => {
    urls.clear();
    const { container } = render(<AttachmentGrid paths={['threads/t/a.webp']} from="Bo" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('opens the photograph over the page, and closes it three ways', async () => {
    const user = userEvent.setup();
    render(<AttachmentGrid paths={['threads/t/a.webp']} from="Bo" />);
    await user.click(screen.getByRole('button', { name: /Open it/ }));
    expect(screen.getByRole('img', { name: 'Photograph 1 of 1 from Bo' })).toHaveAttribute(
      'src',
      'https://signed/a',
    );

    // Escape.
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('img', { name: /from Bo/ })).toBeNull();

    // The close control and the backdrop, which is a button and not a div
    // with a handler. Two controls with one name, in DOM order.
    const ways = () => {
      const [backdrop, control] = screen.getAllByRole('button', { name: 'Close the photograph' });
      if (!backdrop || !control) throw new Error('the viewer should offer two ways out');
      return { backdrop, control };
    };
    await user.click(screen.getByRole('button', { name: /Open it/ }));
    await user.click(ways().control);
    expect(screen.queryByRole('img', { name: /from Bo/ })).toBeNull();

    await user.click(screen.getByRole('button', { name: /Open it/ }));
    await user.click(ways().backdrop);
    expect(screen.queryByRole('img', { name: /from Bo/ })).toBeNull();
  });
});
