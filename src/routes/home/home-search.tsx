import { Search, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDialogFocus } from '@/lib/dialog-focus';
import type { HomeTopic } from '@/lib/home/types';
import { longWhen } from '@/routes/events/format';
import type { BrowseMember, ClubEvent, Organization } from '@/types/domain';

const EACH = 5;

export interface SearchSources {
  topics: readonly HomeTopic[];
  events: readonly ClubEvent[];
  members: readonly BrowseMember[];
  organizations: readonly Organization[];
}

/** Every word somewhere in what is known of it, as the directory's search does. */
function matching<T>(rows: readonly T[], words: string[], text: (row: T) => string): T[] {
  return rows
    .filter((row) => {
      const haystack = text(row).toLowerCase();
      return words.every((word) => haystack.includes(word));
    })
    .slice(0, EACH);
}

/** What a search finds, a few of each. Nothing for nothing typed. */
export function searchHome(query: string, sources: SearchSources): SearchSources {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { topics: [], events: [], members: [], organizations: [] };
  return {
    topics: matching(sources.topics, words, (topic) => topic.title),
    events: matching(sources.events, words, (event) =>
      [event.title, event.city, event.location].join(' '),
    ),
    members: matching(sources.members, words, (member) =>
      [member.displayName, member.city].join(' '),
    ),
    organizations: matching(sources.organizations, words, (organization) =>
      [organization.name, organization.city, ...organization.tags].join(' '),
    ),
  };
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="mb-1.5 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]">
        {title}
      </h2>
      <ul className="overflow-hidden rounded-[14px] border border-line bg-paper">{children}</ul>
    </section>
  );
}

function Row({
  to,
  state,
  title,
  detail,
}: {
  to: string;
  state: unknown;
  title: string;
  detail?: string | null;
}) {
  return (
    <li className="border-line border-b last:border-b-0">
      <Link to={to} state={state} className="block min-h-[48px] px-3.5 py-2.5 hover:bg-tint">
        <span className="block font-bold text-[0.9375rem] text-ink leading-[1.3]">{title}</span>
        {detail ? (
          <span className="mt-0.5 block text-[0.8125rem] text-ink2 leading-[1.3]">{detail}</span>
        ) : null}
      </Link>
    </li>
  );
}

/**
 * Search, over the whole of Home (the owner, 2026-11-01): topics, the events
 * Home has read, members and organizations, as each letter is typed.
 */
export function HomeSearch({
  sources,
  linkState,
  onClose,
}: {
  sources: SearchSources;
  /** Home's own state, so a result's Back returns to this pill. */
  linkState: unknown;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const dialog = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  useDialogFocus(dialog, input, onClose);

  const found = searchHome(query, sources);
  const any =
    found.topics.length + found.events.length + found.members.length + found.organizations.length >
    0;

  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      className="absolute inset-0 z-[71] flex flex-col bg-canvas"
    >
      <div className="flex-none border-line border-b bg-paper px-[18px] py-3">
        <div className="mx-auto flex w-full max-w-[var(--events-measure)] items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 h-[17px] w-[17px] text-grey"
              strokeWidth={2}
              aria-hidden="true"
            />
            <input
              ref={input}
              type="search"
              aria-label="Search the club"
              placeholder="Search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
              className="h-[44px] w-full rounded-full border border-line bg-canvas pr-3 pl-9 text-[1rem] text-ink"
            />
          </div>
          <button
            type="button"
            aria-label="Close search"
            onClick={onClose}
            className="grid h-[44px] w-[44px] flex-none place-items-center rounded-full bg-tint text-emphasis hover:bg-line"
          >
            <X className="h-[19px] w-[19px]" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-[18px] pb-8">
        <div className="mx-auto w-full max-w-[var(--events-measure)]">
          {query.trim() && !any ? (
            <p className="px-6 py-10 text-center text-[0.875rem] text-grey">
              Nothing matches that yet.
            </p>
          ) : null}
          {found.topics.length > 0 ? (
            <Group title="Topics">
              {found.topics.map((topic) => (
                <Row
                  key={topic.id}
                  to={`/chat/rooms/${topic.roomId}/topics/${topic.id}`}
                  state={linkState}
                  title={topic.title}
                  detail={topic.room.name}
                />
              ))}
            </Group>
          ) : null}
          {found.events.length > 0 ? (
            <Group title="Events">
              {found.events.map((event) => (
                <Row
                  key={event.id}
                  to={`/events/${event.id}`}
                  state={linkState}
                  title={event.title}
                  detail={longWhen(event.startTime, event.timezone, event.allDay)}
                />
              ))}
            </Group>
          ) : null}
          {found.members.length > 0 ? (
            <Group title="Peers">
              {found.members.map((member) => (
                <Row
                  key={member.id}
                  to={`/peers/${member.id}`}
                  state={linkState}
                  title={member.displayName}
                  detail={member.city}
                />
              ))}
            </Group>
          ) : null}
          {found.organizations.length > 0 ? (
            <Group title="Organizations">
              {found.organizations.map((organization) => (
                <Row
                  key={organization.id}
                  to={`/events/organizations/${organization.id}`}
                  state={linkState}
                  title={organization.name}
                  detail={organization.city}
                />
              ))}
            </Group>
          ) : null}
        </div>
      </div>
    </div>
  );
}
