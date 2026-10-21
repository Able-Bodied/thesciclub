/**
 * The Reeve Foundation's free Zoom support groups (feed_url): living with
 * quadriplegia, with paraplegia, and for family and caregivers. Each group's
 * section states its hour ("at 6:00 PM ET") and lists its next dates without
 * a year, each with its Zoom sign-up link.
 *
 * Online, so read in the club's time: 6pm Eastern shows as 3pm.
 */

import * as cheerio from 'cheerio';
import { fetchText } from './http.js';
import { nearestYear, parseMonthDay } from './naturetrack-trax.js';
import { zonedPartsToUtc } from './timezone.js';

const ZONES = {
  ET: 'America/New_York',
  CT: 'America/Chicago',
  MT: 'America/Denver',
  PT: 'America/Los_Angeles',
};

export function parseGroups(html, now = new Date()) {
  const $ = cheerio.load(html);
  const events = [];
  const groups = $('h2').filter((_, h) => /support group/i.test($(h).text()));
  if (groups.length === 0) throw new Error('Reeve: no support group sections on the page.');
  groups.each((_, h) => {
    const title = $(h).text().replace(/\s+/g, ' ').trim();
    const paragraphs = $(h).nextAll('p');
    const about = paragraphs.first().text().replace(/\s+/g, ' ').trim();
    const time = /at (\d{1,2}):(\d{2}) ?([AP])\.?M\.? ?(ET|CT|MT|PT)\b/i.exec(about);
    if (!time) {
      console.log(`  ! Reeve: no meeting time for ${title}`);
      return;
    }
    const hour = (Number(time[1]) % 12) + (time[3].toUpperCase() === 'P' ? 12 : 0);
    const zone = ZONES[time[4].toUpperCase()];
    paragraphs.slice(1).each((__, p) => {
      const link = $(p).find('a[href*="zoom.us"]').attr('href');
      // The date is the text before the line break; the link runs straight on.
      const monthDay = parseMonthDay($(p).contents().first().text());
      if (!link || !monthDay) return;
      const year = nearestYear(monthDay, now);
      const start = zonedPartsToUtc(
        {
          year,
          month: monthDay.month,
          day: monthDay.day,
          hour,
          minute: Number(time[2]),
          second: 0,
        },
        zone,
      );
      const day = `${year}-${String(monthDay.month).padStart(2, '0')}-${String(monthDay.day).padStart(2, '0')}`;
      events.push({
        external_id: `reeve-group:${title.toLowerCase().replace(/[^a-z]+/g, '-')}:${day}`,
        title: `${title} (Zoom)`,
        description: `${about} Free. Register on Zoom for each meeting.`,
        description_html: `<p>${about.replace(/[<>&]/g, '')} Free. Register on Zoom for each meeting.</p>`,
        location: '',
        start_time: start.toISOString(),
        end_time: null,
        all_day: false,
        timezone: null,
        url: null,
        registration_url: link,
        host_name: null,
      });
    });
  });
  return events;
}

export class ReeveSupportGroupsScraper {
  constructor(feed) {
    this.url = feed.feed_url;
  }

  async scrape() {
    return parseGroups(await fetchText(this.url));
  }
}
