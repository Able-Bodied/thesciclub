import { describe, expect, it } from 'vitest';
import { isMeetingLink, meetingService } from '@/lib/meeting-link';

describe('meetingService', () => {
  it.each([
    ['https://meet.google.com/abc-defg-hij', 'Google Meet'],
    ['https://zoom.us/j/123456789', 'Zoom'],
    ['https://us02web.zoom.us/j/123?pwd=x', 'Zoom'],
    ['https://zoom.com/meetings/1', 'Zoom'],
    ['https://www.zoomgov.com/j/1', 'Zoom'],
    ['https://teams.microsoft.com/l/meetup-join/19%3a', 'Microsoft Teams'],
    ['https://teams.live.com/meet/9421', 'Microsoft Teams'],
    ['https://acme.webex.com/meet/room', 'Webex'],
    ['https://whereby.com/club', 'Whereby'],
    ['https://meet.jit.si/ClubChat', 'Jitsi Meet'],
    ['HTTPS://MEET.GOOGLE.COM/abc', 'Google Meet'],
    ['  https://zoom.us/j/1 ', 'Zoom'],
  ])('%s is %s', (url, name) => {
    expect(meetingService(url)).toBe(name);
    expect(isMeetingLink(url)).toBe(true);
  });

  it.each([
    'https://zoom.us.evil.com/j/1',
    'https://evilzoom.us/j/1',
    'https://example.com/zoom.us',
    'https://example.com/?next=https://meet.google.com/abc',
    'https://notmeet.google.com.example.org/',
    'https://google.com/meet',
    'https://user@zoom.us.evil.com/',
    'https://norcalsci.org/events/happy-hour',
    'ftp://zoom.us/j/1',
    'javascript:alert(1)',
    'zoom.us/j/1',
    'not a url',
    '',
    null,
    undefined,
  ])('%s is not a meeting link', (url) => {
    expect(meetingService(url)).toBeNull();
    expect(isMeetingLink(url)).toBe(false);
  });
});
