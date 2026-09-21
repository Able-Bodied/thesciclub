import { Navigate, Route, Routes } from 'react-router-dom';
import { AppNav } from '@/components/app-nav';
import { RequireMember } from '@/components/require-member';
import { AccessibilityProvider } from '@/lib/accessibility';
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
import HomePage from '@/routes/home/page';
import InvitesPage from '@/routes/invites/page';
import MePage from '@/routes/me/page';
import NotFoundPage from '@/routes/not-found/page';
import OnboardingPage from '@/routes/onboarding/page';
import MemberDetailPage from '@/routes/peers/member-detail';
import PeersPage from '@/routes/peers/page';
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
    <div className="mx-auto flex h-dvh w-full max-w-[480px] flex-col bg-canvas md:max-w-[1180px]">
      {/* First in the DOM, painted last on a phone and first on a desktop —
          see the ordering note in app-nav.tsx. */}
      <AppNav />
      <Routes>
        <Route path="/home" element={<HomePage />} />
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
    </div>
  );
}

export default function App() {
  return (
    <AccessibilityProvider>
      <AppRoutes />
    </AccessibilityProvider>
  );
}

function AppRoutes() {
  return (
    <Routes>
      {/* Peers, not Home. Home is a placeholder that says so in words
          (CONTEXT.md), so landing there opened the app on a page whose
          own copy points at the working surfaces. Peers is the one the club
          exists for, and it has content from the first sign-in. */}
      <Route path="/" element={<Navigate to="/peers" replace />} />
      {/* Outside the shell: no tab bar, and unlisted. See the file header. */}
      {/* Outside the shell: onboarding has its own footer and no tab bar. */}
      <Route path="/join" element={<OnboardingPage />} />
      {/* Outside the shell: its own footer, no tab bar. */}
      <Route path="/profile" element={<ProfileSurveyPage />} />
      <Route path="/profile/details" element={<ProfileDetailsPage />} />
      <Route path="/dev-login" element={<DevLoginPage />} />
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
