-- Keep the existing hosted Supabase Cron worker schedule represented in source.
-- The URL and bearer token remain in Vault; a missing secret safely results in
-- no HTTP request until deployment configuration is complete.
select cron.unschedule(jobid)
from cron.job
where jobname = 'carpenters-notification-outbox';

select cron.schedule(
  'carpenters-notification-outbox',
  '* * * * *',
  $cron$
    select net.http_post(
      url := worker.worker_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || token.cron_secret
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 15000
    )
    from (
      select decrypted_secret as worker_url
      from vault.decrypted_secrets
      where name = 'notification_worker_url'
        and decrypted_secret ~ '^https://[^/]+/api/internal/notifications/process-outbox$'
    ) as worker
    cross join (
      select decrypted_secret as cron_secret
      from vault.decrypted_secrets
      where name = 'notification_cron_secret'
        and nullif(btrim(decrypted_secret), '') is not null
    ) as token;
  $cron$
);
