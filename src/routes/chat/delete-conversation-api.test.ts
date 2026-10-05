import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  steps: [] as string[],
  pages: [[{ name: 'a.webp' }, { name: 'b.webp' }]] as { name: string }[][],
  listError: null as { message: string } | null,
  removeError: null as { message: string } | null,
  rpcError: null as { message: string; code?: string } | null,
}));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    storage: {
      from: (bucket: string) => ({
        list: (folder: string, options: { limit: number; offset: number }) => {
          db.steps.push(`list ${bucket} ${folder} from ${options.offset}`);
          const page = db.pages[options.offset / options.limit] ?? [];
          return Promise.resolve({ data: db.listError ? null : page, error: db.listError });
        },
        remove: (paths: string[]) => {
          db.steps.push(`remove ${paths.join(',')}`);
          return Promise.resolve({ data: [], error: db.removeError });
        },
      }),
    },
    rpc: (name: string, args: { thread: string }) => {
      db.steps.push(`rpc ${name} ${args.thread}`);
      return Promise.resolve({ data: null, error: db.rpcError });
    },
  }),
}));

const { deleteConversation } = await import('@/routes/chat/delete-conversation-api');

beforeEach(() => {
  db.steps = [];
  db.pages = [[{ name: 'a.webp' }, { name: 'b.webp' }]];
  db.listError = null;
  db.removeError = null;
  db.rpcError = null;
});

describe('deleting a conversation with a deleted member', () => {
  it("removes the folder's photographs, then the conversation", async () => {
    expect(await deleteConversation('t1')).toEqual({ ok: true });
    expect(db.steps).toEqual([
      'list chat threads/t1 from 0',
      'remove threads/t1/a.webp,threads/t1/b.webp',
      'rpc chat_delete_conversation t1',
    ]);
  });

  it('asks for nothing to be removed from an empty folder', async () => {
    db.pages = [[]];
    expect(await deleteConversation('t1')).toEqual({ ok: true });
    expect(db.steps).toEqual(['list chat threads/t1 from 0', 'rpc chat_delete_conversation t1']);
  });

  it('reads a folder longer than one page to its end', async () => {
    const full = Array.from({ length: 1000 }, (_, i) => ({ name: `${i}.webp` }));
    db.pages = [full, [{ name: 'last.webp' }]];
    expect(await deleteConversation('t1')).toEqual({ ok: true });
    expect(db.steps.slice(0, 2)).toEqual([
      'list chat threads/t1 from 0',
      'list chat threads/t1 from 1000',
    ]);
    expect(db.steps[2]?.split(',')).toHaveLength(1001);
  });

  it('stops before the conversation when the photographs could not be listed', async () => {
    db.listError = { message: 'network down' };
    const result = await deleteConversation('t1');
    expect(result).toEqual({ ok: false, error: 'network down' });
    expect(db.steps.some((s) => s.startsWith('rpc'))).toBe(false);
  });

  it('stops before the conversation when the photographs could not be removed', async () => {
    db.removeError = { message: 'network down' };
    const result = await deleteConversation('t1');
    expect(result.ok).toBe(false);
    expect(db.steps.some((s) => s.startsWith('rpc'))).toBe(false);
  });

  it("says what the database said when it refuses, in the club's words", async () => {
    db.rpcError = { message: 'That conversation is not there any more.', code: 'P0002' };
    expect(await deleteConversation('t1')).toEqual({
      ok: false,
      error: 'That conversation is not there any more.',
    });
  });

  it('says a conversation with somebody still in it is not theirs to delete', async () => {
    db.rpcError = {
      message: 'Only a conversation with a deleted member can be deleted.',
      code: '42501',
    };
    expect((await deleteConversation('t1')).error).toMatch(/deleted member/);
  });
});
