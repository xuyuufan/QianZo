-- S2-02: Builder mock deposit and atomic project start. This adds only the
-- payment binding and milestone snapshot needed for the current start action.

alter table app.payments
  drop constraint payments_project_purpose_unique,
  drop constraint payments_purpose_check,
  add column application_id uuid,
  add constraint payments_purpose_application_check check (
    (purpose = 'ENTERPRISE_DEPOSIT' and application_id is null)
    or (purpose = 'BUILDER_DEPOSIT' and application_id is not null)
  ),
  add constraint payments_project_application_fk
    foreign key (project_id, application_id)
    references app.applications (project_id, id)
    on delete restrict;

create unique index payments_enterprise_project_unique
  on app.payments (project_id)
  where purpose = 'ENTERPRISE_DEPOSIT';

create unique index payments_builder_application_unique
  on app.payments (application_id)
  where purpose = 'BUILDER_DEPOSIT';

create table app.milestones (
  id uuid primary key,
  project_id uuid not null references app.projects(id) on delete restrict,
  spec_version_id uuid not null,
  spec_milestone_id text not null,
  position integer not null,
  title text not null,
  description text not null,
  due_after_days integer not null,
  deliverable_ids jsonb not null,
  deliverables jsonb not null,
  acceptance_criteria jsonb not null,
  status text not null,
  deadline timestamptz not null,
  created_at timestamptz not null default now(),
  constraint milestones_project_spec_fk
    foreign key (project_id, spec_version_id)
    references app.spec_versions (project_id, id)
    on delete restrict,
  constraint milestones_project_position_unique unique (project_id, position),
  constraint milestones_project_spec_milestone_unique unique (project_id, spec_milestone_id),
  constraint milestones_position_check check (position > 0),
  constraint milestones_source_id_check check (
    char_length(spec_milestone_id) between 1 and 64
  ),
  constraint milestones_title_check check (
    char_length(title) between 1 and 200 and title = btrim(title)
  ),
  constraint milestones_description_check check (char_length(description) between 1 and 2000),
  constraint milestones_due_after_days_check check (due_after_days between 1 and 3650),
  constraint milestones_deliverable_ids_check check (
    jsonb_typeof(deliverable_ids) = 'array'
  ),
  constraint milestones_deliverables_check check (
    jsonb_typeof(deliverables) = 'array'
  ),
  constraint milestones_acceptance_criteria_check check (
    jsonb_typeof(acceptance_criteria) = 'array'
    and jsonb_array_length(acceptance_criteria) between 1 and 20
  ),
  constraint milestones_status_check check (status in ('PENDING', 'IN_PROGRESS'))
);

-- Runtime can create a milestone snapshot at start and read it back. Snapshot
-- fields have no UPDATE grant and are also protected by this narrow trigger.
create function app.milestones_guard_snapshot_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.project_id is distinct from old.project_id
    or new.spec_version_id is distinct from old.spec_version_id
    or new.spec_milestone_id is distinct from old.spec_milestone_id
    or new.position is distinct from old.position
    or new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.due_after_days is distinct from old.due_after_days
    or new.deliverable_ids is distinct from old.deliverable_ids
    or new.deliverables is distinct from old.deliverables
    or new.acceptance_criteria is distinct from old.acceptance_criteria
    or new.deadline is distinct from old.deadline
    or new.created_at is distinct from old.created_at
  then
    raise exception 'milestone scope snapshot cannot be rewritten'
      using errcode = '23514', constraint = 'milestones_snapshot_immutable';
  end if;
  return new;
end
$$;

create trigger milestones_guard_snapshot_immutable
  before update on app.milestones
  for each row
  execute function app.milestones_guard_snapshot_immutable();

alter table app.projects
  add column started_at timestamptz,
  drop constraint projects_status_check,
  add constraint projects_status_check
    check (status in ('DRAFT', 'OPEN', 'AWAITING_BUILDER', 'IN_PROGRESS')),
  drop constraint projects_published_pair_check,
  add constraint projects_published_pair_check check (
    (
      status = 'DRAFT'
      and published_at is null
      and published_spec_snapshot is null
      and selected_application_id is null
      and started_at is null
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
      and started_at is null
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
      and started_at is null
    )
    or (
      status = 'IN_PROGRESS'
      and published_at is not null
      and published_spec_snapshot is not null
      and jsonb_typeof(published_spec_snapshot) = 'object'
      and locked_spec_version_id is not null
      and locked_at is not null
      and budget_min_minor is not null
      and selected_application_id is not null
      and started_at is not null
    )
  );

-- Preserve the S1/S2-01 locked-scope and published-snapshot guards, adding only
-- the narrow AWAITING_BUILDER -> IN_PROGRESS transition and one-time start time.
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
      and not (
        (old.status = 'OPEN' and new.status = 'AWAITING_BUILDER')
        or (old.status = 'AWAITING_BUILDER' and new.status = 'IN_PROGRESS')
      )
    then
      raise exception 'a published project cannot leave its current stage'
        using errcode = '23514', constraint = 'projects_published_status_immutable';
    end if;
  end if;

  if old.started_at is not null then
    if new.started_at is distinct from old.started_at then
      raise exception 'project start time cannot be changed'
        using errcode = '23514', constraint = 'projects_started_at_immutable';
    end if;
  elsif new.started_at is not null
    and not (old.status = 'AWAITING_BUILDER' and new.status = 'IN_PROGRESS')
  then
    raise exception 'project can only receive a start time when it starts'
      using errcode = '23514', constraint = 'projects_started_at_stage';
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

create or replace function app.applications_guard_selected()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'ENGAGED' and new.status is distinct from 'ENGAGED' then
    raise exception 'an engaged application cannot be reverted'
      using errcode = '23514', constraint = 'applications_selected_immutable';
  end if;

  if old.status = 'SELECTED'
    and new.status is distinct from 'SELECTED'
    and new.status is distinct from 'ENGAGED'
  then
    raise exception 'a selected application can only be engaged'
      using errcode = '23514', constraint = 'applications_selected_immutable';
  end if;

  return new;
end
$$;

revoke all on app.milestones from public, anon, authenticated;
grant select on app.milestones to qianzo_runtime;
grant insert (
  id,
  project_id,
  spec_version_id,
  spec_milestone_id,
  position,
  title,
  description,
  due_after_days,
  deliverable_ids,
  deliverables,
  acceptance_criteria,
  status,
  deadline
) on app.milestones to qianzo_runtime;

grant insert (application_id) on app.payments to qianzo_runtime;
grant update (started_at) on app.projects to qianzo_runtime;
