import { Navigate, Route, Routes } from 'react-router-dom';
import { AppNav } from '@/components/app-nav';
import { RequireMember } from '@/components/require-member';
import { AccessibilityProvider } from '@/lib/accessibility';
import AdminPage from '@/routes/admin/page';
import ChatPage from '@/routes/chat/page';
import DevLoginPage from '@/routes/dev-login/page';
import EventDetailPage from '@/routes/events/event-detail';
import OrganizationDetailPage from '@/routes/events/organization-detail';
import EventsPage from '@/routes/events/page';
import HomePage from '@/routes/home/page';
import MePage from '@/routes/me/page';
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
  // Widened on large screens rather than left as a 480px ribbon on a 27-inch
  // monitor — the deck grids into the extra width.
  return (
    <div
      data-ui-scale-root
      className="mx-auto flex h-dvh w-full max-w-[480px] flex-col bg-canvas lg:max-w-[1180px]"
    >
      <Routes>
        <Route path="/home" element={<HomePage />} />
        <Route path="/peers" element={<PeersPage />} />
        <Route path="/peers/:id" element={<MemberDetailPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/events/:id" element={<EventDetailPage />} />
        <Route path="/events/organizations/:id" element={<OrganizationDetailPage />} />
        <Route path="/me" element={<MePage />} />
        {/* Unlisted in the tab bar; the page redirects a non-admin away. */}
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
      <AppNav />
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
      <Route path="/" element={<Navigate to="/home" replace />} />
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
