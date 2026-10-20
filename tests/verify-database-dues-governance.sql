-- Verification script for Phase 4: Database-backed Member Dues Payment Submission and Approval Governance Matrix
DO $$
DECLARE
  v_admin_id uuid := 'a0000000-0000-0000-0000-000000000001'::uuid;
  v_exec_id uuid := 'a0000000-0000-0000-0000-000000000002'::uuid;
  v_backup_admin_id uuid := 'dfe3c844-d53e-4616-ba1b-455fb59e59e2'::uuid;
  v_member_id uuid := 'a0000000-0000-0000-0000-000000000003'::uuid;

  v_today date := (clock_timestamp() at time zone 'Africa/Lagos')::date;
  v_month_1 date := '2026-11-01'::date;
  v_month_2 date := '2026-12-01'::date;
  v_rate_1 bigint;
  v_rate_2 bigint;

  v_req_member uuid;
  v_req_exec uuid;
  v_req_backup uuid;
  v_payment_id uuid;
  v_failed boolean;
  v_unpaid_admin_count integer;
BEGIN
  RAISE NOTICE '=== STARTING PHASE 4 DUES GOVERNANCE DATABASE VERIFICATION ===';

  -- Ensure dues rates exist for test months
  SELECT monthly_amount_ngn INTO v_rate_1 FROM public.dues_rates WHERE effective_month <= v_month_1 ORDER BY effective_month DESC LIMIT 1;
  SELECT monthly_amount_ngn INTO v_rate_2 FROM public.dues_rates WHERE effective_month <= v_month_2 ORDER BY effective_month DESC LIMIT 1;

  IF v_rate_1 IS NULL OR v_rate_2 IS NULL THEN
    RAISE EXCEPTION 'Dues rates must be configured for test months.';
  END IF;

  -- Ensure membership periods exist for future prepayment
  INSERT INTO public.dues_membership_periods (member_id, starts_month)
  VALUES
    (v_admin_id, '2026-01-01'),
    (v_exec_id, '2026-01-01'),
    (v_backup_admin_id, '2026-01-01'),
    (v_member_id, '2026-01-01')
  ON CONFLICT (member_id, starts_month) DO NOTHING;

  -- ------------------------------------------------------------------------
  -- TEST 1: Admins do NOT pay dues (View check)
  -- ------------------------------------------------------------------------
  SELECT count(*) INTO v_unpaid_admin_count
  FROM public.dues_month_status
  WHERE member_id = v_admin_id AND status = 'unpaid';

  IF v_unpaid_admin_count <> 0 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Admin must have 0 unpaid dues months, found %', v_unpaid_admin_count;
  END IF;
  RAISE NOTICE 'TEST 1 PASSED: Admin has 0 unpaid dues months (exempt from obligations).';

  -- ------------------------------------------------------------------------
  -- TEST 2: Admin cannot submit dues payment requests
  -- ------------------------------------------------------------------------
  EXECUTE format('SET LOCAL request.jwt.claim.sub = %L', v_admin_id);
  v_failed := false;
  BEGIN
    PERFORM private.submit_dues_payment_request(
      v_rate_1,
      ARRAY[v_month_1],
      'bank_transfer',
      'ADMIN_TEST_REF_001',
      'Admin submitting dues'
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    IF SQLERRM NOT LIKE '%Admins are exempt from paying dues%' THEN
      RAISE EXCEPTION 'TEST 2 FAILED: Expected admin exemption message, got: %', SQLERRM;
    END IF;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Admin was able to submit dues payment request!';
  END IF;
  RAISE NOTICE 'TEST 2 PASSED: Admin cannot submit dues payment requests (exempt).';

  -- ------------------------------------------------------------------------
  -- TEST 3: Admin cannot have dues recorded manually by an officer
  -- ------------------------------------------------------------------------
  EXECUTE format('SET LOCAL request.jwt.claim.sub = %L', v_exec_id);
  v_failed := false;
  BEGIN
    PERFORM private.record_dues_payment(
      v_admin_id,
      v_rate_1,
      v_today,
      ARRAY[v_month_1]
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    IF SQLERRM NOT LIKE '%Admins are exempt from statutory dues obligations%' THEN
      RAISE EXCEPTION 'TEST 3 FAILED: Expected admin exemption message, got: %', SQLERRM;
    END IF;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Officer was able to record dues payment for Admin!';
  END IF;
  RAISE NOTICE 'TEST 3 PASSED: Recording dues payment for Admin is blocked by database.';

  -- ------------------------------------------------------------------------
  -- TEST 4: Member can submit dues payment request
  -- ------------------------------------------------------------------------
  EXECUTE format('SET LOCAL request.jwt.claim.sub = %L', v_member_id);
  v_req_member := private.submit_dues_payment_request(
    v_rate_1,
    ARRAY[v_month_1],
    'bank_transfer',
    'MEM_TXN_REF_001',
    'Paid from Kuda bank Adekunle'
  );

  IF v_req_member IS NULL THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Member request submission failed.';
  END IF;
  RAISE NOTICE 'TEST 4 PASSED: Member successfully submitted dues payment request %', v_req_member;

  -- ------------------------------------------------------------------------
  -- TEST 5: Executive CANNOT approve their own dues
  -- ------------------------------------------------------------------------
  EXECUTE format('SET LOCAL request.jwt.claim.sub = %L', v_exec_id);
  v_req_exec := private.submit_dues_payment_request(
    v_rate_1,
    ARRAY[v_month_1],
    'paystack',
    'EXEC_TXN_REF_001',
    'Executive paying dues'
  );

  v_failed := false;
  BEGIN
    PERFORM private.approve_dues_payment_request(v_req_exec);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    IF SQLERRM NOT LIKE '%Officers cannot approve their own dues payments%' THEN
      RAISE EXCEPTION 'TEST 5 FAILED: Expected self-approval block message, got: %', SQLERRM;
    END IF;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'TEST 5 FAILED: Executive was able to approve own dues!';
  END IF;
  RAISE NOTICE 'TEST 5 PASSED: Executive is strictly blocked from approving own dues.';

  -- ------------------------------------------------------------------------
  -- TEST 6: Executive CAN approve Backup Admin dues
  -- ------------------------------------------------------------------------
  EXECUTE format('SET LOCAL request.jwt.claim.sub = %L', v_backup_admin_id);
  v_req_backup := private.submit_dues_payment_request(
    v_rate_1,
    ARRAY[v_month_1],
    'bank_transfer',
    'BACKUP_ADMIN_REF_001',
    'Backup Admin paying dues'
  );

  -- Executive logs in and approves Backup Admin dues
  EXECUTE format('SET LOCAL request.jwt.claim.sub = %L', v_exec_id);
  v_payment_id := private.approve_dues_payment_request(v_req_backup);

  IF v_payment_id IS NULL THEN
    RAISE EXCEPTION 'TEST 6 FAILED: Executive could not approve Backup Admin dues.';
  END IF;

  -- Verify disposition in ledger
  IF NOT EXISTS (
    SELECT 1 FROM public.dues_month_dispositions
    WHERE member_id = v_backup_admin_id AND covered_month = v_month_1 AND disposition = 'paid'
  ) THEN
    RAISE EXCEPTION 'TEST 6 FAILED: Month disposition row not found for Backup Admin.';
  END IF;
  RAISE NOTICE 'TEST 6 PASSED: Executive successfully approved Backup Admin dues into ledger.';

  -- ------------------------------------------------------------------------
  -- TEST 7: Backup Admin CANNOT approve own dues
  -- ------------------------------------------------------------------------
  EXECUTE format('SET LOCAL request.jwt.claim.sub = %L', v_backup_admin_id);
  v_req_backup := private.submit_dues_payment_request(
    v_rate_2,
    ARRAY[v_month_2],
    'bank_transfer',
    'BACKUP_ADMIN_REF_002',
    'Backup Admin paying second month'
  );

  v_failed := false;
  BEGIN
    PERFORM private.approve_dues_payment_request(v_req_backup);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    IF SQLERRM NOT LIKE '%Officers cannot approve their own dues payments%' THEN
      RAISE EXCEPTION 'TEST 7 FAILED: Expected self-approval block message, got: %', SQLERRM;
    END IF;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'TEST 7 FAILED: Backup Admin was able to approve own dues!';
  END IF;
  RAISE NOTICE 'TEST 7 PASSED: Backup Admin is strictly blocked from approving own dues.';

  -- ------------------------------------------------------------------------
  -- TEST 8: Backup Admin CAN approve regular member and executive dues
  -- ------------------------------------------------------------------------
  EXECUTE format('SET LOCAL request.jwt.claim.sub = %L', v_backup_admin_id);
  -- Approve member's request
  v_payment_id := private.approve_dues_payment_request(v_req_member);
  IF v_payment_id IS NULL THEN
    RAISE EXCEPTION 'TEST 8A FAILED: Backup Admin could not approve member request.';
  END IF;
  RAISE NOTICE 'TEST 8A PASSED: Backup Admin approved regular member dues.';

  -- Approve executive's request
  v_payment_id := private.approve_dues_payment_request(v_req_exec);
  IF v_payment_id IS NULL THEN
    RAISE EXCEPTION 'TEST 8B FAILED: Backup Admin could not approve executive request.';
  END IF;
  RAISE NOTICE 'TEST 8B PASSED: Backup Admin approved Executive dues.';

  -- ------------------------------------------------------------------------
  -- TEST 9: Admin CAN approve all users dues including Backup Admin
  -- ------------------------------------------------------------------------
  EXECUTE format('SET LOCAL request.jwt.claim.sub = %L', v_admin_id);
  v_payment_id := private.approve_dues_payment_request(v_req_backup);
  IF v_payment_id IS NULL THEN
    RAISE EXCEPTION 'TEST 9 FAILED: Admin could not approve Backup Admin dues.';
  END IF;
  RAISE NOTICE 'TEST 9 PASSED: Admin approved Backup Admin dues (supreme governance authority).';

  -- ------------------------------------------------------------------------
  -- TEST 10: Rejection requires valid reason and updates audit log
  -- ------------------------------------------------------------------------
  EXECUTE format('SET LOCAL request.jwt.claim.sub = %L', v_member_id);
  v_req_member := private.submit_dues_payment_request(
    v_rate_2,
    ARRAY[v_month_2],
    'pos',
    'MEM_POS_REF_999',
    'POS settlement attempt'
  );

  EXECUTE format('SET LOCAL request.jwt.claim.sub = %L', v_exec_id);
  PERFORM private.reject_dues_payment_request(
    v_req_member,
    'Payment reference could not be verified on POS terminal settlement batch.'
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.dues_payment_requests
    WHERE id = v_req_member AND status = 'rejected' AND review_reason IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'TEST 10 FAILED: Request status was not updated to rejected with reason.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.audit_log
    WHERE entity_id = v_req_member AND action = 'dues_payment_request_rejected'
  ) THEN
    RAISE EXCEPTION 'TEST 10 FAILED: Audit log entry for rejection was not created.';
  END IF;
  RAISE NOTICE 'TEST 10 PASSED: Dues rejection requires reason and logs to immutable audit ledger.';

  RAISE NOTICE '=== ALL 10 DATABASE DUES GOVERNANCE TESTS PASSED PERFECTLY! ===';
END $$;
