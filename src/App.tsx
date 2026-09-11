import { Navigate, Route, Routes } from 'react-router-dom';
import { AppNav } from '@/components/app-nav';
import ChatPage from '@/routes/chat/page';
import DevLoginPage from '@/routes/dev-login/page';
import EventsPage from '@/routes/events/page';
import HomePage from '@/routes/home/page';
import MePage from '@/routes/me/page';
import PeersPage from '@/routes/peers/page';

/**
 * The signed-in shell: one scrolling surface above a fixed five-tab bar.
 *
 * Onboarding and the profile survey will render outside this shell — they have
 * their own footers and no tab bar — so they are siblings of the shell route
 * rather than children of it.
 */
function AppShell() {
  return (
    <div className="mx-auto flex h-dvh w-full max-w-[480px] flex-col bg-canvas">
      <Routes>
        <Route path="/home" element={<HomePage />} />
        <Route path="/peers" element={<PeersPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/me" element={<MePage />} />
      </Routes>
      <AppNav />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/home" replace />} />
      {/* Outside the shell: no tab bar, and unlisted. See the file header. */}
      <Route path="/dev-login" element={<DevLoginPage />} />
      <Route path="/*" element={<AppShell />} />
    </Routes>
  );
}
