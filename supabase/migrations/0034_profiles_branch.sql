-- Staff accounts are bound to exactly one branch. OWNER/ADMIN stay unbound
-- (they see every outlet). ponytail: single nullable column instead of a join
-- table — a staff asking to join two outlets is a future problem.
alter table public.profiles
  add column branch_id text references public.branches (branch_id) on update cascade;

-- STAFF must always carry a branch; OWNER/ADMIN must not. ponytail: split the
-- two directions so.branchless staff fail loudly, owner/admin drift is silent.
alter table public.profiles
  add constraint profiles_staff_needs_branch check (role <> 'STAFF' or branch_id is not null) not valid;

alter table public.profiles
  validate constraint profiles_staff_needs_branch;

alter table public.profiles
  add constraint profiles_branch_only_not_staff check (branch_id is null or role in ('STAFF', 'ADMIN')) not valid;

alter table public.profiles
  validate constraint profiles_branch_only_not_staff;
