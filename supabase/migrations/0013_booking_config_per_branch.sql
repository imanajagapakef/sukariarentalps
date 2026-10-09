-- Give every active branch its own booking_config row.
--
-- booking_config held a single row with branch_id NULL. get_booking_config()
-- already resolves branch-specific rows first and falls back to the NULL row
-- (`where branch_id = p_branch_id or branch_id is null ... nulls last`), so the
-- schema was ready for per-branch settings — there just were none. With two
-- active branches and no per-branch row, the admin booking-config API
-- (/api/admin/booking-config) could only ever edit the shared default, and the
-- Stitch branch-detail screens show per-branch copy that has nothing to read.
--
-- Values are cloned from CFG-DEFAULT, so this changes no behaviour: the
-- fallback row is untouched and still wins for any branch without its own row.
-- The point is that the numbers are now editable per branch
-- (minimum/maximum duration, booking interval, cleaning buffer, payment
-- deadline, extension rules, advance window, late tolerance) instead of being
-- global.

insert into booking_config (
  config_id, branch_id,
  minimum_duration_minutes, maximum_duration_minutes, booking_interval_minutes,
  cleaning_duration_minutes, payment_deadline_minutes,
  extension_interval_minutes, minimum_extension_minutes,
  advance_booking_days, late_tolerance_minutes,
  data_status
)
select
  'CFG-' || b.branch_id,
  b.branch_id,
  d.minimum_duration_minutes, d.maximum_duration_minutes, d.booking_interval_minutes,
  d.cleaning_duration_minutes, d.payment_deadline_minutes,
  d.extension_interval_minutes, d.minimum_extension_minutes,
  d.advance_booking_days, d.late_tolerance_minutes,
  d.data_status
from branches b
cross join lateral (
  select * from booking_config where branch_id is null order by config_id limit 1
) d
where b.status = 'ACTIVE'
  and not exists (
    select 1 from booking_config c where c.branch_id = b.branch_id
  );
