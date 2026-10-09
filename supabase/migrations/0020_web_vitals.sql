-- =============================================================================
-- 0020_web_vitals.sql
--
-- Field Core Web Vitals samples from the browser. Read through the service role
-- (the collector route); RLS on with no policies keeps it staff/admin-only.
-- =============================================================================

create table web_vitals (
  id          bigserial primary key,
  metric      text not null,
  value       double precision not null,
  rating      text,
  path        text,
  created_at  timestamptz not null default now()
);

create index web_vitals_metric_created_idx on web_vitals (metric, created_at desc);

alter table web_vitals enable row level security;