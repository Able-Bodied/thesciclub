import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ChatThread } from '@/lib/chat/types';
import type { AudienceChoice } from '@/routes/events/audience-field';

const chats = vi.hoisted(() => ({ threads: [] as Partial<ChatThread>[] }));
vi.mock('@/lib/chat/threads', () => ({
  useMyThreads: () => ({
    threads: chats.threads,
    loading: false,
    error: null,
    reload: () => undefined,
  }),
}));

vi.mock('@/lib/mentions', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadMentionCandidates: () =>
    Promise.resolve([
      { id: 'dee', displayName: 'Dee Lopez', username: 'dee', photoPath: null, photoAlt: null },
      { id: 'eli', displayName: 'Eli Park', username: 'eli', photoPath: null, photoAlt: null },
    ]),
}));
vi.mock('@/lib/photos', () => ({ usePhotoUrl: () => null, usePhotoUrls: () => new Map() }));

const { AudienceField, audienceReady, CLUB_AUDIENCE, GROUP_BUTTONS_MAX } = await import(
  '@/routes/events/audience-field'
);

const group = (n: number): Partial<ChatThread> => ({
  id: `g${n}`,
  kind: 'group',
  name: `Group ${n}`,
});

const NCS = [{ id: 'ncs', name: 'NorCal SCI' }];

function Harness({
  start,
  organizations = NCS,
  seen,
}: {
  start: AudienceChoice;
  organizations?: { id: string; name: string }[];
  seen: AudienceChoice[];
}) {
  const [value, setValue] = useState(start);
  return (
    <AudienceField
      value={value}
      onChange={(next) => {
        seen.push(next);
        setValue(next);
      }}
      organizations={organizations}
      labelClassName=""
      hintClassName=""
    />
  );
}

describe('Who in the club sees it', () => {
  // The link is for every event (the owner, 2026-10-29), so not a choice.
  it('offers the four, naming the one organization whose members', () => {
    chats.threads = [];
    render(<Harness start={CLUB_AUDIENCE} seen={[]} />);
    expect(screen.getByRole('group', { name: 'Who in the club sees it' })).toBeInTheDocument();
    const options = screen.getAllByRole('radio').map((r) => r.closest('label')?.textContent);
    expect(options).toHaveLength(4);
    expect(options[0]).toContain('Everyone in the club');
    expect(options[1]).toContain('Members of NorCal SCI');
    expect(options[2]).toContain('Chosen groups');
    expect(options[3]).toContain('Invite only');
    expect(screen.queryByText(/Anyone with the link/)).toBeNull();
    expect(screen.getByText(/Anyone you send its link to can open it/)).toBeInTheDocument();
  });

  it('has no organization to offer to someone who is no org admin', () => {
    chats.threads = [];
    render(<Harness start={CLUB_AUDIENCE} organizations={[]} seen={[]} />);
    expect(screen.queryByRole('radio', { name: /Members of (an organization|NorCal)/ })).toBeNull();
    expect(screen.getByRole('radio', { name: /Invite only/ })).toBeInTheDocument();
  });

  // The owner, 2026-11-06.
  it('chooses the one organization with the option, and says it is private', async () => {
    chats.threads = [];
    const seen: AudienceChoice[] = [];
    render(<Harness start={CLUB_AUDIENCE} seen={seen} />);
    await userEvent.click(screen.getByRole('radio', { name: /Members of NorCal SCI/ }));
    expect(seen.at(-1)).toMatchObject({ audience: 'organizations', organizations: ['ncs'] });
    expect(
      screen.getByText(/Private: nobody else sees it, in the app or from its link/),
    ).toBeInTheDocument();
  });

  it('lets an org admin of several choose whose members', async () => {
    chats.threads = [];
    const seen: AudienceChoice[] = [];
    render(
      <Harness
        start={CLUB_AUDIENCE}
        organizations={[...NCS, { id: 'sf', name: 'SF Adaptive' }]}
        seen={seen}
      />,
    );
    await userEvent.click(screen.getByRole('radio', { name: /Members of an organization/ }));
    expect(screen.getByText('Choose at least one organization.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'NorCal SCI' }));
    await userEvent.click(screen.getByRole('button', { name: 'SF Adaptive' }));
    expect(seen.at(-1)?.organizations).toEqual(['ncs', 'sf']);
  });

  it('invites people one by one', async () => {
    chats.threads = [];
    const seen: AudienceChoice[] = [];
    render(<Harness start={CLUB_AUDIENCE} seen={seen} />);
    await userEvent.click(screen.getByRole('radio', { name: /Invite only/ }));
    await userEvent.type(screen.getByLabelText('Who is invited'), 'dee');
    await userEvent.click(await screen.findByRole('button', { name: /Dee Lopez/ }));
    expect(seen.at(-1)?.people.map((p) => p.id)).toEqual(['dee']);
    expect(screen.getByText('1 invited. Add as many as you like.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Dee Lopez' }));
    expect(seen.at(-1)?.people).toEqual([]);
  });

  it('chooses groups with a button each while there are few', async () => {
    chats.threads = [group(1), group(2), { id: 'dm', kind: 'direct', name: null }];
    const seen: AudienceChoice[] = [];
    render(<Harness start={{ ...CLUB_AUDIENCE, audience: 'groups' }} seen={seen} />);
    const buttons = within(screen.getByRole('group', { name: 'Groups' })).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Group 1', 'Group 2']);
    await userEvent.click(screen.getByRole('button', { name: 'Group 2' }));
    expect(seen.at(-1)?.groups).toEqual(['g2']);
    expect(screen.getByRole('button', { name: 'Group 2' })).toHaveAttribute('aria-pressed', 'true');
  });

  // The owner: with a lot of groups, a drop-down rather than buttons.
  it('chooses from a list once there are many, showing what is chosen above it', async () => {
    chats.threads = Array.from({ length: GROUP_BUTTONS_MAX + 2 }, (_, i) => group(i + 1));
    const seen: AudienceChoice[] = [];
    render(<Harness start={{ ...CLUB_AUDIENCE, audience: 'groups' }} seen={seen} />);
    expect(screen.queryByRole('group', { name: 'Groups' })).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText('Add a group'), 'g3');
    expect(seen.at(-1)?.groups).toEqual(['g3']);
    expect(screen.getByRole('button', { name: 'Take Group 3 off' })).toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Add a group')).queryByRole('option', { name: 'Group 3' }),
    ).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Take Group 3 off' }));
    expect(seen.at(-1)?.groups).toEqual([]);
  });

  it('needs a group before a groups event can be saved', () => {
    expect(audienceReady({ ...CLUB_AUDIENCE, audience: 'groups' })).toBe(false);
    expect(audienceReady({ ...CLUB_AUDIENCE, audience: 'groups', groups: ['g1'] })).toBe(true);
    expect(audienceReady(CLUB_AUDIENCE)).toBe(true);
    expect(audienceReady({ ...CLUB_AUDIENCE, audience: 'organizations' })).toBe(false);
    expect(audienceReady({ ...CLUB_AUDIENCE, audience: 'people' })).toBe(false);
    expect(
      audienceReady({
        ...CLUB_AUDIENCE,
        audience: 'people',
        people: [
          { id: 'dee', displayName: 'Dee', username: 'dee', photoPath: null, photoAlt: null },
        ],
      }),
    ).toBe(true);
  });
});
