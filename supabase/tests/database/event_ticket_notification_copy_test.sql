begin;

select no_plan();
set local role postgres;

with cases (
  ordinal,
  case_name,
  action,
  before_data,
  after_data,
  reason,
  expected_title,
  expected_body
) as (
  values
    (
      1,
      'recorded sale',
      'event_ticket_sale_recorded',
      null::jsonb,
      '{"quantity":10,"amount_ngn":50000,"title":"Event Test"}'::jsonb,
      'Ticket sale recorded',
      'Ticket sale recorded',
      '10 ticket(s) (₦50,000) recorded for Event Test.'
    ),
    (
      2,
      'approved sale',
      'event_ticket_sale_verified',
      '{"quantity":10,"amount_ngn":50000}'::jsonb,
      '{"decision":"approved","reason":null,"title":"Event Test"}'::jsonb,
      'Event ticket sale approved',
      'Ticket sale approved',
      '10 ticket(s) (₦50,000) for Event Test were approved.'
    ),
    (
      3,
      'cancelled sale',
      'event_ticket_sale_verified',
      '{"quantity":2,"amount_ngn":8000}'::jsonb,
      '{"decision":"cancelled","reason":"Duplicate sale","title":"Event Test"}'::jsonb,
      'Event ticket sale cancelled',
      'Ticket sale cancelled',
      '2 ticket(s) (₦8,000) for Event Test were cancelled: Duplicate sale.'
    ),
    (
      4,
      'rejected sale',
      'event_ticket_sale_verified',
      '{"quantity":1,"amount_ngn":4000}'::jsonb,
      '{"decision":"rejected","reason":"Payment could not be confirmed","title":"Event Test"}'::jsonb,
      'Event ticket sale rejected',
      'Ticket sale rejected',
      '1 ticket(s) (₦4,000) for Event Test was rejected: Payment could not be confirmed.'
    ),
    (
      5,
      'refunded sale',
      'event_ticket_sale_refunded',
      '{"quantity":2,"amount_ngn":8000}'::jsonb,
      '{"quantity":2,"amount_ngn":8000,"title":"Event Test"}'::jsonb,
      'Customer requested refund',
      'Ticket sale refunded',
      '2 ticket(s) (₦8,000) for Event Test were refunded: Customer requested refund.'
    ),
    (
      6,
      'edited sale',
      'event_ticket_sale_edited',
      '{"quantity":10,"amount_ngn":50000}'::jsonb,
      '{"quantity":8,"title":"Event Test"}'::jsonb,
      'Corrected quantity',
      'Ticket sale updated',
      'Ticket sale for Event Test was updated from 10 to 8 ticket(s) (₦50,000).'
    ),
    (
      7,
      'created tier',
      'event_ticket_tier_created',
      null::jsonb,
      '{"name":"Early Bird","price_ngn":5000,"title":"Event Test"}'::jsonb,
      'Tier created',
      'Ticket tier created',
      'Ticket tier "Early Bird" (₦5,000) was created for Event Test.'
    ),
    (
      8,
      'updated tier',
      'event_ticket_tier_updated',
      '{"name":"Early Bird","price_ngn":4000}'::jsonb,
      '{"name":"Early Bird","price_ngn":5000,"title":"Event Test"}'::jsonb,
      'Tier updated',
      'Ticket tier updated',
      'Ticket tier "Early Bird" (₦5,000) was updated for Event Test.'
    ),
    (
      9,
      'retired tier',
      'event_ticket_tier_retired',
      '{"name":"Early Bird","price_ngn":5000}'::jsonb,
      '{"retired_at":"2026-11-06T00:00:00Z","name":"Early Bird","title":"Event Test"}'::jsonb,
      'Tier retired',
      'Ticket tier retired',
      'Ticket tier "Early Bird" was retired for Event Test.'
    )
), copies as (
  select cases.ordinal, cases.case_name, cases.expected_title, cases.expected_body,
         notification_copy.title, notification_copy.officer_body
  from cases
  cross join lateral private.build_audit_notification_copy(
    pg_catalog.jsonb_populate_record(
      null::public.audit_log,
      pg_catalog.jsonb_build_object(
        'action', cases.action,
        'entity_type', case
          when cases.action like 'event_ticket_tier_%' then 'event_ticket_tier'
          else 'event_ticket_sale'
        end,
        'entity_id', '00000000-0000-0000-0000-000000000001'::uuid,
        'before_data', cases.before_data,
        'after_data', cases.after_data,
        'reason', cases.reason
      )
    )
  ) as notification_copy
)
select ok(
  copies.title = copies.expected_title
  and copies.officer_body = copies.expected_body,
  copies.case_name || ' has accurate action-specific notification copy'
)
from copies
order by copies.ordinal;

select * from finish();
rollback;
