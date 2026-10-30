-- The staff settings view reads the attendance cutoff and when it last changed.
grant select (changed_at) on public.club_attendance_settings to authenticated;
