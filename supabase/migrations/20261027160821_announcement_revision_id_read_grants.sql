-- Revision rows remain protected by their existing RLS policies. The signed-in
-- communications page needs each row's stable id as a React list key.
grant select (id)
  on public.announcement_revisions to authenticated;

grant select (id)
  on public.announcement_poll_revisions to authenticated;
