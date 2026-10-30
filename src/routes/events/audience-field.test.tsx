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

const { AudienceField, audienceReady, GROUP_BUTTONS_MAX } = await import(
  '@/routes/events/audience-field'
);

const group = (n: number): Partial<ChatThread> => ({
  id: `g${n}`,
  kind: 'group',
  name: `Group ${n}`,
});

function Harness({
  start,
  organizationName = 'NorCal SCI',
  seen,
}: {
  start: AudienceChoice;
  organizationName?: string | null;
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
      organizationName={organizationName}
      labelClassName=""
      hintClassName=""
    />
  );
}

describe('Who in the club sees it', () => {
  // The link is for every event (the owner, 2026-10-29), so not a choice.
  it('offers the three, naming the organization whose followers', () => {
    chats.threads = [];
    render(<Harness start={{ audience: 'club', groups: [] }} seen={[]} />);
    expect(screen.getByRole('group', { name: 'Who in the club sees it' })).toBeInTheDocument();
    const options = screen.getAllByRole('radio').map((r) => r.closest('label')?.textContent);
    expect(options).toHaveLength(3);
    expect(options[0]).toContain('Everyone in the club');
    expect(options[1]).toContain('Members of NorCal SCI');
    expect(options[2]).toContain('Chosen groups');
    expect(screen.queryByText(/Anyone with the link/)).toBeNull();
    expect(screen.getByText(/Anyone you send its link to can open it/)).toBeInTheDocument();
  });

  it('has no followers to offer when no organization hosts it', () => {
    chats.threads = [];
    render(<Harness start={{ audience: 'club', groups: [] }} organizationName={null} seen={[]} />);
    expect(screen.queryByText(/Its members/)).toBeNull();
  });

  it('chooses groups with a button each while there are few', async () => {
    chats.threads = [group(1), group(2), { id: 'dm', kind: 'direct', name: null }];
    const seen: AudienceChoice[] = [];
    render(<Harness start={{ audience: 'groups', groups: [] }} seen={seen} />);
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
    render(<Harness start={{ audience: 'groups', groups: [] }} seen={seen} />);
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
    expect(audienceReady({ audience: 'groups', groups: [] })).toBe(false);
    expect(audienceReady({ audience: 'groups', groups: ['g1'] })).toBe(true);
    expect(audienceReady({ audience: 'club', groups: [] })).toBe(true);
  });
});
