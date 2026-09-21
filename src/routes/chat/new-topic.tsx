import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BackLink } from '@/components/back-link';
import { attachmentFolder, deleteAttachments, uploadAttachments } from '@/lib/chat/attachments';
import { useChatRooms } from '@/lib/chat/rooms';
import { createTopic } from '@/lib/chat/topics';
import { PhotoPicker, PhotoStrip } from '@/routes/chat/photo-picker';

/**
 * Starting a topic: a title and the first post itself.
 *
 * ---------------------------------------------------------------------------
 * Two fields, and the second one is the post
 * ---------------------------------------------------------------------------
 * `chat_create_topic` writes the topic and its first post in one transaction,
 * so what is typed below the title is an ordinary post and can be removed like
 * any other. The screen says so in as many words, because a form with a
 * "title" and a "body" reads like a document and this is somebody putting
 * something to a room.
 *
 * Which is not always a question, and the copy used to assume it was (owner,
 * 2026-09-20). A tip, a rolling list, or what happened to somebody are all
 * topics — the mock's own Funding room opens with "Rolling list. Post the
 * grant…" — and a screen that asks "what are you asking?" quietly turns a room
 * into a help desk and makes the person with an answer feel out of place in
 * it.
 *
 * ---------------------------------------------------------------------------
 * The draft survives a refusal
 * ---------------------------------------------------------------------------
 * The fields are not cleared on failure and the screen does not navigate. What
 * somebody has just typed is the most expensive thing on the page — especially
 * when it was dictated — and the database's own sentence is shown rather than
 * "something went wrong", because the likely refusals here say something
 * useful: not a member of the room, or the room closed while they typed.
 */
export default function NewTopicPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { rooms, loading } = useChatRooms();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const room = rooms.find((r) => r.id === roomId) ?? null;
  const ready = title.trim().length > 0 && body.trim().length > 0;

  if (loading) {
    return <p className="px-6 py-10 text-center text-[0.875rem] text-grey">Loading…</p>;
  }
  if (!room) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6">
        <div className="mx-auto w-full max-w-[720px]">
          <BackLink to="/chat" label="Chat" />
          <p className="mt-6 text-[0.875rem] text-ink2">
            There is no such room, or it is not open.
          </p>
        </div>
      </div>
    );
  }

  function submit() {
    if (!ready || saving || !room) return;
    setSaving(true);
    setFailure(null);
    const roomId = room.id;
    void (async () => {
      // Files first, under the room's folder, then the topic that names them
      // on its first post. A refused topic takes its files back out.
      let paths: string[] = [];
      if (files.length > 0) {
        const up = await uploadAttachments(files, attachmentFolder('room', roomId));
        if (!up.ok) return up;
        paths = up.value;
      }
      const result = await createTopic(roomId, title.trim(), body.trim(), paths);
      if (!result.ok) void deleteAttachments(paths);
      return result;
    })()
      .then((result) => {
        if (!result.ok) {
          setFailure(result.error);
          return;
        }
        // Straight to the topic, which is also what marks it read, so the
        // member's own new topic is not bold in the list they land back on.
        void navigate(`/chat/rooms/${room.id}/topics/${result.value}`, { replace: true });
      })
      .catch((e: unknown) => {
        setFailure(e instanceof Error ? e.message : 'That did not work.');
      })
      .finally(() => {
        setSaving(false);
      });
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 md:px-6">
      <div className="mx-auto w-full max-w-[720px]">
        <BackLink to={`/chat/rooms/${room.id}`} label={room.name} />

        <h1 className="mt-1 font-extrabold font-head text-[1.25rem] text-ink tracking-[-0.02em]">
          New topic
        </h1>
        <p className="mt-1 text-[0.78125rem] text-grey leading-[1.45]">
          In {room.name}. Every member can read this, including members who join later. Nothing here
          is public.
        </p>

        {failure ? (
          <p className="mt-3 rounded-[11px] border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[0.8125rem] text-destructive leading-[1.45]">
            {failure} Nothing has been posted, and what you wrote is still here.
          </p>
        ) : null}

        <label
          htmlFor="topic-title"
          className="mt-4 block font-bold font-head text-[0.8125rem] text-ink"
        >
          What is it about?
        </label>
        <input
          id="topic-title"
          value={title}
          maxLength={140}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
          placeholder="Travelling with a bowel programme"
          className="mt-1.5 min-h-[44px] w-full rounded-[12px] border-[1.6px] border-line bg-paper px-3.5 py-2.5 text-[0.9375rem] text-ink outline-none focus:border-navy"
        />
        <p className="mt-1 text-[0.71875rem] text-grey">
          {140 - title.length} characters left. This is the line people see in the list.
        </p>

        <label
          htmlFor="topic-body"
          className="mt-4 block font-bold font-head text-[0.8125rem] text-ink"
        >
          The first post
        </label>
        <textarea
          id="topic-body"
          value={body}
          rows={7}
          maxLength={4000}
          onChange={(event) => {
            setBody(event.target.value);
          }}
          placeholder="A question, something that worked for you, or what happened — whatever you want the room to have."
          className="mt-1.5 w-full rounded-[12px] border-[1.6px] border-line bg-paper px-3.5 py-2.5 text-[0.9375rem] text-ink leading-[1.5] outline-none focus:border-navy"
        />

        {/* Up to four, with the first post. The words stay required — a topic
            is a line in a list and a picture is not a title — so a photograph
            comes with the post rather than instead of it. */}
        <div className="mt-3">
          <PhotoStrip
            files={files}
            disabled={saving}
            onRemove={(index) => {
              setFiles((current) => current.filter((_, i) => i !== index));
            }}
          />
          <PhotoPicker files={files} onChange={setFiles} disabled={saving} />
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={!ready || saving}
          className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-gold font-bold font-head text-[#2A1E06] text-[0.9375rem] transition-colors hover:bg-gold-hi disabled:opacity-40 disabled:hover:bg-gold"
        >
          {saving ? 'Posting…' : 'Post it'}
        </button>
        <div className="h-3" />
      </div>
    </div>
  );
}
