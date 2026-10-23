-- =============================================================================
-- 0033_oversell_client_error.sql
--
-- An oversell was rejected, but the customer found out the wrong way.
--
-- apply_inventory_movement() has always refused to let a movement drive stock
-- negative, and it does so atomically: the UPDATE re-reads the row under a READ
-- COMMITTED lock, so two concurrent buyers cannot both take the same unit. That
-- part was always right.
--
-- What was wrong was the shape of the refusal. The trigger raised without an
-- errcode, so it carried SQLSTATE P0001 -- which is the default for *every*
-- plpgsql `raise exception` that does not name one. The API decides 400 vs 500
-- from that code:
--
--     const CLIENT_ERROR_CODES = new Set(["22023", "23P01", "23505", "23514"]);
--
-- P0001 is not in it, so a customer who ordered more snacks than existed got a
-- 500 with the raw string "stock for SNK-002 would go negative". Every other
-- guard in create_booking() passes `using errcode = '22023'`; this one, defined
-- back in 0002, was the only exception to the rule.
--
-- Adding P0001 to CLIENT_ERROR_CODES would have been the one-line fix, and it
-- would have been wrong: P0001 is what any future errcode-less raise would also
-- produce, so a genuine internal bug would silently start answering 400 with
-- its raw message attached. The code has to be set here, at the source, where
-- the meaning of this particular exception is known.
--
-- The message now names the snack instead of its id, because "SNK-002" means
-- nothing to the person reading it. It deliberately does NOT quote a remaining
-- count: that figure would be stale before the customer finished reading it.
-- The form re-reads stock after a failure anyway.
--
-- No schema change. The trigger itself is untouched -- it is already bound to
-- this function name, and replacing the body keeps that binding.
-- =============================================================================

create or replace function public.apply_inventory_movement()
returns trigger
language plpgsql
as $$
declare
  new_stock integer;
  new_name  text;
begin
  update snacks
     set stock = stock + new.qty_delta
   where snack_id = new.snack_id
  returning stock, name into new_stock, new_name;

  if new_stock is null then
    -- Client-supplied id, same class of fault as the oversell below, so it gets
    -- the same treatment: a 400 the caller can act on, not a 500.
    raise exception 'Snack % tidak ditemukan', new.snack_id using errcode = '22023';
  end if;

  if new_stock < 0 then
    raise exception 'Stok % tidak cukup', coalesce(new_name, new.snack_id)
      using errcode = '22023';
  end if;

  new.stock_after := new_stock;
  return new;
end;
$$;
