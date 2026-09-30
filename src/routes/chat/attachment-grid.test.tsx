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

  // Four photographs of a set-up, opened one at a time: closing and reopening
  // each from the chat was the way through them, and it was a long way.
  it('steps to the next and the previous photograph without closing', async () => {
    const user = userEvent.setup();
    render(<AttachmentGrid paths={['threads/t/a.webp', 'threads/t/b.webp']} from="Bo" />);
    await user.click(screen.getByRole('button', { name: 'Photograph 1 of 2 from Bo. Open it.' }));
    expect(screen.getByRole('img', { name: 'Photograph 1 of 2 from Bo' })).toBeInTheDocument();
    // At the start there is no previous, and the control says so rather than vanishing.
    expect(screen.getByRole('button', { name: 'Previous photograph' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Next photograph' }));
    expect(screen.getByRole('img', { name: 'Photograph 2 of 2 from Bo' })).toHaveAttribute(
      'src',
      'https://signed/b',
    );
    expect(screen.getByRole('button', { name: 'Next photograph' })).toBeDisabled();

    // The arrow keys do the same.
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('img', { name: 'Photograph 1 of 2 from Bo' })).toBeInTheDocument();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('img', { name: 'Photograph 2 of 2 from Bo' })).toBeInTheDocument();
    // And past the end, nothing happens.
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('img', { name: 'Photograph 2 of 2 from Bo' })).toBeInTheDocument();
  });

  // It covers the page, so a screen reader is told a dialog opened, and the
  // chat behind it is out of reach until it closes.
  it('opens as a modal dialog named for whose photographs they are', async () => {
    const user = userEvent.setup();
    render(<AttachmentGrid paths={['threads/t/a.webp', 'threads/t/b.webp']} from="Bo" />);
    await user.click(screen.getByRole('button', { name: 'Photograph 1 of 2 from Bo. Open it.' }));
    const viewer = screen.getByRole('dialog', { name: 'Photographs from Bo' });
    expect(viewer).toHaveAttribute('aria-modal', 'true');
    expect(viewer).toContainElement(screen.getByRole('img', { name: 'Photograph 1 of 2 from Bo' }));
  });

  it('keeps Tab inside the viewer, both ways round', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Somewhere in the chat</button>
        <AttachmentGrid paths={['threads/t/a.webp', 'threads/t/b.webp']} from="Bo" />
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Photograph 1 of 2 from Bo. Open it.' }));
    const viewer = screen.getByRole('dialog');

    // Close, then Next (Previous is disabled at the start), then round again.
    // Eight presses is round the ring several times.
    const reached = new Set<string>();
    for (let press = 0; press < 8; press += 1) {
      await user.tab();
      expect(viewer).toContainElement(document.activeElement as HTMLElement);
      reached.add(document.activeElement?.getAttribute('aria-label') ?? '');
    }
    expect(reached).toEqual(new Set(['Close the photograph', 'Next photograph']));

    for (let press = 0; press < 5; press += 1) {
      await user.tab({ shift: true });
      expect(viewer).toContainElement(document.activeElement as HTMLElement);
    }
  });

  // Otherwise a keyboard or switch user lands at the top of the page and has
  // to find their place in the conversation again.
  it('puts focus back on the tile that opened it, however it closes', async () => {
    const user = userEvent.setup();
    render(<AttachmentGrid paths={['threads/t/a.webp', 'threads/t/b.webp']} from="Bo" />);
    const second = screen.getByRole('button', { name: 'Photograph 2 of 2 from Bo. Open it.' });

    await user.click(second);
    await user.keyboard('{Escape}');
    expect(second).toHaveFocus();

    await user.click(second);
    await user.click(screen.getByRole('button', { name: 'Previous photograph' }));
    const [backdrop, control] = screen.getAllByRole('button', { name: 'Close the photograph' });
    if (!backdrop || !control) throw new Error('the viewer should offer two ways out');
    await user.click(control);
    expect(second).toHaveFocus();

    await user.click(second);
    const [again] = screen.getAllByRole('button', { name: 'Close the photograph' });
    if (!again) throw new Error('the viewer should have a backdrop');
    await user.click(again);
    expect(second).toHaveFocus();
  });

  it('offers no stepping on a single photograph', async () => {
    const user = userEvent.setup();
    render(<AttachmentGrid paths={['threads/t/a.webp']} from="Bo" />);
    await user.click(screen.getByRole('button', { name: /Open it/ }));
    expect(screen.queryByRole('button', { name: 'Next photograph' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Previous photograph' })).toBeNull();
  });

  it('draws a photograph as itself, with no box behind it', () => {
    render(<AttachmentGrid paths={['threads/t/a.webp']} from="Bo" />);
    const tile = screen.getByRole('button', { name: /Open it/ });
    expect(tile.className).not.toMatch(/bg-/);
  });
});
