begin;
select no_plan();

-- Verify tables exist
select has_table('public', 'membership_requests', 'public.membership_requests table must exist');
select has_table('public', 'partnership_enquiries', 'public.partnership_enquiries table must exist');
select has_table('public', 'member_invites', 'public.member_invites table must exist');

-- Verify RLS is enabled
select row_security_active('public.membership_requests');
select row_security_active('public.partnership_enquiries');
select row_security_active('public.member_invites');

-- Verify anon has NO table-level grants
select table_privs_are(
  'public', 'membership_requests', 'anon', ARRAY[]::text[],
  'anon must have NO direct privileges on membership_requests'
);
select table_privs_are(
  'public', 'partnership_enquiries', 'anon', ARRAY[]::text[],
  'anon must have NO direct privileges on partnership_enquiries'
);
select table_privs_are(
  'public', 'member_invites', 'anon', ARRAY[]::text[],
  'anon must have NO direct privileges on member_invites'
);

-- Verify status check constraints
select col_has_check('public', 'membership_requests', 'status', 'membership_requests status has check constraint');
select col_has_check('public', 'partnership_enquiries', 'status', 'partnership_enquiries status has check constraint');

select * from finish();
rollback;
