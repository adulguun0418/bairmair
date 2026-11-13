-- Scan processing (step 5). The Next.js route POST /api/scans/{id}/process re-converts the raw
-- RoomPlan JSON with the secret key and writes status, model_path, metrics, schema_version and
-- converter_version. When conversion fails it sets status = 'failed' and records why here.
-- Server-written only: the column is not in the insert/update grants for authenticated.

alter table public.room_scans
  add column processing_error text check (char_length(processing_error) <= 2000);

comment on column public.room_scans.processing_error is
  'Why the last processing run failed (status = failed). Written by the server only.';
