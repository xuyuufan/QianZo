create schema if not exists app;

revoke all on schema app from public;
revoke all on schema app from anon;
revoke all on schema app from authenticated;
revoke create on schema public from public;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'qianzo_runtime') then
    create role qianzo_runtime
      login
      nosuperuser
      nocreatedb
      nocreaterole
      noinherit
      noreplication
      nobypassrls;
  else
    alter role qianzo_runtime
      login
      nosuperuser
      nocreatedb
      nocreaterole
      noinherit
      noreplication
      nobypassrls;
  end if;
end
$$;

create table app.users (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_display_name_check check (
    char_length(display_name) between 1 and 80
    and display_name = btrim(display_name)
  ),
  constraint users_status_check check (status in ('ACTIVE', 'DISABLED'))
);

create table app.user_roles (
  user_id uuid not null references app.users(id) on delete restrict,
  role text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role),
  constraint user_roles_role_check check (role in ('ENTERPRISE', 'BUILDER'))
);

create table app.projects (
  id uuid primary key,
  owner_id uuid not null references app.users(id) on delete restrict,
  title text not null,
  original_requirement text not null default '',
  status text not null default 'DRAFT',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_title_check check (
    char_length(title) between 1 and 120
    and title = btrim(title)
  ),
  constraint projects_original_requirement_check check (
    char_length(original_requirement) between 0 and 10000
  ),
  constraint projects_status_check check (status = 'DRAFT'),
  constraint projects_version_check check (version > 0)
);

create index projects_owner_created_at_idx
  on app.projects (owner_id, created_at desc);

revoke all on all tables in schema app from public, anon, authenticated;

grant connect on database postgres to qianzo_runtime;
grant usage on schema app to qianzo_runtime;

grant select on app.users to qianzo_runtime;
grant insert (id, display_name) on app.users to qianzo_runtime;
grant update (display_name, updated_at) on app.users to qianzo_runtime;

grant select on app.user_roles to qianzo_runtime;
grant insert (user_id, role) on app.user_roles to qianzo_runtime;

grant select on app.projects to qianzo_runtime;
grant insert (id, owner_id, title, original_requirement) on app.projects to qianzo_runtime;
grant update (title, original_requirement, version, updated_at) on app.projects to qianzo_runtime;
