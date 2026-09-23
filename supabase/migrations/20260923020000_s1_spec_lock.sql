-- S1-03: reference budget and the locked scope.
--   * Budgets are either entirely absent or a complete, validated range.
--   * Locking freezes the reviewed scope: title, original requirement, budget and
--     the current spec pointer can no longer change, and the locked pointer can
--     never be cleared or replaced.
alter table app.projects
  add column budget_min_minor bigint,
  add column budget_max_minor bigint,
  add column currency text,
  add column locked_spec_version_id uuid,
  add column locked_at timestamptz,
  add constraint projects_budget_check check (
    (budget_min_minor is null and budget_max_minor is null and currency is null)
    or (
      budget_min_minor is not null
      and budget_max_minor is not null
      and currency is not null
      and budget_min_minor >= 0
      and budget_max_minor >= budget_min_minor
      and char_length(currency) = 3
      and currency = upper(currency)
    )
  ),
  -- The pointer and its timestamp exist as a pair.
  add constraint projects_locked_pair_check check (
    (locked_spec_version_id is null and locked_at is null)
    or (locked_spec_version_id is not null and locked_at is not null)
  ),
  -- A locked project must carry a complete reference budget.
  add constraint projects_locked_budget_check check (
    locked_at is null or budget_min_minor is not null
  ),
  -- The locked version must belong to this project.
  add constraint projects_locked_spec_version_fk
    foreign key (id, locked_spec_version_id)
    references app.spec_versions (project_id, id)
    on delete restrict;

-- Narrow guard instead of a state machine: once locked, the frozen columns and
-- the locked pointer cannot be rewritten, not even by a service bug. The version
-- token and updated_at stay writable so later actions can still record changes.
create function app.projects_guard_locked_scope()
returns trigger
language plpgsql
as $$
begin
  if old.locked_spec_version_id is not null then
    if new.locked_spec_version_id is distinct from old.locked_spec_version_id
      or new.locked_at is distinct from old.locked_at
    then
      raise exception 'the locked spec pointer cannot be changed'
        using errcode = '23514', constraint = 'projects_locked_pointer_immutable';
    end if;

    if new.title is distinct from old.title
      or new.original_requirement is distinct from old.original_requirement
      or new.budget_min_minor is distinct from old.budget_min_minor
      or new.budget_max_minor is distinct from old.budget_max_minor
      or new.currency is distinct from old.currency
      or new.current_spec_version_id is distinct from old.current_spec_version_id
    then
      raise exception 'the locked scope cannot be rewritten'
        using errcode = '23514', constraint = 'projects_locked_scope_immutable';
    end if;
  end if;

  return new;
end
$$;

create trigger projects_guard_locked_scope
  before update on app.projects
  for each row
  execute function app.projects_guard_locked_scope();

-- Column-scoped grants: the runtime role may fill the budget and lock one
-- version, but still cannot touch owner_id or clear a locked pointer in a way
-- the trigger would not reject anyway.
grant update (budget_min_minor, budget_max_minor, currency, locked_spec_version_id, locked_at)
  on app.projects to qianzo_runtime;
