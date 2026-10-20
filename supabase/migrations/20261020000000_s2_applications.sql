-- S2-01: Builder applications and enterprise selection.
-- Only fields needed for applying and selecting are introduced here.

create table app.applications (
  id uuid primary key,
  project_id uuid not null references app.projects(id) on delete restrict,
  builder_id uuid not null references app.users(id) on delete restrict,
  statement text not null,
  status text not null default 'SUBMITTED',
  spec_version_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint applications_project_builder_unique unique (project_id, builder_id),
  constraint applications_project_id_unique unique (project_id, id),
  constraint applications_spec_version_fk
    foreign key (project_id, spec_version_id)
    references app.spec_versions (project_id, id)
    on delete restrict,
  constraint applications_statement_check check (
    char_length(statement) between 1 and 2000
    and statement = btrim(statement)
    and statement ~ '[^[:space:]]'
  ),
  constraint applications_status_check check (
    status in ('SUBMITTED', 'SELECTED', 'ENGAGED', 'REJECTED')
  )
);

create unique index applications_one_selected_per_project_unique
  on app.applications (project_id)
  where status in ('SELECTED', 'ENGAGED');

-- Keep the application status append-only after selection. The project state
-- and selected pointer are changed in the same service transaction.
create function app.applications_guard_selected()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('SELECTED', 'ENGAGED')
    and new.status is distinct from old.status
  then
    raise exception 'a selected application cannot be reverted'
      using errcode = '23514', constraint = 'applications_selected_immutable';
  end if;
  return new;
end
$$;

create trigger applications_guard_selected
  before update on app.applications
  for each row
  execute function app.applications_guard_selected();

alter table app.projects
  add column selected_application_id uuid,
  drop constraint projects_status_check,
  add constraint projects_status_check
    check (status in ('DRAFT', 'OPEN', 'AWAITING_BUILDER')),
  drop constraint projects_published_pair_check,
  add constraint projects_published_pair_check check (
    (
      status = 'DRAFT'
      and published_at is null
      and published_spec_snapshot is null
      and selected_application_id is null
    )
    or (
      status = 'OPEN'
      and published_at is not null
      and published_spec_snapshot is not null
      and jsonb_typeof(published_spec_snapshot) = 'object'
      and locked_spec_version_id is not null
      and locked_at is not null
      and budget_min_minor is not null
      and selected_application_id is null
    )
    or (
      status = 'AWAITING_BUILDER'
      and published_at is not null
      and published_spec_snapshot is not null
      and jsonb_typeof(published_spec_snapshot) = 'object'
      and locked_spec_version_id is not null
      and locked_at is not null
      and budget_min_minor is not null
      and selected_application_id is not null
    )
  ),
  add constraint projects_selected_application_fk
    foreign key (id, selected_application_id)
    references app.applications (project_id, id)
    on delete no action
    deferrable initially deferred;

-- A published project may move only from OPEN to AWAITING_BUILDER. Snapshot,
-- timestamp, locked scope and an existing selection remain immutable in every
-- published state, including AWAITING_BUILDER.
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

  if old.published_at is not null then
    if new.published_at is distinct from old.published_at
      or new.published_spec_snapshot is distinct from old.published_spec_snapshot
    then
      raise exception 'the published snapshot cannot be rewritten'
        using errcode = '23514', constraint = 'projects_published_snapshot_immutable';
    end if;

    if new.status is distinct from old.status
      and not (old.status = 'OPEN' and new.status = 'AWAITING_BUILDER')
    then
      raise exception 'a published project cannot leave its current stage'
        using errcode = '23514', constraint = 'projects_published_status_immutable';
    end if;
  end if;

  if old.selected_application_id is not null
    and new.selected_application_id is distinct from old.selected_application_id
  then
    raise exception 'the selected application cannot be changed'
      using errcode = '23514', constraint = 'projects_selected_application_immutable';
  end if;

  return new;
end
$$;

revoke all on app.applications from public, anon, authenticated;
grant select on app.applications to qianzo_runtime;
-- Identity, status, Spec pointer and timestamps are server controlled. Runtime
-- can only insert the fields the application action has validated.
grant insert (id, project_id, builder_id, statement, spec_version_id)
  on app.applications to qianzo_runtime;
grant update (status, updated_at) on app.applications to qianzo_runtime;
grant update (status, selected_application_id, version, updated_at)
  on app.projects to qianzo_runtime;
