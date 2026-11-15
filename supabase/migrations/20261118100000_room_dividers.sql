-- Seller dividers: lines a seller draws across a scanned room to split it where the walls do
-- not (an open kitchen, a doorway RoomPlan missed). Like room_labels, they are user input layered
-- on the converted model each time it is served (@bairmair/room-model applyAnnotations); the
-- model file stays exactly convert(raw).
--
-- Each entry: { "id": "<4-16 of a-z0-9>", "a": [x, z], "b": [x, z] } in the RAW scan's plan
-- coordinates, so a divider survives re-conversion. The apps validate entries when reading
-- (parseRoomDividers); the database only bounds the shape and size.

alter table public.room_scans
  add column room_dividers jsonb not null default '[]'
    constraint room_scans_room_dividers_shape check (
      jsonb_typeof(room_dividers) = 'array'
      and jsonb_array_length(room_dividers) <= 20
      and length(room_dividers::text) <= 4000
    );

-- The owner writes it like room_labels; everyone who can read the scan reads it.
grant update (room_dividers) on public.room_scans to authenticated;
grant select (room_dividers) on public.room_scans to anon, authenticated;
