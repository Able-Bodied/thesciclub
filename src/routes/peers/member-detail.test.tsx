import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Blocks from '@/lib/blocks';
import type * as Reports from '@/lib/chat/reports';
import type { MemberState } from '@/lib/members';
import { makeMember } from '@/test/factory';

const state = vi.hoisted(() => ({ current: null as MemberState | null }));
vi.mock('@/lib/members', () => ({
  useBrowseMember: () => state.current,
}));

// Somebody is always signed in here. The Message button is not drawn without a
// viewer — and not drawn on the viewer's own card, which is its own test below.
vi.mock('@/lib/account', () => ({
  useAccount: () => ({ status: 'member', userId: 'me', isAdmin: false, displayName: 'Alex' }),
}));

// Stubbed, and it has to be: `.env.local` points at the hosted project, so an
// unmocked read in a test talks to production. `roomsForTopics` is deliberately
// not stubbed — the mapping on screen is the real one, and its own tests are in
// src/routes/chat/room-map.test.ts.
const chatRooms = vi.hoisted(() => ({ rooms: [] as unknown[] }));
vi.mock('@/lib/chat/rooms', () => ({
  useChatRooms: () => ({
    rooms: chatRooms.rooms,
    loading: false,
    error: null,
    reload: () => undefined,
  }),
}));

// Blocks: the viewer's list, and the two writes, which are network calls.
const blocks = vi.hoisted(() => ({
  ids: new Set<string>(),
  reload: vi.fn(),
  block: vi.fn(),
  unblock: vi.fn(),
}));
vi.mock('@/lib/blocks', async (importOriginal) => ({
  ...(await importOriginal<typeof Blocks>()),
  useMyBlocks: () => ({
    blocked: [...blocks.ids].map((memberId) => ({ memberId, blockedAt: '2026-10-21' })),
    ids: blocks.ids,
    loading: false,
    error: null,
    reload: blocks.reload,
  }),
  blockMember: blocks.block,
  unblockMember: blocks.unblock,
}));
// Reports: what the viewer has reported, and the write, which is a network call.
const reports = vi.hoisted(() => ({
  memberIds: new Set<string>(),
  reload: vi.fn(),
  send: vi.fn(),
  announce: vi.fn(),
}));
vi.mock('@/lib/chat/reports', async (importOriginal) => ({
  ...(await importOriginal<typeof Reports>()),
  useMyReports: () => ({
    postIds: new Set<string>(),
    messageIds: new Set<string>(),
    memberIds: reports.memberIds,
    loading: false,
    error: null,
    reload: reports.reload,
  }),
  reportMember: reports.send,
}));
vi.mock('@/lib/announce', () => ({ useAnnounce: () => reports.announce }));
vi.mock('@/lib/chat/authors', () => ({
  useChatAuthors: () => new Map([['abc', { id: 'abc', displayName: 'Nicole' }]]),
}));

// A signed URL for any stored photograph: signing is a storage call.
vi.mock('@/lib/photos', () => ({
  usePhotoUrl: (path: string | null | undefined) => (path ? `https://signed/${path}` : null),
}));

function room(id: string, name: string, openedAt: string | null) {
  return {
    id,
    name,
    description: `What ${name} is for.`,
    category: 'Body' as const,
    icon: '◍',
    sortOrder: 1,
    openedAt,
  };
}

const {
  default: MemberDetailPage,
  backFrom,
  childrenLabel,
} = await import('@/routes/peers/member-detail');

const ok = (member: ReturnType<typeof makeMember>): MemberState => ({
  member,
  loading: false,
  error: null,
  signedOut: false,
  notFound: false,
});

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/peers/abc']}>
      <Routes>
        <Route path="/peers/:id" element={<MemberDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.current = ok(makeMember({ displayName: 'Nicole' }));
  chatRooms.rooms = [];
  blocks.ids = new Set();
  blocks.reload.mockReset();
  blocks.block.mockReset().mockResolvedValue({ ok: true, value: null });
  blocks.unblock.mockReset().mockResolvedValue({ ok: true, value: null });
  reports.memberIds = new Set();
  reports.reload.mockReset();
  reports.send.mockReset().mockResolvedValue({ ok: true, value: null });
  reports.announce.mockReset();
});

describe('reporting from a profile', () => {
  async function openMenu(user: ReturnType<typeof userEvent.setup>) {
    state.current = ok(makeMember({ id: 'abc', displayName: 'Nicole' }));
    renderDetail();
    await user.click(screen.getByRole('button', { name: 'Actions for Nicole' }));
  }

  it('puts Report in the menu before Block', async () => {
    const user = userEvent.setup();
    await openMenu(user);
    const names = within(screen.getByRole('dialog', { name: 'Actions for Nicole' }))
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(names.indexOf('Report Nicole')).toBeGreaterThanOrEqual(0);
    expect(names.indexOf('Report Nicole')).toBeLessThan(names.indexOf('Block Nicole'));
  });

  it('says what goes, asks for an optional note, and sends it', async () => {
    const user = userEvent.setup();
    await openMenu(user);
    await user.click(screen.getByRole('button', { name: 'Report Nicole' }));
    const dialog = screen.getByRole('dialog', { name: 'Report this member' });
    expect(dialog).toHaveTextContent('The member is not told.');
    expect(dialog).toHaveTextContent('Changing the profile later does not remove them.');
    expect(reports.send).not.toHaveBeenCalled();
    await user.type(screen.getByRole('textbox'), '  Rude bio ');
    await user.click(screen.getByRole('button', { name: 'Send report' }));
    expect(reports.send).toHaveBeenCalledWith('abc', 'Rude bio');
    expect(reports.reload).toHaveBeenCalled();
    expect(reports.announce).toHaveBeenCalledWith('You reported Nicole. They have not been told.');
    expect(screen.queryByRole('dialog', { name: 'Report this member' })).not.toBeInTheDocument();
  });

  it('puts focus back on the ••• when the sheet closes', async () => {
    const user = userEvent.setup();
    await openMenu(user);
    await user.click(screen.getByRole('button', { name: 'Report Nicole' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Actions for Nicole' })).toHaveFocus();
    expect(reports.send).not.toHaveBeenCalled();
    expect(reports.announce).not.toHaveBeenCalled();
  });

  it('stays open with the reason and the words when it fails', async () => {
    const user = userEvent.setup();
    reports.send.mockResolvedValue({ ok: false, error: 'Your report was not sent.' });
    await openMenu(user);
    await user.click(screen.getByRole('button', { name: 'Report Nicole' }));
    await user.type(screen.getByRole('textbox'), 'Rude bio');
    await user.click(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your report was not sent.');
    expect(screen.getByRole('textbox')).toHaveValue('Rude bio');
    expect(reports.announce).not.toHaveBeenCalled();
  });

  it('says "You reported" instead of offering it again', async () => {
    const user = userEvent.setup();
    reports.memberIds = new Set(['abc']);
    await openMenu(user);
    expect(screen.queryByRole('button', { name: 'Report Nicole' })).not.toBeInTheDocument();
    expect(screen.getByText('You reported Nicole')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Block Nicole' })).toBeInTheDocument();
  });

  it('is not offered on your own profile', () => {
    state.current = ok(makeMember({ id: 'me', displayName: 'Alex' }));
    renderDetail();
    expect(screen.queryByRole('button', { name: /Report/ })).not.toBeInTheDocument();
  });

  it('is not offered for a member who is not there', () => {
    state.current = { ...ok(makeMember()), member: null, notFound: true };
    renderDetail();
    expect(screen.queryByRole('button', { name: /Actions for|Report/ })).not.toBeInTheDocument();
  });

  it('is not on a blocked member’s page, which has only Unblock', async () => {
    const user = userEvent.setup();
    blocks.ids = new Set(['abc']);
    renderDetail();
    await user.click(screen.getByRole('button', { name: 'Actions for Nicole' }));
    expect(screen.queryByRole('button', { name: /Report/ })).not.toBeInTheDocument();
  });
});

describe('blocking from a profile', () => {
  it('asks first, says what blocking does, then blocks', async () => {
    const user = userEvent.setup();
    state.current = ok(makeMember({ id: 'abc', displayName: 'Nicole' }));
    renderDetail();
    await user.click(screen.getByRole('button', { name: 'Actions for Nicole' }));
    await user.click(screen.getByRole('button', { name: 'Block Nicole' }));
    const dialog = screen.getByRole('dialog', { name: 'Block Nicole?' });
    expect(dialog).toHaveTextContent('Nicole is not told.');
    expect(dialog).toHaveTextContent('Neither of you can message the other');
    expect(blocks.block).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Block Nicole' }));
    expect(blocks.block).toHaveBeenCalledWith('abc');
    expect(blocks.reload).toHaveBeenCalled();
  });

  it('keeps the dialog open with the reason when it fails', async () => {
    const user = userEvent.setup();
    blocks.block.mockResolvedValue({ ok: false, error: 'They were not blocked.' });
    state.current = ok(makeMember({ id: 'abc', displayName: 'Nicole' }));
    renderDetail();
    await user.click(screen.getByRole('button', { name: 'Actions for Nicole' }));
    await user.click(screen.getByRole('button', { name: 'Block Nicole' }));
    await user.click(screen.getByRole('button', { name: 'Block Nicole' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('They were not blocked.');
    expect(blocks.reload).not.toHaveBeenCalled();
  });

  it('is not offered on your own profile', () => {
    state.current = ok(makeMember({ id: 'me', displayName: 'Alex' }));
    renderDetail();
    expect(screen.queryByRole('button', { name: /^Actions for/ })).not.toBeInTheDocument();
  });

  it('shows a member you blocked as blocked, with Unblock', async () => {
    const user = userEvent.setup();
    blocks.ids = new Set(['abc']);
    renderDetail();
    expect(screen.getByRole('heading', { name: 'Nicole' })).toBeInTheDocument();
    expect(screen.getByText(/You blocked Nicole/)).toBeInTheDocument();
    expect(screen.queryByText('@nicole.s')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Unblock Nicole' }));
    expect(blocks.unblock).toHaveBeenCalledWith('abc');
    expect(blocks.reload).toHaveBeenCalled();
  });
});

describe('the @username', () => {
  it('is under the name on a profile', () => {
    state.current = ok(makeMember({ displayName: 'Nicole', username: 'nicole.s' }));
    renderDetail();
    expect(screen.getByText('@nicole.s')).toBeInTheDocument();
  });

  it('is left out for a member who has none, rather than drawing a bare @', () => {
    state.current = ok(makeMember({ displayName: 'Nicole', username: null }));
    renderDetail();
    expect(screen.queryByText(/^@/)).not.toBeInTheDocument();
  });
});

describe('backFrom', () => {
  // The button goes back through history either way; the label is what can
  // be wrong.
  it('names the screen the profile was opened from', () => {
    expect(backFrom({ from: 'me' })).toBe('Me');
    expect(backFrom({ from: 'home', segment: 'people' })).toBe('Home');
    expect(backFrom(null)).toBe('Peers');
    expect(backFrom({ segment: 'upcoming', view: 'map' })).toBe('Events');
    expect(backFrom({ from: 'peers-map' })).toBe('Peers');
  });
});

describe('childrenLabel', () => {
  it('says when somebody became a parent', () => {
    // The point of the row: raising a child you already had and learning to
    // parent from a chair from the start draw different questions.
    expect(childrenLabel(true, 'Before')).toBe('Yes — before the injury');
    expect(childrenLabel(true, 'After')).toBe('Yes — since the injury');
    expect(childrenLabel(true, 'Both')).toBe('Yes — before and since the injury');
  });

  it('still says yes when they did not answer the follow-up', () => {
    expect(childrenLabel(true, null)).toBe('Yes');
  });

  it('publishes nothing for a no, or for an unanswered question', () => {
    // Nobody answering a yes/no about their family asked for the negative to
    // be put on their profile.
    expect(childrenLabel(false, null)).toBeNull();
    expect(childrenLabel(null, null)).toBeNull();
  });
});

describe('MemberDetailPage', () => {
  it('shows the name and the summary line', () => {
    state.current = ok(
      makeMember({
        displayName: 'Nicole',
        exactLevel: 'C6',
        completeness: 'Incomplete',
        age: 28,
        city: 'Santa Clara',
      }),
    );
    renderDetail();
    expect(screen.getByRole('heading', { name: 'Nicole' })).toBeInTheDocument();
    expect(screen.getByText('C6 incomplete · 28 · Santa Clara')).toBeInTheDocument();
  });

  it('flags a mentor', () => {
    state.current = ok(makeMember({ type: 'mentor' }));
    renderDetail();
    expect(screen.getByText('Mentor')).toBeInTheDocument();
  });

  // The owner, 2026-10-28: badged by the organization that made them one.
  it('says which organization a mentor is a mentor of, from one pill', async () => {
    const user = userEvent.setup();
    state.current = ok(
      makeMember({
        type: 'mentor',
        mentorOrganizations: [{ id: 'ncs', name: 'NorCal SCI', shortCode: 'NCS', logoPath: null }],
      }),
    );
    renderDetail();
    const pill = screen.getByRole('button', { name: 'Mentor, NorCal SCI' });
    expect(pill).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: 'Mentor for' })).toBeNull();
    await user.click(pill);
    expect(pill).toHaveAttribute('aria-expanded', 'true');
    const list = screen.getByRole('region', { name: 'Mentor for' });
    expect(within(list).getByRole('link', { name: 'NorCal SCI' })).toHaveAttribute(
      'href',
      '/events/organizations/ncs',
    );
    await user.click(pill);
    expect(screen.queryByRole('region', { name: 'Mentor for' })).toBeNull();
  });

  // The owner, 2026-10-28: the club is an organization like any other.
  it('lists every organization a mentor is for, The SCI Club included', async () => {
    const user = userEvent.setup();
    state.current = ok(
      makeMember({
        type: 'mentor',
        mentorOrganizations: [
          { id: 'ncs', name: 'NorCal SCI', shortCode: 'NCS', logoPath: null },
          { id: 'the-club', name: 'The SCI Club', shortCode: 'TSC', logoPath: null },
        ],
      }),
    );
    renderDetail();
    await user.click(screen.getByRole('button', { name: 'Mentor, NorCal SCI and The SCI Club' }));
    const list = screen.getByRole('region', { name: 'Mentor for' });
    expect(
      within(list)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['NCSNorCal SCI', 'TSCThe SCI Club']);
  });

  it('omits a section entirely when there is nothing in it', () => {
    state.current = ok(makeMember({ topics: [], interests: [], selfCare: [], bio: null }));
    renderDetail();
    expect(screen.queryByText('Happy to talk about')).not.toBeInTheDocument();
    expect(screen.queryByText('Interests')).not.toBeInTheDocument();
    expect(screen.queryByText('Uses day to day')).not.toBeInTheDocument();
    expect(screen.queryByText('Bio')).not.toBeInTheDocument();
    expect(screen.queryByText('Adaptive sports equipment')).not.toBeInTheDocument();
    expect(screen.queryByText('Grants')).not.toBeInTheDocument();
  });

  it("reads in the owner's order, with equipment, grants and the specifics", () => {
    state.current = ok(
      makeMember({
        bio: 'Avid handcyclist and gardener.',
        howInjured: 'Mountain bike crash, 2016.',
        topics: ['Driving'],
        interests: ['Cycling'],
        selfCare: ['Dictation software'],
        detail: 'Dragon on a Surface.',
        sportsEquipment: 'Top End Force 3 handcycle',
        grants: 'High Fives, for the handcycle.',
      }),
    );
    renderDetail();
    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent)
      .filter((t) =>
        [
          'Bio',
          'How it happened',
          'Happy to talk about',
          'Interests',
          'Uses day to day',
          'Adaptive sports equipment',
          'Grants',
          'Details',
        ].includes(t),
      );
    expect(headings).toEqual([
      'Bio',
      'How it happened',
      'Happy to talk about',
      'Interests',
      'Uses day to day',
      'Adaptive sports equipment',
      'Grants',
      'Details',
    ]);
    expect(screen.getByText('Top End Force 3 handcycle')).toBeInTheDocument();
    expect(screen.getByText('High Fives, for the handcycle.')).toBeInTheDocument();
    expect(screen.getByText('Dragon on a Surface.')).toBeInTheDocument();
  });

  it('shows the sections that do have content', () => {
    state.current = ok(
      makeMember({ topics: ['Driving'], selfCare: ['Suprapubic catheter'], bio: 'Manual chair.' }),
    );
    renderDetail();
    expect(screen.getByText('Driving')).toBeInTheDocument();
    expect(screen.getByText('Suprapubic catheter')).toBeInTheDocument();
    expect(screen.getByText('Manual chair.')).toBeInTheDocument();
  });

  it('says nothing about time since injury when no date was recorded', () => {
    state.current = ok(makeMember({ injuryDate: null, injuryDatePrecision: null }));
    renderDetail();
    expect(screen.queryByText(/post-injury/)).not.toBeInTheDocument();
  });

  it('states time since injury at the precision given, when there is one', () => {
    state.current = ok(makeMember({ injuryDate: '2013-01-01', injuryDatePrecision: 'year' }));
    renderDetail();
    expect(screen.getByText(/injured 2013/)).toBeInTheDocument();
  });

  it('shows only the detail rows that have values', () => {
    state.current = ok(
      makeMember({
        independence: 'Completely independent',
        employment: null,
        fieldOfWork: null,
        education: null,
        languages: [],
      }),
    );
    renderDetail();
    expect(screen.getByText('Independence')).toBeInTheDocument();
    // A row with nothing in it is skipped rather than rendered blank.
    expect(screen.queryByText('Work')).not.toBeInTheDocument();
    expect(screen.queryByText('Field')).not.toBeInTheDocument();
    expect(screen.queryByText('Languages')).not.toBeInTheDocument();
  });

  it('credits the directory only for members who came from it', () => {
    state.current = ok(makeMember({ displayName: 'Todd', isSeed: true }));
    renderDetail();
    expect(
      screen.getByText(/chose to publish in the NorCal SCI mentor directory/),
    ).toBeInTheDocument();
  });

  it('does not tell somebody who just signed up that they published a directory profile', () => {
    state.current = ok(makeMember({ displayName: 'Alfred', isSeed: false }));
    renderDetail();
    expect(screen.queryByText(/NorCal SCI mentor directory/)).not.toBeInTheDocument();
  });

  it('offers a message as the one action on somebody else’s card', () => {
    state.current = ok(makeMember({ id: 'jan', displayName: 'Jan' }));
    renderDetail();
    expect(screen.getByRole('button', { name: 'Message Jan' })).toBeInTheDocument();
  });

  it('does not offer a conversation with yourself', () => {
    // Me links here, so a member reaches their own card. chat_open_direct
    // refuses a conversation with yourself in a sentence, and a button whose
    // only outcome is that sentence should not be on the screen.
    state.current = ok(makeMember({ id: 'me', displayName: 'Alex' }));
    renderDetail();
    expect(screen.queryByRole('button', { name: /^Message/ })).not.toBeInTheDocument();
  });

  // The notice about contact details was removed (2026-10-10). For a member
  // who joined, that left an empty box, so there is no box either.
  it('says nothing about contact details, and draws no empty notice box', () => {
    state.current = ok(makeMember({ isSeed: false }));
    const { container } = renderDetail();
    expect(screen.queryByText(/never shows a phone number/)).toBeNull();
    expect(container.querySelector('.border-gold.bg-gold-lt')).toBeNull();
  });

  it('keeps only the directory provenance sentence on a seeded row', () => {
    state.current = ok(makeMember({ displayName: 'Todd', isSeed: true }));
    const { container } = renderDetail();
    expect(screen.queryByText(/never shows a phone number/)).toBeNull();
    const box = container.querySelector('.border-gold.bg-gold-lt');
    expect(box).not.toBeNull();
    expect(box).toHaveTextContent(/Todd chose to publish in the NorCal SCI mentor directory\.$/);
  });

  it('tells a signed-out visitor the club is members only', () => {
    state.current = { member: null, loading: false, error: null, signedOut: true, notFound: false };
    renderDetail();
    expect(screen.getByText(/members only/i)).toBeInTheDocument();
  });

  it('treats a missing member as missing, not as an error', () => {
    state.current = { member: null, loading: false, error: null, signedOut: false, notFound: true };
    renderDetail();
    expect(screen.getByText(/not in the club/i)).toBeInTheDocument();
  });

  it('surfaces a genuine error', () => {
    state.current = {
      member: null,
      loading: false,
      error: 'network is unreachable',
      signedOut: false,
      notFound: false,
    };
    renderDetail();
    expect(screen.getByText('network is unreachable')).toBeInTheDocument();
  });
});

// The owner, 2026-10-01: an administrator's profile is their own, with an
// Admin chip. Until then it was the club's "official account" page.
describe('an administrator’s profile', () => {
  it('is their own profile, sections and all', () => {
    state.current = ok(
      makeMember({
        displayName: 'Dana',
        isAdmin: true,
        type: 'mentor',
        exactLevel: 'C6',
        completeness: 'Incomplete',
        age: 28,
        city: 'Santa Clara',
      }),
    );
    renderDetail();
    expect(screen.getByRole('heading', { name: 'Dana' })).toBeInTheDocument();
    expect(screen.getByText('C6 incomplete · 28 · Santa Clara')).toBeInTheDocument();
    expect(screen.queryByText('Official account')).not.toBeInTheDocument();
    expect(screen.queryByText('What this account is')).not.toBeInTheDocument();
  });

  it('carries an Admin chip beside Mentor', () => {
    state.current = ok(makeMember({ isAdmin: true, type: 'mentor' }));
    renderDetail();
    expect(screen.getByText('Mentor')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('does not put the chip on anybody else', () => {
    state.current = ok(makeMember({ type: 'mentor' }));
    renderDetail();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });
});

describe('the rooms a member’s topics already live in', () => {
  it('offers the room a topic points at', () => {
    chatRooms.rooms = [room('bowel', 'Bowel management', '2026-09-18T10:00:00Z')];
    state.current = ok(makeMember({ topics: ['Bowel programme'] }));
    renderDetail();
    expect(screen.getByRole('link', { name: /Continue in Bowel management/ })).toHaveAttribute(
      'href',
      '/chat/rooms/bowel',
    );
  });

  // The select policy hides a closed room from a member, so this filter is for
  // the other reader: an administrator gets all twelve and must not be offered
  // a door no member can follow them through.
  it('says nothing about a room that is not open', () => {
    chatRooms.rooms = [room('bowel', 'Bowel management', null)];
    state.current = ok(makeMember({ topics: ['Bowel programme'] }));
    renderDetail();
    expect(screen.queryByText(/Continue in/)).not.toBeInTheDocument();
  });

  // Two topics naming one room is one conversation named twice.
  it('names a room once however many topics point at it', () => {
    chatRooms.rooms = [room('bowel', 'Bowel management', '2026-09-18T10:00:00Z')];
    state.current = ok(makeMember({ topics: ['Bowel programme', 'Travelling with a colostomy'] }));
    renderDetail();
    expect(screen.getAllByRole('link', { name: /Continue in/ })).toHaveLength(1);
  });

  // No "no rooms match" sentence: the reader did not ask a question, so there
  // is nothing to answer.
  it('draws nothing at all when no topic reaches an open room', () => {
    chatRooms.rooms = [room('bowel', 'Bowel management', '2026-09-18T10:00:00Z')];
    state.current = ok(makeMember({ topics: ['Canine Companions'] }));
    renderDetail();
    expect(screen.getByText('Happy to talk about')).toBeInTheDocument();
    expect(screen.queryByText(/Continue in/)).not.toBeInTheDocument();
  });

  // The page is for reading the person; the rooms are a way on from it, and
  // at the top they took a phone's first screen.
  it('comes after what the member wrote about themselves', () => {
    chatRooms.rooms = [room('bowel', 'Bowel management', '2026-09-18T10:00:00Z')];
    state.current = ok(makeMember({ topics: ['Bowel programme'] }));
    renderDetail();
    const details = screen.getByRole('heading', { name: 'Details' });
    const link = screen.getByRole('link', { name: /Continue in Bowel management/ });
    expect(details.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // It is the second door, not a replacement for the first. Some questions are
  // for one person.
  it('does not take the place of the Message button', () => {
    chatRooms.rooms = [room('bowel', 'Bowel management', '2026-09-18T10:00:00Z')];
    state.current = ok(makeMember({ displayName: 'Nicole', topics: ['Bowel programme'] }));
    renderDetail();
    expect(screen.getByRole('button', { name: 'Message Nicole' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Continue in/ })).toBeInTheDocument();
  });
});

describe('administrator-linked organizations', () => {
  it('lists every organization they are org admin of, from one pill', async () => {
    const user = userEvent.setup();
    state.current = ok(
      makeMember({
        representedOrganizations: [
          { id: 'able-bodied', name: 'Able Bodied', shortCode: 'AB', logoPath: null },
          { id: 'other-org', name: 'Example Organization', shortCode: 'EX', logoPath: null },
        ],
        affiliations: [],
      }),
    );
    renderDetail();
    // One pill, not a chip per organization.
    expect(screen.queryByRole('link', { name: /Org admin, / })).toBeNull();
    await user.click(
      screen.getByRole('button', { name: 'Admin, Able Bodied and Example Organization' }),
    );
    const list = screen.getByRole('region', { name: 'Org admin of' });
    expect(within(list).getByRole('link', { name: 'Able Bodied' })).toHaveAttribute(
      'href',
      '/events/organizations/able-bodied',
    );
    expect(within(list).getByRole('link', { name: 'Example Organization' })).toHaveAttribute(
      'href',
      '/events/organizations/other-org',
    );
  });

  it('does not turn self-described affiliations into representative tags', () => {
    state.current = ok(makeMember({ affiliations: ['Able Bodied'], representedOrganizations: [] }));
    renderDetail();
    expect(screen.getByText('Able Bodied')).toBeInTheDocument();
    expect(screen.queryByText('Org admin, Able Bodied')).toBeNull();
  });
});

describe('the photograph', () => {
  it('opens whole, over the page, and gives focus back on close', async () => {
    const user = userEvent.setup();
    state.current = ok(makeMember({ displayName: 'Nicole', photoPath: 'u/nicole.webp' }));
    renderDetail();
    const open = screen.getByRole('button', { name: 'Open Nicole’s photograph' });
    await user.click(open);
    const viewer = screen.getByRole('dialog', { name: 'Nicole’s photograph' });
    expect(viewer).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('img', { name: 'Photograph of Nicole' })).toHaveAttribute(
      'src',
      'https://signed/u/nicole.webp',
    );
    // It zooms, as a chat photograph does, and has no other photograph to step to.
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Next photograph' })).toBeNull();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(open).toHaveFocus();
  });

  it('is named by the member’s own description when they wrote one', async () => {
    const user = userEvent.setup();
    state.current = ok(
      makeMember({
        displayName: 'Nicole',
        photoPath: 'u/nicole.webp',
        photoAlt: 'Nicole on a beach in her chair',
      }),
    );
    renderDetail();
    await user.click(screen.getByRole('button', { name: 'Open Nicole’s photograph' }));
    expect(screen.getByRole('img', { name: 'Nicole on a beach in her chair' })).toBeInTheDocument();
  });

  it('offers nothing to open when there is no photograph', () => {
    state.current = ok(makeMember({ displayName: 'Nicole', photoPath: null }));
    renderDetail();
    expect(screen.queryByRole('button', { name: /photograph/ })).toBeNull();
  });
});
