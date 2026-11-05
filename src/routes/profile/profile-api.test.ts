import { describe, expect, it, vi } from 'vitest';

const row = vi.hoisted(() => ({
  value: {
    how_injured: 'A fall',
    interests: [],
    wants_to_mentor: false,
    injury_type: 'family',
    declined: [],
  },
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: () => ({
      select: () => ({ maybeSingle: () => Promise.resolve({ data: row.value, error: null }) }),
    }),
  }),
}));

const { loadAnswers } = await import('@/routes/profile/profile-api');

describe('loading the answers', () => {
  // For which questions apply (20261104130000).
  it('carries the member’s kind and what they had answered', async () => {
    const result = await loadAnswers();
    if (!result.ok) throw new Error(result.error);
    expect(result.answers.injuryType).toBe('family');
    expect(result.answers.answeredWhenLoaded).toEqual(['howInjured']);
  });
});
