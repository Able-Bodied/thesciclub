import { describe, expect, it } from 'vitest';
import { canonicalTopics, canonicalTopicsOf } from '@/routes/peers/topics';

/**
 * Every string here is one a member actually wrote in the club's directory.
 */

describe('canonicalTopics', () => {
  it('gathers the four ways members wrote "back to school"', () => {
    // The whole reason this file exists. Six members offered this
    // conversation and no single chip found more than two of them.
    for (const raw of [
      'Back to school',
      'Going back to school',
      'Back to school and work',
      'Returning to college',
    ]) {
      expect(canonicalTopics(raw)).toContain('Back to school');
    }
  });

  it('files a topic under both groups when it names both', () => {
    // Returning one label would have filed this member under school and lost
    // them from work — the same bug, one layer down.
    expect(canonicalTopics('Back to school and work')).toEqual(
      expect.arrayContaining(['Back to school', 'Back to work']),
    );
  });

  it('gathers the catheter and bladder wordings', () => {
    for (const raw of [
      'Suprapubic tube',
      'Suprapubic catheter',
      'Self-catheterization',
      'Neurogenic bladder and Botox',
      'UTIs',
    ]) {
      expect(canonicalTopics(raw)).toContain('Bladder and bowel');
    }
  });

  it('keeps a topic nothing claims in the member’s own words', () => {
    // Confident on the obvious, silent on the rest. A wrong grouping puts
    // somebody in a conversation they did not offer to have.
    expect(canonicalTopics('Being a mom in a wheelchair')).toEqual(['Being a mom in a wheelchair']);
    expect(canonicalTopics('Canine Companions')).toEqual(['Canine Companions']);
  });

  it('has nothing to say about an empty topic', () => {
    expect(canonicalTopics('   ')).toEqual([]);
  });
});

describe('canonicalTopicsOf', () => {
  it('counts a member once for a group they named twice', () => {
    expect(canonicalTopicsOf(['Back to school', 'Returning to college'])).toEqual([
      'Back to school',
    ]);
  });
});
