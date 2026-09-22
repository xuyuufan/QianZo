-- Drizzle lists defaulted columns explicitly as DEFAULT in INSERT statements.
-- PostgreSQL therefore requires table-level INSERT while updates stay column-limited.
grant insert on app.users to qianzo_runtime;
grant insert on app.user_roles to qianzo_runtime;
grant insert on app.projects to qianzo_runtime;
