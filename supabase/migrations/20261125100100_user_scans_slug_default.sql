-- user_scans.share_slug is set by the insert trigger, but as a NOT NULL column without a default
-- the generated types made it required on insert, which no client can (or may) send. An empty
-- default makes it optional there; the trigger always replaces it before the shape check runs,
-- so an empty slug is never stored.

alter table public.user_scans alter column share_slug set default '';
