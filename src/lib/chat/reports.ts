import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from '@/lib/account';
import type { ChatWriteResult } from '@/lib/chat/threads';
import type { ChatReport } from '@/lib/chat/types';
import { getSupabase } from '@/lib/supabase';

/**
 * Reporting: one post, or one message, handed to the administrators.
 *
 * Nothing else about a conversation is disclosed, and that sentence is the
 * whole design — here as much as in 20260918150000. The two halves of this
 * file never meet: a member writes reports and can read back three columns of
 * their own; an administrator reads all of them through a definer function and
 * can never reach the table.
 *
 * ---------------------------------------------------------------------------
 * Why the reporter's read has no `.eq('reporter_id', …)` on it
 * ---------------------------------------------------------------------------
 * Every other read in this feature names the filter its policy already
 * applies, for the reason organization-follows.ts gives: a read that means
 * "mine" should say so, so a later policy change cannot quietly widen it.
 *
 * It cannot be done here, and the reason is the point rather than an
 * inconvenience. `chat_reports` grants select on `(id, post_id, message_id)`
 * and nothing else, and PostgREST turns `.eq('reporter_id', …)` into a `where`
 * on a column this role may not read — which is `permission denied`, not a
 * filter. The select policy is `reporter_id = auth.uid()` and is the only
 * thing scoping this. Widening that policy would widen this read; the
 * probe's step 11 is what would catch it.
 */

interface Result<T> {
  data: T | null;
  error: { message: string } | null;
}

/**
 * How long a note can be, matching the column's check constraint.
 *
 * Copied here so somebody dictating finds out while they are typing rather
 * than when the round trip comes back refused. The database still decides.
 */
export const REPORT_NOTE_MAX = 500;

/** What is wrong with a note somebody has typed, or null. Pure. */
export function reportNoteProblem(note: string): string | null {
  if (note.trim().length > REPORT_NOTE_MAX) {
    return `A note is ${REPORT_NOTE_MAX} characters or fewer.`;
  }
  return null;
}

/**
 * What the sheet says before anybody presses anything.
 *
 * The one place this sentence is written, so a room and a conversation cannot
 * drift into promising different things. Pure, and tested, because it is a
 * promise about what the club does with somebody's words and the screen must
 * not be the only copy of it.
 *
 * The two differ in their middle clause and they have to: a report about a
 * post carries `topic_id` and `room_id`, so an administrator can open the
 * topic — which discloses nothing, because a room is readable by every member
 * including them. A report about a message carries no thread id at all and
 * there is no way back into the conversation from it. Saying "nothing else in
 * this conversation" about a room post would be true and misleading; saying it
 * about a message is the whole of what was promised.
 */
export function reportPreamble(kind: 'post' | 'message'): string {
  if (kind === 'post') {
    return "This post, who wrote it and when go to the club's administrators, with your name, and they can open the topic it is in. The person is not told.";
  }
  return "This message, who wrote it and when go to the club's administrators, with your name. Nothing else in this conversation does. The person is not told.";
}

/** Hand one room post over. The database decides; this only asks. */
export async function reportPost(postId: string, note: string): Promise<ChatWriteResult<null>> {
  const { error } = await getSupabase().rpc('chat_report_post', {
    post: postId,
    // `report_note` and not `note`: inside plpgsql a parameter with a column's
    // name is ambiguous against that column, and the function writes
    // chat_reports.note. PostgREST sends arguments by name, so this is the
    // name. See 20260918150000.
    report_note: note.trim(),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: null };
}

/** Hand one message over. Nothing else in the conversation goes with it. */
export async function reportMessage(
  messageId: string,
  note: string,
): Promise<ChatWriteResult<null>> {
  const { error } = await getSupabase().rpc('chat_report_message', {
    message: messageId,
    report_note: note.trim(),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: null };
}

export interface MyReportsState {
  /** Posts this member has already reported. */
  postIds: Set<string>;
  /** Messages this member has already reported. */
  messageIds: Set<string>;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * What the viewer has already reported, so the control reads "Reported".
 *
 * Two id sets and nothing else, which is all three granted columns can say.
 * A failure leaves both empty and the control reads "Report" again — which is
 * the right way round: the database refuses a second report with
 * `on conflict do nothing`, so the worst case is somebody pressing it twice
 * and nothing happening, rather than somebody unable to report at all because
 * a read failed.
 */
export function useMyReports(): MyReportsState {
  const account = useAccount();
  const memberId = account.status === 'member' ? account.userId : null;

  const [postIds, setPostIds] = useState<Set<string>>(new Set());
  const [messageIds, setMessageIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!memberId) {
      setPostIds(new Set());
      setMessageIds(new Set());
      setLoading(false);
      return;
    }
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const aborted = () => controller.signal.aborted;

    try {
      // See the header: no .eq() here, and the reason is not laziness.
      const { data, error: failure } = (await getSupabase()
        .from('chat_reports')
        .select('post_id, message_id')
        .abortSignal(controller.signal)) as Result<
        { post_id: string | null; message_id: string | null }[]
      >;
      if (aborted()) return;
      if (failure) {
        setPostIds(new Set());
        setMessageIds(new Set());
        setError(failure.message);
        setLoading(false);
        return;
      }
      const rows = data ?? [];
      setPostIds(new Set(rows.map((r) => r.post_id).filter((id): id is string => id !== null)));
      setMessageIds(
        new Set(rows.map((r) => r.message_id).filter((id): id is string => id !== null)),
      );
      setError(null);
      setLoading(false);
    } catch (e) {
      if (aborted()) return;
      setError(e instanceof Error ? e.message : 'Could not read what you have reported.');
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    void load();
    return () => {
      inFlight.current?.abort();
    };
  }, [load]);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  return { postIds, messageIds, loading, error, reload };
}

interface ReportRow {
  id: string;
  kind: string;
  context_kind: string;
  post_id: string | null;
  message_id: string | null;
  body_snapshot: string;
  written_at: string;
  place: string;
  topic_id: string | null;
  room_id: string | null;
  note: string | null;
  created_at: string;
  reporter_id: string | null;
  reporter_name: string | null;
  reported_author_id: string | null;
  reported_author_name: string | null;
  report_count: number;
  already_removed: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  resolved_by_name: string | null;
  resolution: string | null;
}

export interface AdminReportsState {
  /** Open reports first, newest first within each half. */
  reports: ChatReport[];
  /** How many are still open — the number in the tab's label. */
  openCount: number;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Every report, for an administrator.
 *
 * Gated on `isAdmin` here as well as in `admin_chat_reports()`, which is not a
 * second permission check — the function's own `is_admin()` is the whole of
 * that. It is so that an ordinary member who reaches /admin for the half-second
 * before the redirect does not fire a call that will be refused and light up
 * the screen with its refusal.
 */
export function useAdminReports(): AdminReportsState {
  const account = useAccount();
  const admin = account.status === 'member' && account.isAdmin;

  const [reports, setReports] = useState<ChatReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!admin) {
      setReports([]);
      setLoading(false);
      return;
    }
    try {
      const { data, error: failure } = (await getSupabase().rpc('admin_chat_reports')) as Result<
        ReportRow[]
      >;
      if (failure) {
        setReports([]);
        setError(failure.message);
        setLoading(false);
        return;
      }
      setReports((data ?? []).map(toReport));
      setError(null);
      setLoading(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the reports.');
      setLoading(false);
    }
  }, [admin]);

  useEffect(() => {
    void load();
  }, [load]);

  const reload = useCallback(() => {
    void load();
  }, [load]);

  return {
    reports,
    openCount: reports.filter((r) => r.resolvedAt === null).length,
    loading,
    error,
    reload,
  };
}

function toReport(row: ReportRow): ChatReport {
  return {
    id: row.id,
    kind: row.kind === 'post' ? 'post' : 'message',
    // 'direct' is the value that takes a control away, so an unknown one —
    // a database ahead of or behind this file — errs towards offering it.
    contextKind:
      row.context_kind === 'direct' ? 'direct' : row.context_kind === 'group' ? 'group' : 'room',
    postId: row.post_id,
    messageId: row.message_id,
    bodySnapshot: row.body_snapshot,
    writtenAt: row.written_at,
    place: row.place,
    topicId: row.topic_id,
    roomId: row.room_id,
    note: row.note,
    createdAt: row.created_at,
    reporterId: row.reporter_id,
    reporterName: row.reporter_name,
    reportedAuthorId: row.reported_author_id,
    reportedAuthorName: row.reported_author_name,
    reportCount: row.report_count,
    alreadyRemoved: row.already_removed,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    resolvedByName: row.resolved_by_name,
    resolution: row.resolution,
  };
}

/**
 * Close a report off with what was decided.
 *
 * The sentence is required by the database, not by this — see
 * 20260918160000. Resolving one that is already resolved is a quiet no-op
 * there, so a double tap costs nothing.
 */
export async function resolveReport(
  reportId: string,
  resolution: string,
): Promise<ChatWriteResult<null>> {
  const { error } = await getSupabase().rpc('admin_resolve_chat_report', {
    report: reportId,
    // `report_resolution`, for the reason `report_note` is: `resolution` is a
    // column on the table the function writes.
    report_resolution: resolution.trim(),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: null };
}
