-- S1-02: immutable reviewed spec versions. Versions are append-only; the
-- project keeps a pointer to the current one. A candidate message can be
-- adopted at most once, which UNIQUE(source_message_id) enforces.
create table app.spec_versions (
  id uuid primary key,
  project_id uuid not null references app.projects(id) on delete restrict,
  version_no integer not null,
  schema_version integer not null,
  content jsonb not null,
  created_by uuid not null references app.users(id) on delete restrict,
  source_message_id uuid references app.aipm_messages(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint spec_versions_project_version_unique unique (project_id, version_no),
  -- Composite target for the project pointer: a project may only point at a
  -- version of its own, not merely at an existing uuid.
  constraint spec_versions_project_id_unique unique (project_id, id),
  constraint spec_versions_source_message_unique unique (source_message_id),
  constraint spec_versions_version_no_check check (version_no > 0),
  constraint spec_versions_schema_version_check check (schema_version = 1),
  constraint spec_versions_content_check check (jsonb_typeof(content) = 'object')
);

alter table app.projects
  add column current_spec_version_id uuid,
  add constraint projects_current_spec_version_fk
    foreign key (id, current_spec_version_id)
    references app.spec_versions (project_id, id)
    on delete restrict;

revoke all on app.spec_versions from public, anon, authenticated;

-- Append-only for the runtime role: no UPDATE and no DELETE on history.
grant select on app.spec_versions to qianzo_runtime;
grant insert (id, project_id, version_no, schema_version, content, created_by, source_message_id)
  on app.spec_versions to qianzo_runtime;

-- Column-scoped grant for the current-version pointer only; owner_id and the
-- remaining project columns stay out of reach.
grant update (current_spec_version_id, version, updated_at) on app.projects to qianzo_runtime;
