import { describe, expect, it } from 'vitest';
import { roomForTopic, roomsForTopics } from '@/routes/chat/room-map';
import { canonicalTopics } from '@/routes/peers/topics';

/**
 * `canonicalTopics` is deliberately not stubbed: the grouping under test is the
 * real one, or this file would be asserting its own arithmetic. Its own tests
 * are in src/routes/peers/topics.test.ts.
 */

describe('roomForTopic', () => {
  // The whole reason this is built on the groups rather than on a second set
  // of patterns. Four spellings of one subject reached one chip on Peers; they
  // have to reach one room here too.
  it('takes every spelling of a subject to the same room', () => {
    for (const raw of [
      'Back to school',
      'Going back to school',
      'Back to school and work',
      'Returning to college',
    ]) {
      expect(roomForTopic(raw)).toBe('work');
    }
  });

  // One group, two rooms, on purpose on both sides: the filter merges them
  // because a member who talks about one talks about the other, and the rooms
  // split them because a programme and a Mitrofanoff are different questions.
  it('splits the one group that covers two rooms', () => {
    expect(canonicalTopics('Bowel programme')).toContain('Bladder and bowel');
    expect(canonicalTopics('Suprapubic catheter')).toContain('Bladder and bowel');
    expect(roomForTopic('Bowel programme')).toBe('bowel');
    expect(roomForTopic('Travelling with a colostomy')).toBe('bowel');
    expect(roomForTopic('Suprapubic catheter')).toBe('bladder');
    expect(roomForTopic('UTIs')).toBe('bladder');
  });

  it('reads the obvious ones', () => {
    expect(roomForTopic('Wheelchair rugby')).toBe('sport');
    expect(roomForTopic('Working out')).toBe('sport');
    expect(roomForTopic('SmartDrive')).toBe('equip');
    expect(roomForTopic('Hand controls and driving')).toBe('driving');
    expect(roomForTopic('Dating after injury')).toBe('intimacy');
    expect(roomForTopic('Nerve pain')).toBe('pain');
    expect(roomForTopic('Pressure sores')).toBe('skin');
    expect(roomForTopic('Hiring a caregiver')).toBe('funding');
  });

  // The rooms no group names. Without these a member who wrote "SSDI
  // paperwork" would reach no room at all, and Newly injured — the room the
  // club most wants somebody to find — would be unreachable from a profile.
  it('reaches the rooms the groups do not name', () => {
    expect(roomForTopic('The first year')).toBe('newsci');
    expect(roomForTopic('SSDI paperwork')).toBe('funding');
    expect(roomForTopic('Aging with SCI')).toBe('aging');
    expect(roomForTopic('Fertility after injury')).toBe('intimacy');
  });

  // The bargain topics.ts makes, kept here: a wrong room is worse than none.
  // Both of these named a group and the group has no room, which is a decision
  // rather than a gap.
  it('says nothing where the club has no room for it', () => {
    expect(roomForTopic('Mental health')).toBeNull();
    expect(roomForTopic('Living independently')).toBeNull();
    expect(roomForTopic('Canine Companions')).toBeNull();
    expect(roomForTopic('Being a mom in a wheelchair')).toBeNull();
    expect(roomForTopic('   ')).toBeNull();
  });

  // "Shoulder pain" is a pain question and reaches Pain through its group.
  // A bare shoulder is as often one as the other, so the aging pattern does
  // not claim it.
  it('does not send a shoulder to Aging just because it is a shoulder', () => {
    expect(roomForTopic('Shoulder pain')).toBe('pain');
    expect(roomForTopic('Shoulder surgery')).toBeNull();
  });
});

describe('roomsForTopics', () => {
  it('names a room once however many topics point at it', () => {
    expect(roomsForTopics(['Bowel programme', 'Travelling with a colostomy'])).toEqual(['bowel']);
  });

  it('keeps the order the topics were written in', () => {
    expect(roomsForTopics(['Wheelchair rugby', 'Bowel programme', 'Back to work'])).toEqual([
      'sport',
      'bowel',
      'work',
    ]);
  });

  it('drops the topics no room covers rather than the whole list', () => {
    expect(roomsForTopics(['Mental health', 'Wheelchair rugby'])).toEqual(['sport']);
    expect(roomsForTopics([])).toEqual([]);
  });
});
