-- -----------------------------------------------------------------------------
-- promo_offerings() gains branch_name, so the public page can name the branch a
-- promo belongs to instead of leaving the customer to guess.
--
-- A promo is tied to one branch (promotions.branch_id is not null and deletes are
-- restricted), so this is a display concern, not a rule: nothing here changes what a
-- promo costs or what create_booking() will accept. It is a left join anyway, because
-- the fallback ("Semua cabang") has to survive a branch row that is gone rather than
-- take the whole offer list down with it.
--
-- The function is dropped rather than replaced: adding a column to returns table(...)
-- changes the return type, and create or replace refuses that with "cannot change
-- return type of existing function". No cascade on purpose — nothing in the database
-- depends on promo_offerings(), and a cascade would quietly drop a real dependent if
-- that ever stopped being true. It also means a lock held by a live request would show
-- up as a failed apply instead of as a dropped object.
-- -----------------------------------------------------------------------------

drop function if exists public.promo_offerings();

create function public.promo_offerings()
returns table(
  promotion_id      text,
  name              text,
  description       text,
  branch_id         text,
  branch_name       text,
  facility_type_id  text,
  facility_name     text,
  duration_minutes  integer,
  promo_price       integer,
  normal_price      integer,
  bonus_snack_id    text,
  bonus_snack_name  text,
  bonus_quantity    integer
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select p.promotion_id,
         p.name,
         p.description,
         p.branch_id,
         b.name,
         i.facility_type_id,
         f.name,
         i.duration_minutes,
         i.price,
         public.calculate_price(p.branch_id, i.facility_type_id, i.duration_minutes),
         i.bonus_snack_id,
         s.name,
         coalesce(i.bonus_quantity, 0)
    from promotions p
    join promotion_items i on i.promotion_id = p.promotion_id
    join facility_types f on f.facility_type_id = i.facility_type_id
    left join snacks s on s.snack_id = i.bonus_snack_id
    left join branches b on b.branch_id = p.branch_id
   where p.status = 'ACTIVE'
   order by p.name, i.duration_minutes;
$$;
