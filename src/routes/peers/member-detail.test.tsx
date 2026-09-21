import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const { default: MemberDetailPage, childrenLabel } = await import('@/routes/peers/member-detail');

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
    expect(screen.getByText('Peer mentor')).toBeInTheDocument();
  });

  it('omits a section entirely when there is nothing in it', () => {
    state.current = ok(makeMember({ topics: [], interests: [], selfCare: [], bio: null }));
    renderDetail();
    expect(screen.queryByText('Happy to talk about')).not.toBeInTheDocument();
    expect(screen.queryByText('Interests')).not.toBeInTheDocument();
    expect(screen.queryByText('Uses day to day')).not.toBeInTheDocument();
    expect(screen.queryByText('Function & living situation')).not.toBeInTheDocument();
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

  // The panel at the foot says the club never shows a phone number, an address
  // or an email. This button is what makes that a promise rather than a limit.
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

  it('promises no contact details to everybody, seeded or not', () => {
    state.current = ok(makeMember({ isSeed: false }));
    renderDetail();
    expect(screen.getByText(/never shows a phone number/)).toBeInTheDocument();
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

describe('the official account profile', () => {
  it('explains what the account is instead of showing empty member sections', () => {
    state.current = ok(makeMember({ displayName: 'admin', isAdmin: true }));
    renderDetail();
    expect(screen.getByText('What this account is')).toBeInTheDocument();
    expect(screen.queryByText('Details')).not.toBeInTheDocument();
    expect(screen.queryByText('Happy to talk about')).not.toBeInTheDocument();
  });

  // It said "messaging is not switched on yet" until Chat was built. Leaving
  // that up beside a working Chat tab would have been the more confusing lie.
  it('offers the same Message button every other profile has', () => {
    state.current = ok(makeMember({ isAdmin: true }));
    renderDetail();
    expect(screen.getByRole('button', { name: 'Message the club' })).toBeInTheDocument();
    expect(screen.queryByText(/not switched on/)).not.toBeInTheDocument();
  });

  it('repeats the rule that membership can be lost', () => {
    state.current = ok(makeMember({ isAdmin: true }));
    renderDetail();
    expect(screen.getByText(/Membership can be lost/)).toBeInTheDocument();
  });

  it('carries the club mark and the official badge', () => {
    state.current = ok(makeMember({ isAdmin: true }));
    renderDetail();
    // Two marks: the big one and the small one in the wordmark.
    expect(screen.getAllByRole('img', { name: 'The SCI Club' }).length).toBeGreaterThan(0);
    expect(screen.getByText('Official account')).toBeInTheDocument();
  });

  it('says what to bring to the account rather than leaving it abstract', () => {
    state.current = ok(makeMember({ isAdmin: true }));
    renderDetail();
    expect(screen.getByText('Invites')).toBeInTheDocument();
    expect(screen.getByText('The house rules')).toBeInTheDocument();
    expect(screen.getByText(/Reports come here and are read by a person/)).toBeInTheDocument();
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
