-- Schedule monthly club overview generation on the 1st of every month at 06:00 UTC (07:00 WAT).
-- Follows the existing Vault secret guardrail: missing secrets safely send no HTTP request.

select cron.unschedule(jobid)
from cron.job
where jobname = 'carpenters-monthly-overview';

select cron.schedule(
  'carpenters-monthly-overview',
  '0 6 1 * *',
  $cron$
    select net.http_post(
      url := worker.worker_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || token.cron_secret
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 25000
    )
    from (
      select decrypted_secret as worker_url
      from vault.decrypted_secrets
      where name = 'monthly_overview_worker_url'
        and decrypted_secret ~ '^https://[^/]+/api/internal/reports/monthly-overview$'
    ) as worker
    cross join (
      select decrypted_secret as cron_secret
      from vault.decrypted_secrets
      where name = 'notification_cron_secret'
        and nullif(btrim(decrypted_secret), '') is not null
    ) as token;
  $cron$
);
