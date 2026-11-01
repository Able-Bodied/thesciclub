import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { averageRating, type Review } from '@/lib/reviews';
import ReviewPage from '@/routes/reviews/review-page';
import { ReviewsSection } from '@/routes/reviews/reviews-section';

const api = vi.hoisted(() => ({
  rows: [] as object[],
  options: [] as object[],
  calls: [] as [string, Record<string, unknown>][],
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    storage: { from: () => ({}) },
    rpc: (name: string, args: Record<string, unknown>) => {
      api.calls.push([name, args]);
      const data =
        name === 'reviews_for' ? api.rows : name === 'review_options' ? api.options : null;
      return Promise.resolve({ data, error: null });
    },
  }),
}));
vi.mock('@/lib/announce', () => ({ useAnnounce: () => () => undefined }));
vi.mock('@/lib/photos', () => ({ PHOTOS_BUCKET: 'photos', usePhotoUrl: () => null }));

const row = (over: object = {}) => ({
  id: 'r1',
  event_id: 'e1',
  event_title: 'Climbing',
  organization_name: 'NorCal SCI',
  rating: 4,
  body: 'Great ramps',
  photos: [],
  anonymous: false,
  only_organization: false,
  author_id: 'm1',
  author_name: 'Maya Ruiz',
  author_has_profile: true,
  author_photo: null,
  org_reply: null,
  created_at: '2026-10-30T12:00:00Z',
  mine: false,
  can_reply: false,
  ...over,
});
const offered = (over: object = {}) => ({
  can_review: true,
  title: 'Climbing',
  organization_name: 'NorCal SCI',
  anonymous_allowed: true,
  ...over,
});

beforeEach(() => {
  api.rows = [];
  api.options = [offered({ can_review: false })];
  api.calls = [];
});

function section() {
  render(
    <MemoryRouter>
      <ReviewsSection target={{ kind: 'event', id: 'e1' }} />
    </MemoryRouter>,
  );
}

function form() {
  render(
    <MemoryRouter initialEntries={['/events/e1/review']}>
      <Routes>
        <Route path="/events/:id/review" element={<ReviewPage kind="event" />} />
        <Route path="/events/:id" element={<p>The event</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('the average', () => {
  it('leaves out what only the organization reads', () => {
    const reviews = [
      { rating: 5, onlyOrganization: false },
      { rating: 4, onlyOrganization: false },
      { rating: 1, onlyOrganization: true },
    ] as Review[];
    expect(averageRating(reviews)).toEqual({ average: 4.5, count: 2 });
  });
});

describe('reviews on a page', () => {
  it('draws nothing with nothing to read and nothing to do', async () => {
    section();
    await Promise.resolve();
    expect(screen.queryByRole('heading', { name: 'Reviews' })).toBeNull();
  });

  it('never names an anonymous author', async () => {
    api.rows = [row({ anonymous: true, author_id: null, author_name: null })];
    section();
    expect(await screen.findByText('Anonymous member')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Maya/ })).toBeNull();
  });

  it('says which date a review from another of the series is of', async () => {
    api.rows = [row({ event_id: 'e0', event_title: 'Climbing, last month' })];
    section();
    expect(await screen.findByText(/Climbing, last month/)).toBeInTheDocument();
  });

  it('lets an org admin reply, and anybody report', async () => {
    api.rows = [row({ can_reply: true })];
    section();
    await userEvent.click(await screen.findByRole('button', { name: 'Reply' }));
    await userEvent.type(screen.getByLabelText(/Reply from NorCal SCI/), 'Thank you');
    await userEvent.click(screen.getByRole('button', { name: 'Save reply' }));
    expect(api.calls).toContainEqual(['reply_to_review', { p_review: 'r1', p_reply: 'Thank you' }]);
    await userEvent.click(screen.getByRole('button', { name: 'Report' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }));
    expect(api.calls).toContainEqual(['report_review', { p_review: 'r1', p_note: '' }]);
  });
});

describe('writing a review', () => {
  it('turns away somebody who did not check in', async () => {
    form();
    expect(await screen.findByText(/people who checked in/)).toBeInTheDocument();
  });

  it('needs stars, and sends the choices', async () => {
    api.options = [offered()];
    form();
    const post = await screen.findByRole('button', { name: 'Post your review' });
    expect(post).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: '4 stars' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Post anonymously/ }));
    await userEvent.click(post);
    expect(await screen.findByText('The event')).toBeInTheDocument();
    expect(api.calls).toContainEqual([
      'save_review',
      {
        p_event: 'e1',
        p_organization: null,
        p_rating: 4,
        p_body: '',
        p_anonymous: true,
        p_only_organization: false,
        p_photos: [],
      },
    ]);
  });

  it('offers no anonymity where the organization turned it off', async () => {
    api.options = [offered({ anonymous_allowed: false })];
    form();
    expect(await screen.findByText(/does not take anonymous reviews/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Post anonymously/ })).toBeNull();
  });

  it('has no "only for" without an organization', async () => {
    api.options = [offered({ organization_name: null })];
    form();
    await screen.findByRole('button', { name: 'Post your review' });
    expect(screen.queryByRole('checkbox', { name: /Only for/ })).toBeNull();
  });
});
