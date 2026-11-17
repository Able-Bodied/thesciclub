import { ExternalLink, FileText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type EventAttachment, fetchEventAttachments } from '@/lib/events';
import { safeHref } from '@/routes/events/rich-text';

/**
 * On an event's page, under its details (the owner, 2026-11-17): the files
 * attached to the calendar invitation it came from, a meeting's notes
 * document for one, each a link by its own name. For signed-in members;
 * nothing for an event with none, and nothing until they are read. Who may
 * open the file itself is for the file's owner to say, where it is kept.
 */
export function EventFiles({ eventId }: { eventId: string }) {
  const [files, setFiles] = useState<EventAttachment[]>([]);
  useEffect(() => {
    let live = true;
    setFiles([]);
    void fetchEventAttachments(eventId).then((found) => {
      if (live) setFiles(found);
    });
    return () => {
      live = false;
    };
  }, [eventId]);

  const links = files.flatMap((file) => {
    const href = safeHref(file.url);
    return href ? [{ title: file.title, href }] : [];
  });
  if (links.length === 0) return null;
  return (
    <>
      <h2 className="mt-5 mb-1 font-extrabold font-head text-[0.75rem] text-grey uppercase tracking-[0.13em]">
        Notes and files
      </h2>
      <ul>
        {links.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 font-extrabold font-head text-[0.9375rem] text-emphasis underline underline-offset-[3px]"
            >
              <FileText className="h-[15px] w-[15px] flex-none" aria-hidden="true" />
              <span className="[overflow-wrap:anywhere]">{link.title}</span>
              <ExternalLink className="h-[15px] w-[15px] flex-none" aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
