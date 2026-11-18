-- The seller's front door: the id of one of the scan's doors, marked on the floor plan. Like
-- room_labels and room_dividers, it is user input layered on the converted model when it is
-- served (@bairmair/room-model applyAnnotations); the model file stays exactly convert(raw).
-- Door ids are RoomPlan's own identifiers, so the choice survives re-conversion. Null: the
-- viewers guess the entrance from the scan.

alter table public.room_scans
  add column entrance_door_id text
    constraint room_scans_entrance_door_id_length check (char_length(entrance_door_id) between 1 and 64);

-- The owner writes it like room_labels; everyone who can read the scan reads it.
grant update (entrance_door_id) on public.room_scans to authenticated;
grant select (entrance_door_id) on public.room_scans to anon, authenticated;
