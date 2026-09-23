-- A project points at its spec version while the version points back at the
-- project. The locked-scope guard forbids clearing the pointer, so with an
-- immediate check a project with history can never be removed at all.
--
-- These two constraints therefore use NO ACTION with a deferred check instead of
-- ON DELETE RESTRICT: RESTRICT is always evaluated immediately and ignores
-- DEFERRABLE, while NO ACTION is checked at commit. Nothing cascades, so history
-- is protected exactly as before; what changes is that the pointer row, its
-- history and the project can be removed together in one transaction.
-- Every other foreign key in the schema keeps ON DELETE RESTRICT.
alter table app.projects
  drop constraint projects_current_spec_version_fk,
  add constraint projects_current_spec_version_fk
    foreign key (id, current_spec_version_id)
    references app.spec_versions (project_id, id)
    on delete no action
    deferrable initially deferred;

alter table app.projects
  drop constraint projects_locked_spec_version_fk,
  add constraint projects_locked_spec_version_fk
    foreign key (id, locked_spec_version_id)
    references app.spec_versions (project_id, id)
    on delete no action
    deferrable initially deferred;
