import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShareTarget } from '@/lib/chat/shared-posts';
import { ShareEventButton, ShareOrganizationButton } from '@/routes/events/share-event';

const sheet = vi.hoisted(() => ({
  props: null as null | {
    heading: string;
    what: string;
    link?: string;
    send: (to: ShareTarget, authorId: string, line: string) => Promise<unknown>;
  },
  sent: [] as unknown[],
}));
vi.mock('@/routes/chat/share-post', () => ({
  ShareSheet: (props: typeof sheet.props) => {
    sheet.props = props;
    return <p>{props?.heading}</p>;
  },
}));
vi.mock('@/lib/chat/shared-posts', () => ({
  shareLinkInChat: (...args: unknown[]) => {
    sheet.sent.push(args);
    return Promise.resolve({ ok: true, threadId: 't1' });
  },
}));

beforeEach(() => {
  sheet.props = null;
  sheet.sent = [];
});

describe('sharing an event or an organization', () => {
  it('opens the share sheet with the event’s public link, and sends it into a chat', async () => {
    render(<ShareEventButton eventId="e1" shortLink="happy-hour" title="Friday Happy Hour" />);
    await userEvent.click(screen.getByRole('button', { name: 'Share this event' }));
    expect(screen.getByText('Share event')).toBeInTheDocument();
    expect(sheet.props?.link).toBe('https://thesciclub.com/e/happy-hour');
    await sheet.props?.send({ threadId: 'g1' }, 'me', 'Coming?');
    expect(sheet.sent).toEqual([
      [
        { title: 'Friday Happy Hour', url: 'https://thesciclub.com/e/happy-hour' },
        { threadId: 'g1' },
        'me',
        'Coming?',
      ],
    ]);
  });

  it('shares an organization’s page in the club', async () => {
    render(<ShareOrganizationButton id="o1" name="NorCal SCI" />);
    await userEvent.click(screen.getByRole('button', { name: 'Share this organization' }));
    expect(screen.getByText('Share organization')).toBeInTheDocument();
    expect(sheet.props?.what).toBe('NorCal SCI');
    expect(sheet.props?.link).toBe(`${window.location.origin}/events/organizations/o1`);
  });
});
