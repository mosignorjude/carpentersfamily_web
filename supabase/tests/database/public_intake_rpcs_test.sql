begin;
select no_plan();

-- 1. Fixtures: Create test officer in auth.users & member_role_assignments
insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data,
  email_confirmed_at
) values (
  '00000000-0000-0000-0000-000000000e01', 'authenticated', 'authenticated',
  'officer-intake@example.test', '', '{}'::jsonb,
  '{"full_name":"Intake Officer","username":"intake_officer"}'::jsonb, now()
);

update public.member_profiles
set status = 'active'
where id = '00000000-0000-0000-0000-000000000e01';

insert into public.member_role_assignments (member_id, role, assigned_by, grant_reason)
values (
  '00000000-0000-0000-0000-000000000e01', 'admin',
  '00000000-0000-0000-0000-000000000e01', 'Intake test admin'
);

-- 2. Test Anon Execution
set local role anon;

-- Test submit_membership_request and store generated ID
select set_config(
  'test.req_id',
  public.submit_membership_request(
    'Amaka Okonjo', 'amaka@example.com', '+2348031234567', 'Architect',
    'Passionate about club values and community welfare.'
  )::text,
  false
);

select is(
  (current_setting('test.req_id') is not null and current_setting('test.req_id') <> ''),
  true,
  'Anon can submit membership request and receive an ID'
);

-- Test submit_membership_request deduplication error
select throws_ok(
  $$ select public.submit_membership_request(
       'Amaka Duplicate', 'amaka@example.com', '+2348031234567', 'Architect',
       'Passionate about club values and community welfare duplicate.'
     ) $$,
  '23505',
  'A pending membership request already exists for this email.',
  'Duplicate submission raises 23505 with expected message'
);

-- Test submit_partnership_enquiry
select lives_ok(
  $$ select public.submit_partnership_enquiry(
       'Tunde Balogun', 'Apex Brands', 'tunde@apex.ng', '+2348029876543',
       'brand_activation', 'We would like to sponsor the upcoming Gala.'
     ) $$,
  'Anon can submit partnership enquiry'
);

-- 3. Test Officer Execution
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000e01', true);

-- Create an invite as officer and store token in session config
select set_config(
  'test.invite_token',
  public.create_member_invite('invited@example.com', 'member', null),
  false
);

-- Switch back to anon to validate invite token
set local role anon;

-- Validate invite token
select ok(
  (public.validate_invite_token(current_setting('test.invite_token'))->>'valid')::boolean,
  'Valid invite token returns valid: true'
);

-- Validate non-existent token
select is(
  (public.validate_invite_token('0000000000000000000000000000000000000000000000000000000000000000')->>'valid')::boolean,
  false,
  'Non-existent token returns valid: false'
);

-- 4. Test Review and Token Consumption
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000e01', true);

select ok(
  ((public.review_membership_request(current_setting('test.req_id')::uuid, 'approved'))->>'success')::boolean,
  'Officer can approve membership request and generate invite'
);

select is(
  (select status from public.membership_requests where id = current_setting('test.req_id')::uuid),
  'approved',
  'Membership request status is approved'
);

-- Consume invite token
select ok(
  public.consume_invite_token(current_setting('test.invite_token'), '00000000-0000-0000-0000-000000000e01'),
  'Consume invite token succeeds'
);

-- Validating consumed token returns valid: false (already_used)
set local role anon;
select is(
  (public.validate_invite_token(current_setting('test.invite_token'))->>'valid')::boolean,
  false,
  'Consumed invite token returns valid: false'
);

select * from finish();
rollback;
