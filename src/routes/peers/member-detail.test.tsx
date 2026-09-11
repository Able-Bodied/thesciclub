import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemberState } from '@/lib/members';
import { makeMember } from '@/test/factory';

const state = vi.hoisted(() => ({ current: null as MemberState | null }));
vi.mock('@/lib/members', () => ({
  useBrowseMember: () => state.current,
}));

const { default: MemberDetailPage } = await import('@/routes/peers/member-detail');

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
