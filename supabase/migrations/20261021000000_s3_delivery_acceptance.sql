-- S3: immutable delivery and acceptance history, milestone progression, and
-- explicit final enterprise confirmation.

-- The composite unique key is required by the Submission -> Milestone FK.
-- Keep the current pointer nullable while the history table is created.
alter table app.milestones
  add column current_submission_id uuid,
  add constraint milestones_project_id_unique unique (project_id, id);

create table app.submissions (
  id uuid primary key,
  project_id uuid not null,
  milestone_id uuid not null,
  builder_id uuid not null references app.users(id) on delete restrict,
  sequence integer not null,
  submission_key uuid not null,
  summary text not null,
  links jsonb not null,
  created_at timestamptz not null default now(),
  constraint submissions_project_milestone_fk
    foreign key (project_id, milestone_id)
    references app.milestones (project_id, id)
    on delete no action deferrable initially deferred,
  constraint submissions_project_id_unique unique (project_id, id),
  constraint submissions_project_milestone_id_unique unique (project_id, milestone_id, id),
  constraint submissions_milestone_sequence_unique unique (milestone_id, sequence),
  constraint submissions_milestone_key_unique unique (milestone_id, submission_key),
  constraint submissions_sequence_check check (sequence > 0),
  constraint submissions_summary_check check (
    char_length(summary) between 1 and 4000
    and summary = btrim(summary)
    and summary ~ '[^[:space:]]'
  ),
  constraint submissions_links_check check (
    jsonb_typeof(links) = 'array'
    and jsonb_array_length(links) between 1 and 10
  )
);

alter table app.milestones
  add constraint milestones_current_submission_fk
    foreign key (project_id, id, current_submission_id)
    references app.submissions (project_id, milestone_id, id)
    on delete no action deferrable initially deferred,
  drop constraint milestones_status_check,
  add constraint milestones_status_check check (
    status in ('PENDING', 'IN_PROGRESS', 'IN_REVIEW', 'REVISION', 'APPROVED')
  );

create table app.submission_reviews (
  id uuid primary key,
  project_id uuid not null,
  milestone_id uuid not null,
  submission_id uuid not null unique,
  reviewer_id uuid not null references app.users(id) on delete restrict,
  outcome text not null,
  criteria_results jsonb not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint submission_reviews_submission_fk
    foreign key (project_id, milestone_id, submission_id)
    references app.submissions (project_id, milestone_id, id)
    on delete restrict,
  constraint submission_reviews_outcome_check check (outcome in ('PASS', 'FAIL')),
  constraint submission_reviews_criteria_check check (
    jsonb_typeof(criteria_results) = 'array'
    and jsonb_array_length(criteria_results) between 1 and 20
  ),
  constraint submission_reviews_reason_check check (
    (outcome = 'PASS' and reason is null)
    or (outcome = 'FAIL' and reason is not null and char_length(btrim(reason)) between 1 and 2000)
  )
);

create index submissions_project_milestone_created_idx
  on app.submissions (project_id, milestone_id, sequence);
create index submission_reviews_project_milestone_created_idx
  on app.submission_reviews (project_id, milestone_id, created_at, submission_id);

alter table app.projects
  add column completed_at timestamptz,
  drop constraint projects_status_check,
  add constraint projects_status_check
    check (status in ('DRAFT', 'OPEN', 'AWAITING_BUILDER', 'IN_PROGRESS', 'FINAL_REVIEW', 'COMPLETED')),
  drop constraint projects_published_pair_check,
  add constraint projects_published_pair_check check (
    (
      status = 'DRAFT'
      and published_at is null
      and published_spec_snapshot is null
      and selected_application_id is null
      and started_at is null
      and completed_at is null
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
      and completed_at is null
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
      and completed_at is null
    )
    or (
      status in ('IN_PROGRESS', 'FINAL_REVIEW')
      and published_at is not null
      and published_spec_snapshot is not null
      and jsonb_typeof(published_spec_snapshot) = 'object'
      and locked_spec_version_id is not null
      and locked_at is not null
      and budget_min_minor is not null
      and selected_application_id is not null
      and started_at is not null
      and completed_at is null
    )
    or (
      status = 'COMPLETED'
      and published_at is not null
      and published_spec_snapshot is not null
      and jsonb_typeof(published_spec_snapshot) = 'object'
      and locked_spec_version_id is not null
      and locked_at is not null
      and budget_min_minor is not null
      and selected_application_id is not null
      and started_at is not null
      and completed_at is not null
    )
  );

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
        or (old.status = 'IN_PROGRESS' and new.status = 'FINAL_REVIEW')
        or (old.status = 'FINAL_REVIEW' and new.status = 'COMPLETED')
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

  if old.completed_at is not null and new.completed_at is distinct from old.completed_at then
    raise exception 'project completion time cannot be changed'
      using errcode = '23514', constraint = 'projects_completed_at_immutable';
  elsif old.completed_at is null and new.completed_at is not null
    and not (old.status = 'FINAL_REVIEW' and new.status = 'COMPLETED')
  then
    raise exception 'project can only receive a completion time when it completes'
      using errcode = '23514', constraint = 'projects_completed_at_stage';
  end if;

  if new.status = 'FINAL_REVIEW' and old.status is distinct from 'FINAL_REVIEW' then
    if not exists (select 1 from app.milestones where project_id = old.id)
      or exists (
        select 1 from app.milestones
        where project_id = old.id and status <> 'APPROVED'
      )
    then
      raise exception 'all milestones must be approved before final review'
        using errcode = '23514', constraint = 'projects_final_review_requires_approved_milestones';
    end if;
  end if;

  if new.status = 'COMPLETED' and old.status is distinct from 'COMPLETED' then
    if not exists (select 1 from app.milestones where project_id = old.id)
      or exists (
        select 1 from app.milestones
        where project_id = old.id and status <> 'APPROVED'
      )
    then
      raise exception 'all milestones must be approved before project completion'
        using errcode = '23514', constraint = 'projects_completion_requires_approved_milestones';
    end if;
  end if;

  return new;
end
$$;

create or replace function app.milestones_guard_snapshot_immutable()
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

  if new.status is distinct from old.status and not (
    (old.status = 'PENDING' and new.status = 'IN_PROGRESS')
    or (old.status = 'IN_PROGRESS' and new.status = 'IN_REVIEW')
    or (old.status = 'IN_REVIEW' and new.status in ('REVISION', 'APPROVED'))
    or (old.status = 'REVISION' and new.status = 'IN_REVIEW')
  ) then
    raise exception 'milestone cannot leave its current stage'
      using errcode = '23514', constraint = 'milestones_status_transition';
  end if;

  return new;
end
$$;

revoke all on app.submissions, app.submission_reviews from public, anon, authenticated;
grant select, insert (
  id, project_id, milestone_id, builder_id, sequence, submission_key, summary, links
) on app.submissions to qianzo_runtime;
grant select, insert (
  id, project_id, milestone_id, submission_id, reviewer_id, outcome, criteria_results, reason
) on app.submission_reviews to qianzo_runtime;
grant update (current_submission_id, status) on app.milestones to qianzo_runtime;
grant update (completed_at) on app.projects to qianzo_runtime;
