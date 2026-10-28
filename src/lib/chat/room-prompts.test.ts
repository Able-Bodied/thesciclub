import { describe, expect, it } from 'vitest';
import { GENERAL_PROMPT, roomPrompt } from '@/lib/chat/room-prompts';

// The owner, 2026-10-28: examples in each room's own terms.
describe('roomPrompt', () => {
  it('gives each room its own example, by id', () => {
    expect(roomPrompt({ id: 'bowel', name: 'Bowel management' }).title).toBe(
      'Keeping my bowel programme on track while travelling',
    );
    expect(roomPrompt({ id: 'sport', name: 'Adaptive sport' }).title).toMatch(/handcycling/);
  });

  it('finds a room started in the app by its name when its id is new', () => {
    expect(roomPrompt({ id: 'cooking-zz99', name: 'Cooking' }).title).toMatch(/dinner/);
    expect(roomPrompt({ id: 'x', name: 'App Feedback' }).body).toMatch(/screenshot/);
  });

  it('falls back to the general prompt for a room it does not know', () => {
    expect(roomPrompt({ id: 'gardening-1a2b', name: 'Gardening' })).toEqual(GENERAL_PROMPT);
    expect(roomPrompt(null)).toEqual(GENERAL_PROMPT);
  });
});
