begin;

select no_plan();

-- The outbox worker authenticates as service_role: it invokes the notification
-- RPCs and resolves recipients from the two profile tables. The core hardening
-- migration revoked schema usage and both table reads, so these assertions
-- guard the worker's access path.

select ok(
  has_schema_privilege('service_role', 'public', 'usage'),
  'service_role can use the public schema'
);

select ok(
  has_table_privilege('service_role', 'public.member_profiles', 'select'),
  'service_role can read member profiles for notification contacts'
);

select ok(
  has_table_privilege('service_role', 'public.member_role_assignments', 'select'),
  'service_role can read role assignments for officer contacts'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.claim_notification_outbox_jobs(integer, integer, timestamp with time zone)'::regprocedure,
    'execute'
  ),
  'service_role can execute the claim RPC'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.evaluate_notification_reminders(timestamp with time zone)'::regprocedure,
    'execute'
  ),
  'service_role can execute the reminder evaluation RPC'
);

select ok(
  not has_table_privilege('service_role', 'public.notification_outbox', 'select'),
  'service_role still cannot read the outbox outside the RPCs'
);

select * from finish();
rollback;
