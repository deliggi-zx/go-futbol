-- Limpieza automática de Storage: videos de intro de MVP (14 días post-torneo)
-- y fotos de galería (30 días post-torneo). Solo aplica a torneos finalizados
-- después del cutoff hardcodeado en la Edge Function cleanup-storage — los
-- valores de acceso (URL del proyecto, anon key) NO se hardcodean acá, se
-- referencian desde Supabase Vault (vault.create_secret, ya cargados aparte).

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create extension if not exists pg_net;

select cron.schedule(
  'cleanup-storage-daily',
  '0 6 * * *', -- todos los días a las 06:00 UTC
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/cleanup-storage',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) as request_id;
  $$
);
