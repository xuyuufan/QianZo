-- Two defaults of the runtime role are still too permissive for the S0 boundary:
--
-- 1. An existing qianzo_runtime may keep memberships from an earlier local
--    setup. NOINHERIT stops automatic inheritance but not SET ROLE, so the
--    application connection could assume the member role and bypass the DML
--    restrictions. Memberships are dropped instead.
-- 2. PostgreSQL grants TEMPORARY on a database to PUBLIC by default, so
--    revoking CREATE on the public schema is not enough to keep the runtime
--    role from creating temporary relations. TEMPORARY is revoked from PUBLIC
--    and kept only for the built-in Supabase service roles.
--
-- Both paths must also clear grants recorded directly on the reused role: a
-- database- or schema-level privilege in the role's own ACL survives a REVOKE
-- aimed at PUBLIC, which is why the role is revoked explicitly as well.

do $$
declare
  membership record;
  service_role text;
begin
  for membership in
    select parent.rolname as role_name
    from pg_auth_members
    join pg_roles parent on parent.oid = pg_auth_members.roleid
    join pg_roles member on member.oid = pg_auth_members.member
    where member.rolname = 'qianzo_runtime'
  loop
    execute format('revoke %I from qianzo_runtime', membership.role_name);
  end loop;

  execute format('revoke temporary, create on database %I from qianzo_runtime', current_database());
  revoke create on schema app from qianzo_runtime;
  revoke create on schema public from qianzo_runtime;

  execute format('revoke temporary on database %I from public', current_database());

  foreach service_role in array array[
    'authenticator',
    'dashboard_user',
    'pgbouncer',
    'supabase_auth_admin',
    'supabase_realtime_admin',
    'supabase_storage_admin'
  ] loop
    if exists (select 1 from pg_roles where rolname = service_role) then
      execute format('grant temporary on database %I to %I', current_database(), service_role);
    end if;
  end loop;
end
$$;
