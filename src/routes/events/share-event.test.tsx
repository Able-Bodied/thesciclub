import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShareEventButton } from '@/routes/events/share-event';

vi.mock('@/lib/announce', () => ({ useAnnounce: () => () => undefined }));

afterEach(() => {
  Reflect.deleteProperty(navigator, 'share');
});

describe('sharing an event', () => {
  it('opens the share sheet with the event’s public link', async () => {
    const share = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    render(<ShareEventButton eventId="e1" shortLink="happy-hour" title="Friday Happy Hour" />);
    await userEvent.click(screen.getByRole('button', { name: 'Share this event' }));
    expect(share).toHaveBeenCalledWith({
      title: 'Friday Happy Hour',
      text: 'Friday Happy Hour, on The SCI Club.',
      url: 'https://thesciclub.com/e/happy-hour',
    });
  });

  it('copies the link where there is no share sheet, and says so', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(<ShareEventButton eventId="e1" shortLink={null} title="Friday Happy Hour" />);
    await user.click(screen.getByRole('button', { name: 'Share this event' }));
    expect(writeText).toHaveBeenCalledWith('https://thesciclub.com/e/e1');
    expect(await screen.findByRole('button', { name: 'Link copied' })).toBeInTheDocument();
  });
});
