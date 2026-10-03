import { useEffect, useRef } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppNav } from '@/components/app-nav';
import { RequireMember } from '@/components/require-member';
import { AccessibilityProvider } from '@/lib/accessibility';
import { AnnounceProvider } from '@/lib/announce';
import AdminPage from '@/routes/admin/page';
import GroupMembersPage from '@/routes/chat/group-members';
import NewGroupPage from '@/routes/chat/new-group';
import NewRoomPage from '@/routes/chat/new-room';
import NewTopicPage from '@/routes/chat/new-topic';
import ChatPage from '@/routes/chat/page';
import RoomPage from '@/routes/chat/room-page';
import ThreadPage from '@/routes/chat/thread-page';
import TopicPage from '@/routes/chat/topic-page';
import DevLoginPage from '@/routes/dev-login/page';
import EventDetailPage from '@/routes/events/event-detail';
import OrganizationDetailPage from '@/routes/events/organization-detail';
import EventsPage from '@/routes/events/page';
import HomeNewPage from '@/routes/home/new';
import HomePage from '@/routes/home/page';
import InvitesPage from '@/routes/invites/page';
import PrivacyPage from '@/routes/legal/privacy';
import TermsPage from '@/routes/legal/terms';
import MePage from '@/routes/me/page';
import NotFoundPage from '@/routes/not-found/page';
import OnboardingPage from '@/routes/onboarding/page';
import MemberDetailPage from '@/routes/peers/member-detail';
import PeersPage from '@/routes/peers/page';
import ProfileAnswersPage from '@/routes/profile/answers';
import ProfileDetailsPage from '@/routes/profile/details';
import ProfileSurveyPage from '@/routes/profile/page';

/**
 * The signed-in shell: one scrolling surface above a fixed five-tab bar.
 *
 * Onboarding and the profile survey will render outside this shell — they have
 * their own footers and no tab bar — so they are siblings of the shell route
 * rather than children of it.
 */
function AppShell() {
  // Phone-width by default, because that is the design and the PWA target.
  // Widened beyond that rather than left as a 480px ribbon on a big screen —
  // the deck grids into the extra width.
  //
  // The switch is `md` (768px) and not `lg`. At `lg` every window from 480 to
  // 1023 got the ribbon: a browser that is not maximised, a laptop, or half a
  // screen showed a 480px column with ~260px of dead margin either side and the
  // tabs at the bottom, which reads as the app failing to fit rather than as a
  // phone layout. Reported as a Firefox bug; it was neither Firefox nor a bug,
  // it was this number, and both engines measured identically.
  return (
    <div className="relative mx-auto flex h-dvh w-full max-w-[480px] flex-col bg-canvas md:max-w-[1180px]">
      {/* First in the DOM, painted last on a phone and first on a desktop —
          see the ordering note in app-nav.tsx. */}
      {/* The first thing a keyboard reaches: a way past the five tabs to the
          screen. Off-screen until focused, then a navy pill at the top. */}
      <a
        href="#main"
        // Off the top of the shell until focused, then slid in. Not sr-only:
        // `not-sr-only` on focus makes it static and it became a strip that
        // pushed the screen down.
        className="-translate-y-[150%] absolute top-2 left-2 z-50 rounded-full bg-action px-4 py-2 font-bold text-[0.875rem] text-white focus:translate-y-0"
      >
        Skip to content
      </a>
      <AppNav />
      {/* The one main landmark, so a screen reader can jump past the nav to
          the screen ("main" in the rotor). A flex column the size of the slot
          the routes already filled, so nothing about the layout moves.
          Focusable so the skip link and a route change have somewhere to land. */}
      <main id="main" tabIndex={-1} className="flex min-h-0 flex-1 flex-col outline-none">
        <Routes>
          <Route path="/home" element={<HomePage />} />
          <Route path="/home/new" element={<HomeNewPage />} />
          <Route path="/peers" element={<PeersPage />} />
          <Route path="/peers/:id" element={<MemberDetailPage />} />
          <Route path="/chat" element={<ChatPage />} />
          {/* A room's slug is in the URL — /chat/rooms/bowel — which is why
            chat_rooms.id is a slug and not a uuid. /new sits above :roomId for
            a reader's sake; React Router ranks a static segment above a dynamic
            one either way, and no room can be called "new" — the seeded twelve
            are fixed and a member room's id always carries a four-character
            suffix. */}
          <Route path="/chat/rooms/new" element={<NewRoomPage />} />
          <Route path="/chat/rooms/:roomId" element={<RoomPage />} />
          <Route path="/chat/rooms/:roomId/new" element={<NewTopicPage />} />
          <Route path="/chat/rooms/:roomId/topics/:topicId" element={<TopicPage />} />
          {/* /chat/t/:threadId and not /chat/threads/:id — a conversation's URL
            is pasted and typed far more than a room's, and the thread id is a
            uuid that is long enough on its own. */}
          <Route path="/chat/t/:threadId" element={<ThreadPage />} />
          {/* Who is in a group, adding to it and leaving it. A screen rather
            than a panel on the conversation: all three are things somebody
            does once, and none of them belongs beside a composer. */}
          <Route path="/chat/t/:threadId/members" element={<GroupMembersPage />} />
          <Route path="/chat/new-group" element={<NewGroupPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/events/:id" element={<EventDetailPage />} />
          <Route path="/events/organizations/:id" element={<OrganizationDetailPage />} />
          <Route path="/me" element={<MePage />} />
          {/* Unlisted in the tab bar; the page redirects a non-mentor away.
            Reached from the Invites card on Me, which is where a member goes
            to find out what their membership lets them do. */}
          <Route path="/invites" element={<InvitesPage />} />
          {/* Unlisted in the tab bar; the page redirects a non-admin away. */}
          <Route path="/admin" element={<AdminPage />} />
          {/* Last, and inside the shell on purpose: an unknown path used to match
            the outer `/*`, reach this switch, match nothing, and leave the tab
            bar sitting over an empty page. */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AccessibilityProvider>
      {/* Above the routes, so a confirmation outlives the screen that sent
          it — see src/lib/announce.tsx. */}
      <AnnounceProvider>
        <RouteChange />
        <AppRoutes />
      </AnnounceProvider>
    </AccessibilityProvider>
  );
}

/**
 * What a page load does on its own and a route change does not: name the
 * page and put the reader at the top of it.
 *
 * Tapping Peers → Chat swaps the screen without a load, so a screen reader
 * was told nothing, the title stayed "The SCI Club" on every screen, and
 * focus stayed on the tab that was pressed. After each change the title
 * becomes the screen's h1 — "Chat · The SCI Club" — and focus moves to the
 * main landmark, from which the next Tab reaches the screen's first control
 * and a screen reader starts reading the heading. Not on the first render:
 * a page load already announces itself, and stealing focus then would take
 * it from the address bar.
 *
 * One place, keyed on the h1 every screen already has, rather than a title
 * prop on eleven pages that would drift from their headings.
 */
export function RouteChange() {
  const { pathname } = useLocation();
  // The path the last run saw. A run that sees the same path is the first
  // screen (or StrictMode's second pass over it), and does not take focus.
  const last = useRef(pathname);
  // Once per screen: the path is what changes, the heading is what is read.
  useEffect(() => {
    // The heading is not there on the first frame of most screens — the
    // account resolves, the read lands, then the h1 draws — so the title is
    // set from whatever the document holds now and again as it changes,
    // until the next screen.
    const name = () => {
      const heading = document.querySelector('main h1, h1')?.textContent.trim();
      document.title = heading ? `${heading} · The SCI Club` : 'The SCI Club';
    };
    name();
    const observer = new MutationObserver(name);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    const changed = last.current !== pathname;
    last.current = pathname;
    const frame = requestAnimationFrame(() => {
      if (changed) document.querySelector<HTMLElement>('main')?.focus();
    });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [pathname]);
  return null;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Home, since 2026-09-30 (HANDOFF.md "What Home is" decision 6). Until then this
          went to Peers, because Home was a placeholder and landing on it
          opened the app on a page whose own copy pointed elsewhere. Home is
          now the club's recent topics, photographs, events and people in one
          list, and it was released one step at a time and seen on the live
          club before it became the door. The manifest's start_url stays "/",
          so an installed app follows this line too. */}
      <Route path="/" element={<Navigate to="/home" replace />} />
      {/* Outside the shell: no tab bar, and unlisted. See the file header. */}
      {/* Outside the shell: onboarding has its own footer and no tab bar. */}
      <Route path="/join" element={<OnboardingPage />} />
      {/* Outside the shell: its own footer, no tab bar. */}
      <Route path="/profile" element={<ProfileSurveyPage />} />
      <Route path="/profile/answers" element={<ProfileAnswersPage />} />
      <Route path="/profile/details" element={<ProfileDetailsPage />} />
      <Route path="/dev-login" element={<DevLoginPage />} />
      {/* Public, with no account: somebody on the phone step reads them before
          they have one, and so do the carriers checking the text-message
          registration. See src/routes/legal/legal-page.tsx. */}
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route
        path="/*"
        element={
          <RequireMember>
            <AppShell />
          </RequireMember>
        }
      />
    </Routes>
  );
}
