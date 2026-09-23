-- S1-04: the enterprise mock deposit. One payment per project and purpose; the
-- payer, purpose and amount are written once by the server, and a successful
-- payment can never go back to PENDING or be retimed.
create table app.payments (
  id uuid primary key,
  project_id uuid not null references app.projects(id) on delete restrict,
  payer_id uuid not null references app.users(id) on delete restrict,
  purpose text not null,
  amount_minor bigint not null,
  currency text not null,
  status text not null default 'PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  succeeded_at timestamptz,
  constraint payments_project_purpose_unique unique (project_id, purpose),
  -- S1 only produces the enterprise deposit; the builder deposit arrives with a
  -- later slice and extends this check.
  constraint payments_purpose_check check (purpose = 'ENTERPRISE_DEPOSIT'),
  constraint payments_amount_check check (amount_minor > 0),
  constraint payments_currency_check check (
    char_length(currency) = 3 and currency = upper(currency)
  ),
  constraint payments_status_check check (status in ('PENDING', 'SUCCEEDED')),
  -- Status and timestamp must agree.
  constraint payments_succeeded_at_check check (
    (status = 'PENDING' and succeeded_at is null)
    or (status = 'SUCCEEDED' and succeeded_at is not null)
  )
);

-- Narrow guard: the first success is final. Column grants already keep the payer,
-- purpose, project and amount out of reach; this keeps the status honest even if
-- a later service changes.
create function app.payments_guard_success()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'SUCCEEDED' then
    if new.status is distinct from 'SUCCEEDED'
      or new.succeeded_at is distinct from old.succeeded_at
    then
      raise exception 'a succeeded payment cannot be reverted or retimed'
        using errcode = '23514', constraint = 'payments_success_immutable';
    end if;
  end if;

  return new;
end
$$;

create trigger payments_guard_success
  before update on app.payments
  for each row
  execute function app.payments_guard_success();

revoke all on app.payments from public, anon, authenticated;

grant select on app.payments to qianzo_runtime;
-- status, created_at, updated_at and succeeded_at come from the server defaults
-- or the success transaction, never from the caller.
grant insert (id, project_id, payer_id, purpose, amount_minor, currency)
  on app.payments to qianzo_runtime;
grant update (status, succeeded_at, updated_at) on app.payments to qianzo_runtime;
