-- Support bounded chronological pages across the fixed set of dues audit events.
create index audit_log_action_occurred_idx
  on public.audit_log (action, occurred_at desc);
