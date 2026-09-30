import type { ChatPost, ChatRoom } from '@/lib/chat/types';
import type { HomeTopic } from '@/lib/home/types';
import type { BrowseMember, ClubEvent, EventTag, Organization } from '@/types/domain';

/** A member with everything empty, for tests to fill in only what they care about. */
export function makeMember(overrides: Partial<BrowseMember> = {}): BrowseMember {
  return {
    id: Math.random().toString(36).slice(2),
    type: 'peer',
    displayName: 'Test',
    photoPath: null,
    photoAlt: null,
    avatarColor: null,
    city: 'San Jose',
    state: 'CA',
    levelRange: 'T1–T6',
    exactLevel: null,
    completeness: 'Do not know',
    injuryDate: null,
    injuryDatePrecision: null,
    region: 'Thoracic',
    age: 40,
    howInjured: null,
    bio: null,
    detail: null,
    gender: null,
    languages: [],
    independence: null,
    employment: null,
    fieldOfWork: null,
    education: null,
    educationWhen: null,
    maritalStatus: null,
    hasChildren: null,
    childrenWhen: null,
    interests: [],
    topics: [],
    selfCare: [],
    affiliations: [],
    wantsToMentor: null,
    isSeed: false,
    isAdmin: false,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

/** An event with everything plausible, for tests to override only what they mean. */
export function makeEvent(overrides: Partial<ClubEvent> = {}): ClubEvent {
  return {
    id: Math.random().toString(36).slice(2),
    title: 'Test event',
    description: '',
    descriptionHtml: '',
    startTime: '2026-09-05T17:00:00.000Z',
    seriesId: null,
    endTime: null,
    timezone: 'America/Los_Angeles',
    location: 'Somewhere',
    city: 'San Jose',
    url: null,
    registrationUrl: null,
    format: 'in_person',
    organizationId: null,
    hostName: null,
    tags: [],
    goingCount: 0,
    interestedCount: 0,
    ...overrides,
  };
}

/** A tag in the shape `ClubEvent.tags` carries, with its category. */
export function makeTag(slug: string, categorySlug = 'sport'): EventTag {
  return { slug, name: slug, categorySlug, categoryName: categorySlug };
}

/** An organization, for tests that only care about one or two of its fields. */
export function makeOrganization(overrides: Partial<Organization> = {}): Organization {
  return {
    id: 'org-1',
    shortCode: 'NCS',
    name: 'NorCal SCI',
    city: 'Northern California',
    description: '',
    tags: [],
    canInvite: true,
    logoPath: null,
    ...overrides,
  };
}

/** An open room, for tests to close or rename only when that is the point. */
export function makeRoom(overrides: Partial<ChatRoom> = {}): ChatRoom {
  return {
    id: 'bowel',
    name: 'Bowel management',
    description: 'The one nobody talks about anywhere else.',
    category: 'Body',
    icon: '◍',
    sortOrder: 1,
    openedAt: '2026-09-18T10:00:00Z',
    createdBy: null,
    ...overrides,
  };
}

/** A standing post with words and no photographs. */
export function makePost(overrides: Partial<ChatPost> = {}): ChatPost {
  return {
    id: Math.random().toString(36).slice(2),
    topicId: 't',
    authorId: 'a',
    body: 'Something.',
    attachments: [],
    createdAt: '2026-09-20T10:00:00Z',
    removedAt: null,
    removedByAdmin: false,
    ...overrides,
  };
}

/** A plain topic in an open room, with its opening post and no replies. */
export function makeHomeTopic(overrides: Partial<HomeTopic> = {}): HomeTopic {
  const id = overrides.id ?? Math.random().toString(36).slice(2);
  return {
    id,
    roomId: 'bowel',
    title: 'Morning or evening routine?',
    authorId: 'a',
    createdAt: '2026-09-20T10:00:00Z',
    lastPostAt: '2026-09-20T10:00:00Z',
    replyCount: 0,
    room: makeRoom(),
    opening: makePost({ topicId: id }),
    firstReply: null,
    photo: false,
    ...overrides,
  };
}
