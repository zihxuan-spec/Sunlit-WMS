-- Migration: 001_inbound_queue_uid.sql
-- Added to support stable user filtering in inbound_queue.
--
-- Why this matters:
--   Prior to this migration, `fetchInboundQueue` in src/App.jsx filtered the queue
--   by the user's display name (`added_by`). If two active users happen to share a
--   name (e.g. "John"), they would see each other's queue items and potentially
--   step on each other's scans. This migration adds a stable UID column and
--   backfills it from existing profile names.
--
-- After this migration runs, the app will write BOTH `added_by` (name, for
-- human-readable audit) and `added_by_uid` (uuid, for filtering). Reads filter
-- by uid only.
--
-- Safe to re-run; all statements are idempotent.
-- =============================================================================

-- 1. Add the new UID column. auth.users(id) is the canonical user identifier.
alter table public.inbound_queue
  add column if not exists added_by_uid uuid references auth.users(id);

-- 2. Backfill existing rows by matching added_by (name) → profiles.name → profiles.id.
--    If a name matches multiple profiles (theoretically possible with the old
--    name-based system), this arbitrarily picks one. Review any rows that remain
--    NULL after this runs — those are historical rows whose operator is no longer
--    in the profiles table.
update public.inbound_queue iq
set added_by_uid = p.id
from public.profiles p
where iq.added_by_uid is null
  and iq.added_by = p.name;

-- 3. Index for the new filter query used by fetchInboundQueue.
create index if not exists idx_inbound_queue_added_by_uid
  on public.inbound_queue(added_by_uid);

-- 4. (Optional) Report how many rows are still missing uid — useful for
--    one-time cleanup after deployment. Comment out if running non-interactively.
-- select count(*) as rows_without_uid from public.inbound_queue where added_by_uid is null;
