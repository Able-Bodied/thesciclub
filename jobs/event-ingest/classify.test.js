import { describe, expect, it } from 'vitest';
import { classifyFormat, classifyTags, containsContactDetails } from './classify.js';

describe('classifyFormat', () => {
  it('reads a Zoom venue as online', () => {
    expect(classifyFormat({ location: 'Zoom', title: 'Driving and hand controls' })).toBe('online');
  });

  it('reads a street address as in person', () => {
    expect(classifyFormat({ location: 'Ed Roberts Campus, Berkeley, CA 94703' })).toBe('in_person');
  });

  it('does not read "register online" as an online event', () => {
    // The single most common false positive in these feeds: almost every
    // in-person event's description tells you to register online.
    expect(
      classifyFormat({
        location: 'Independence Sports Complex, San Jose',
        description: 'Please register online by Friday.',
      }),
    ).toBe('in_person');
  });

  it('spots a hybrid event', () => {
    expect(
      classifyFormat({
        location: 'SCVMC main lobby',
        description: 'Join us in person or online via Zoom.',
      }),
    ).toBe('hybrid');
  });

  it('lets hybrid win over an online venue', () => {
    expect(classifyFormat({ location: 'Zoom', description: 'This is a hybrid meeting.' })).toBe(
      'hybrid',
    );
  });

  it('uses the description when there is no venue at all', () => {
    // Most of NorCal SCI's calendar is weekly Zoom groups with an empty
    // location field, so this is the common case rather than the edge one.
    expect(
      classifyFormat({
        location: '',
        title: "NorCal SCI's Friday Happy Hour",
        description: 'Hosted every Friday, the group meets via Zoom.',
      }),
    ).toBe('online');
  });

  it('uses the title when there is no venue at all', () => {
    expect(classifyFormat({ location: '', title: 'Webinar: benefits advice' })).toBe('online');
  });

  it('does not read a bare "register online" with no venue as an online event', () => {
    // A description is where "please register online" lives. Without a platform
    // named, or "online" attached to a word meaning the gathering itself, this
    // stays undetermined rather than guessing.
    expect(
      classifyFormat({
        location: '',
        title: 'Monthly meet up',
        description: 'Please register online by Friday.',
      }),
    ).toBeNull();
  });

  it('returns null rather than guessing when nothing says', () => {
    // Null is "the feed did not tell us", which is different from "in person".
    // An unconditional default would silently claim the second.
    expect(classifyFormat({ location: '', title: 'Monthly meet', description: '' })).toBeNull();
  });

  it('handles being given nothing', () => {
    expect(classifyFormat()).toBeNull();
    expect(classifyFormat({})).toBeNull();
  });
});

describe('classifyTags', () => {
  it('tags the specific activity', () => {
    expect(classifyTags({ title: 'Handcycle ride — West Cliff Drive' })).toContain('handcycling');
  });

  it('tags wheelchair rugby', () => {
    expect(classifyTags({ title: 'Wheelchair rugby — open practice' })).toContain(
      'wheelchair-rugby',
    );
  });

  it('picks up the audience note as well as the activity', () => {
    const tags = classifyTags({
      title: 'Wheelchair rugby — open practice',
      description: 'Half the people on the court have never played. Beginners welcome.',
    });
    expect(tags).toContain('wheelchair-rugby');
    expect(tags).toContain('beginner-welcome');
  });

  it('tags a newly injured group', () => {
    const tags = classifyTags({
      title: 'Newly injured coffee — first 12 months',
      description: 'An informal hour for anyone in their first year.',
    });
    expect(tags).toContain('newly-injured');
  });

  it('does not call a wheelchair repair clinic adaptive sport', () => {
    // A real pass over NorCal SCI's calendar did exactly this, on the strength
    // of the word "clinic". A repair clinic is the thing you do so you can get
    // to a sport.
    const tags = classifyTags({
      title: 'Free Monthly Wheelchair Repair Clinic',
      description: 'Bring your chair for a free tune-up.',
    });
    expect(tags).toContain('equipment');
    expect(tags).not.toContain('adaptive-sport');
  });

  it('does not let "family members and caregivers are welcome" retag a happy hour', () => {
    // A real line from NorCal SCI's calendar, on a social Zoom call. It is a
    // note about the door, not about the room — matching it tagged a happy hour
    // as a family event and a caregiver group.
    const tags = classifyTags({
      title: "NorCal SCI's Friday Happy Hour",
      description:
        'Hosted every Friday by NorCal SCI, the group meets via Zoom. Family members and ' +
        'caregivers are welcome to join as well.',
    });
    expect(tags).toContain('food-drink');
    expect(tags).not.toContain('family');
    expect(tags).not.toContain('caregiver-group');
  });

  it('still tags an event that is genuinely for caregivers', () => {
    expect(classifyTags({ title: 'Caregiver MeetUp', description: '' })).toContain(
      'caregiver-group',
    );
    expect(
      classifyTags({ title: 'Tuesday group', description: 'A support group for caregivers.' }),
    ).toContain('caregiver-group');
  });

  it('takes an audience tag from a predicating phrase, not a passing mention', () => {
    expect(
      classifyTags({
        title: 'Open practice',
        description: 'Beginners welcome, no experience needed.',
      }),
    ).toContain('beginner-welcome');
    expect(
      classifyTags({ title: 'Open practice', description: 'Beginners from other clubs attended.' }),
    ).not.toContain('beginner-welcome');
  });

  it('does not match inside a longer word', () => {
    // "ski" must not fire on "skills", and "rugby" must not fire on a substring.
    expect(classifyTags({ title: 'Benefits and skills workshop' })).not.toContain('winter-sports');
  });

  it('reads only the title and description, never the venue', () => {
    // A venue called "Independence Sports Complex" would otherwise tag every
    // event held there as being about independence.
    const tags = classifyTags({
      title: 'Wheelchair rugby',
      description: 'At the Independence Sports Complex.',
    });
    expect(tags).toContain('wheelchair-rugby');
    // The description genuinely does say "Independence", which is why the
    // location is excluded at the call site rather than here.
    expect(classifyTags({ title: 'Wheelchair rugby', description: '' })).not.toContain(
      'independence',
    );
  });

  it('gives an unmatched event no tags rather than a guessed one', () => {
    // A wrong chip is worse than a missing one: somebody filters for "Newly
    // injured", gets a rugby match, and stops trusting the filter.
    expect(classifyTags({ title: 'Quarterly board meeting', description: '' })).toEqual([]);
  });

  it('caps how many chips one card can grow', () => {
    const tags = classifyTags({
      title: 'Family handcycle ride, kayaking, climbing and BBQ for parents and kids',
      description: 'Beginners welcome. Travel and music too. Fundraising afterwards.',
    });
    expect(tags.length).toBeLessThanOrEqual(4);
  });

  it('keeps the specific activity above the broad category when it caps', () => {
    const tags = classifyTags(
      { title: 'Handcycle ride', description: 'An adaptive sport clinic.' },
      1,
    );
    expect(tags).toEqual(['handcycling']);
  });

  it('handles being given nothing', () => {
    expect(classifyTags()).toEqual([]);
    expect(classifyTags({})).toEqual([]);
  });
});

describe('containsContactDetails', () => {
  it('spots an email', () => {
    expect(containsContactDetails('Questions? kevin@example.org')).toBe(true);
  });

  it('spots a phone number in several shapes', () => {
    expect(containsContactDetails('Call (555) 123-4567')).toBe(true);
    expect(containsContactDetails('Call 555-123-4567')).toBe(true);
    expect(containsContactDetails('Call 555.123.4567')).toBe(true);
  });

  it('is false for ordinary copy', () => {
    expect(containsContactDetails('Bring nothing. Chairs are provided.')).toBe(false);
  });

  it('does not mistake a date or a price for a phone number', () => {
    expect(containsContactDetails('Costs $25 on 2026-09-05 at 10:00am')).toBe(false);
  });

  it('checks every value it is given', () => {
    expect(containsContactDetails('plain text', '<p>kevin@example.org</p>')).toBe(true);
  });

  it('handles nulls', () => {
    expect(containsContactDetails(null, undefined, '')).toBe(false);
  });
});
