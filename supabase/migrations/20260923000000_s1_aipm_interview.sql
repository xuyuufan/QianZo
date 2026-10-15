-- S1-01: private AIPM interview storage. One session per project, append-only
-- messages. The transcript is never exposed through the Data API and the
-- runtime role only gets SELECT plus column-scoped INSERT.
create table app.aipm_sessions (
  id uuid primary key,
  project_id uuid not null references app.projects(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint aipm_sessions_project_unique unique (project_id)
);

create table app.aipm_messages (
  id uuid primary key,
  session_id uuid not null references app.aipm_sessions(id) on delete restrict,
  -- Server-assigned position inside the session. `now()` reports the
  -- transaction timestamp, so two messages written by one transaction would tie
  -- on created_at; the explicit sequence keeps the transcript order stable.
  sequence integer not null,
  role text not null,
  content text not null,
  payload jsonb,
  created_at timestamptz not null default now(),
  constraint aipm_messages_session_sequence_unique unique (session_id, sequence),
  constraint aipm_messages_role_check check (role in ('USER', 'ASSISTANT')),
  constraint aipm_messages_sequence_check check (sequence > 0),
  constraint aipm_messages_content_check check (char_length(content) between 1 and 8000),
  constraint aipm_messages_payload_check check (
    payload is null or jsonb_typeof(payload) = 'object'
  )
);

revoke all on app.aipm_sessions from public, anon, authenticated;
revoke all on app.aipm_messages from public, anon, authenticated;

grant select on app.aipm_sessions to qianzo_runtime;
grant insert (id, project_id) on app.aipm_sessions to qianzo_runtime;

grant select on app.aipm_messages to qianzo_runtime;
-- No UPDATE or DELETE: the transcript is append-only for the runtime role.
grant insert (id, session_id, sequence, role, content, payload) on app.aipm_messages to qianzo_runtime;
