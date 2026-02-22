# Supabase Migrations

## Baseline

`20260217174834_remote_schema.sql` is the **baseline migration** produced by
`supabase db pull`. It represents the complete schema at the time of the initial
repository setup. **This file must never be modified.** It cannot be re-applied
to an existing database (all tables and types already exist), and modifying it
would make the migration history impossible to audit or roll back.

## Adding new migrations

All schema changes after the baseline must be separate, **incrementally
numbered** migration files, e.g.:

```text
supabase/migrations/20260218000000_add_column_foo.sql
supabase/migrations/20260219120000_create_table_bar.sql
```

Each migration file must:

1. Be idempotent where possible (use `IF NOT EXISTS`, `IF EXISTS`, etc.).
2. Contain **only the change** it introduces — not a full schema dump.
3. Have a descriptive name that summarises the change.
4. Be reviewed before merging to `main`.

## Applying migrations

```bash
# Link to your project (first time only)
npx supabase link --project-ref <your-project-id>

# Push pending migrations
npx supabase db push
```
