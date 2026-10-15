-- S1-05: publishing a confirmed recruitment snapshot.
--   * The project gains the published snapshot and its timestamp.
--   * OPEN is only reachable with a locked scope, a published snapshot and a time.
--   * A published snapshot can never be rewritten (no unpublish, no republish).
alter table app.projects
  add column published_spec_snapshot jsonb,
  add column published_at timestamptz,
  drop constraint projects_status_check,
  add constraint projects_status_check check (status in ('DRAFT', 'OPEN')),
  add constraint projects_published_pair_check check (
    (status = 'DRAFT' and published_at is null and published_spec_snapshot is null)
    or (
      status = 'OPEN'
      and published_at is not null
      and published_spec_snapshot is not null
      and jsonb_typeof(published_spec_snapshot) = 'object'
      and locked_spec_version_id is not null
      and locked_at is not null
      and budget_min_minor is not null
    )
  );

-- Same narrow guard, extended: once published, the status and the published
-- snapshot are final. The frozen-scope rules from the lock migration stay.
create or replace function app.projects_guard_locked_scope()
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

  if old.status = 'OPEN' then
    if new.status is distinct from old.status
      or new.published_at is distinct from old.published_at
      or new.published_spec_snapshot is distinct from old.published_spec_snapshot
    then
      raise exception 'the published snapshot cannot be rewritten'
        using errcode = '23514', constraint = 'projects_published_snapshot_immutable';
    end if;
  end if;

  return new;
end
$$;

-- The publish transaction sets the state; nothing else may write these columns.
grant update (status, published_spec_snapshot, published_at) on app.projects to qianzo_runtime;
