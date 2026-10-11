-- Adding usernames recreated this gated definer view without the barrier
-- required by 20261003030000. Keep caller filters behind its membership gate.
alter view public.chat_authors set (security_barrier = true);
