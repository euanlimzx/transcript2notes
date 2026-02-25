# Supabase schema

## Table: `conversions`

| Column       | Type        | Purpose                                    |
| ------------ | ----------- | ------------------------------------------ |
| `id`         | uuid        | PK, job id returned to client              |
| `status`     | text        | `pending` \| `completed` \| `failed`       |
| `markdown`   | text        | Result when `status = completed` (nullable) |
| `error`      | text        | Error message when `status = failed` (nullable) |
| `created_at` | timestamptz | For ordering and "refresh in 10 min" UX     |

## Applying the migration

Run the SQL in `migrations/001_conversions.sql` in the Supabase SQL Editor (Dashboard → SQL Editor), or use the Supabase CLI:

```bash
supabase db push
```

(Requires Supabase CLI and linked project.)
