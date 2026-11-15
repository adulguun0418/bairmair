'use client';

import { LISTING_LIMITS } from '@bairmair/db';
import { formatArea, roomDisplayName, type Locale } from '@bairmair/i18n';
import {
  applyAnnotations,
  applyRoomDividers,
  computeMetrics,
  dividerFromPlan,
  floorPlanViewBox,
  incompleteRoomIds,
  isMadeByDivider,
  ROOM_DIVIDER_LIMITS,
  ROOM_LABELS,
  withRoomLabel,
  type RoomDivider,
  type RoomLabel,
  type RoomLabelOverride,
  type RoomModelV1,
  type Vec2,
} from '@bairmair/room-model';
import { FloorPlan } from '@bairmair/viewer';
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { useViewerText } from '@/components/viewer/use-viewer-text';
import {
  loadMyScan,
  loadScanModel,
  savePhotoRoom,
  saveScanAnnotations,
  type MyPhoto,
  type MyScan,
} from '@/lib/my-listings';

type Loaded =
  | { state: 'loading' }
  | { state: 'none' }
  | { state: 'processing' }
  | { state: 'failed' }
  | { state: 'error' }
  | { state: 'ready'; scan: MyScan; converted: RoomModelV1 };

/** A pointer stroke in the plan box's pixels. */
interface Stroke {
  start: Vec2;
  end: Vec2;
}

/** Strokes shorter than this (in pixels) are clicks. */
const MIN_STROKE_PX = 16;

/**
 * The listing's 3D scan on the website. Scans are made in the app; here the seller reviews the
 * processed one: divides rooms the walls did not separate, sets room types and names, and puts
 * photos in rooms. Every change is saved at once, to the same columns the app syncs.
 */
export function ScanSection({
  listingId,
  photos,
  onPhotosChange,
  locale,
}: {
  /** Null while the listing has not been saved yet. */
  listingId: string | null;
  photos: readonly MyPhoto[];
  onPhotosChange: (photos: MyPhoto[]) => void;
  locale: Locale;
}) {
  const { t, text } = useViewerText(locale);
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [labels, setLabels] = useState<Record<string, RoomLabelOverride>>({});
  const [dividers, setDividers] = useState<RoomDivider[]>([]);
  const [dividing, setDividing] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!listingId) return;
    let active = true;
    (async () => {
      const scan = await loadMyScan(listingId);
      if (!active) return;
      if (!scan) return setLoaded({ state: 'none' });
      if (scan.status === 'failed') return setLoaded({ state: 'failed' });
      if (scan.status !== 'ready') return setLoaded({ state: 'processing' });
      const converted = await loadScanModel(listingId, scan.id);
      if (!active) return;
      setLabels(scan.roomLabels);
      setDividers(scan.dividers);
      setLoaded({ state: 'ready', scan, converted });
    })().catch(() => active && setLoaded({ state: 'error' }));
    return () => {
      active = false;
    };
  }, [listingId]);

  const scanId = loaded.state === 'ready' ? loaded.scan.id : null;
  const converted = loaded.state === 'ready' ? loaded.converted : null;
  const model = useMemo(
    () =>
      converted
        ? applyAnnotations(converted, {
            dividers,
            roomLabels: labels,
            photos: photos.map((photo) => ({
              id: photo.id,
              roomId: photo.room?.scanId === scanId ? photo.room.roomId : null,
            })),
          })
        : null,
    [converted, dividers, labels, photos, scanId],
  );

  if (!listingId || loaded.state === 'none') {
    return <p className="text-sm text-fg-muted">{t('listingForm.scanInApp')}</p>;
  }
  if (loaded.state === 'loading') {
    return <div className="h-72 animate-pulse rounded-xl bg-surface-3" />;
  }
  if (loaded.state !== 'ready' || !model || !scanId) {
    const message =
      loaded.state === 'processing'
        ? t('listingScan.status.processing')
        : loaded.state === 'failed'
          ? t('listingScan.status.failed')
          : t('browse.loadFailed');
    return <p className="text-sm text-fg-muted">{message}</p>;
  }

  const metrics = computeMetrics(model);
  const incomplete = new Set(incompleteRoomIds(model));
  const roomIds = new Set(model.rooms.map((room) => room.id));

  /** Saves labels and dividers together; on failure the previous ones come back. */
  const saveAnnotations = async (
    nextLabels: Record<string, RoomLabelOverride>,
    nextDividers: RoomDivider[],
    success: string | null = null,
  ) => {
    const before = { labels, dividers };
    setLabels(nextLabels);
    setDividers(nextDividers);
    setBusy(true);
    try {
      await saveScanAnnotations(scanId, nextLabels, nextDividers);
      setNotice(success ? { text: success, error: false } : null);
    } catch {
      setLabels(before.labels);
      setDividers(before.dividers);
      setNotice({ text: t('listingForm.saveFailed'), error: true });
    } finally {
      setBusy(false);
    }
  };

  const changeLabel = (roomId: string, change: RoomLabelOverride) => {
    const next = withRoomLabel(labels, roomId, change);
    if (next !== labels) void saveAnnotations(next, dividers);
  };

  const addDivider = (divider: RoomDivider) => {
    if (dividers.length >= ROOM_DIVIDER_LIMITS.count) {
      setNotice({ text: t('roomDivide.limit', { count: ROOM_DIVIDER_LIMITS.count }), error: true });
      return;
    }
    const [result] = applyRoomDividers(model, [divider]).results;
    if (result?.status !== 'applied') {
      setNotice({ text: t(`roomDivide.${result?.status ?? 'noCut'}`), error: true });
      return;
    }
    void saveAnnotations(labels, [...dividers, divider], t('roomDivide.applied'));
  };

  /** Removes dividers with the rooms they made: their labels, and their photos' rooms. */
  const removeDividers = async (ids: readonly string[]) => {
    const removed = new Set(ids);
    const nextLabels = Object.fromEntries(
      Object.entries(labels).filter(([roomId]) => !isMadeByDivider(roomId, removed)),
    );
    await saveAnnotations(
      nextLabels,
      dividers.filter((divider) => !removed.has(divider.id)),
    );
    const orphaned = photos.filter(
      (photo) => photo.room?.scanId === scanId && isMadeByDivider(photo.room.roomId, removed),
    );
    if (orphaned.length === 0) return;
    try {
      for (const photo of orphaned) await savePhotoRoom(photo.id, null);
      const ids = new Set(orphaned.map((photo) => photo.id));
      onPhotosChange(photos.map((photo) => (ids.has(photo.id) ? { ...photo, room: null } : photo)));
    } catch {
      setNotice({ text: t('listingForm.saveFailed'), error: true });
    }
  };

  const assignPhoto = async (photo: MyPhoto, roomId: string | null) => {
    const room = roomId ? { scanId, roomId } : null;
    setBusy(true);
    try {
      await savePhotoRoom(photo.id, room);
      onPhotosChange(photos.map((other) => (other.id === photo.id ? { ...other, room } : other)));
      setNotice(null);
    } catch {
      setNotice({ text: t('listingForm.saveFailed'), error: true });
    } finally {
      setBusy(false);
    }
  };

  const labelChoices = ROOM_LABELS.map((label) => ({ value: label, label: t(`rooms.${label}`) }));

  return (
    <div className="space-y-6">
      <p className="text-sm text-fg-muted">
        {t('listingForm.scanDone')}{' '}
        {t('listingScan.total', { area: text.area(metrics.totalAreaM2) })} ·{' '}
        {t('viewer.approximateScanned')}
      </p>

      {/* Plan, and dividing */}
      <div className="space-y-3">
        <DividablePlan
          model={model}
          text={text}
          title={t('viewer.viewPlan')}
          dividing={dividing}
          onLine={(a, b) =>
            addDivider(
              dividerFromPlan(model, crypto.randomUUID().replace(/-/g, '').slice(0, 8), a, b),
            )
          }
        />
        <p className="text-sm text-fg-muted">
          {dividing ? t('roomDivide.introWeb') : t('roomDivide.openHint')}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setDividing((current) => !current);
              setNotice(null);
            }}
            className={
              dividing
                ? 'rounded-full bg-primary px-4 py-2 font-medium text-on-primary hover:opacity-90'
                : 'rounded-full border border-line-2 px-4 py-2 font-medium hover:bg-surface-2'
            }
          >
            {dividing ? t('roomDivide.done') : t('roomDivide.open')}
          </button>
          {dividers.length > 0 && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void removeDividers([dividers.at(-1)!.id])}
                className={smallButton}
              >
                {t('roomDivide.undo')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(`${t('roomDivide.clearTitle')}\n\n${t('roomDivide.clearBody')}`)
                  ) {
                    void removeDividers(dividers.map((divider) => divider.id));
                  }
                }}
                className={smallButton}
              >
                {t('roomDivide.clear')}
              </button>
              <span className="text-sm text-fg-muted">
                {t('roomDivide.lines', { count: dividers.length })}
              </span>
            </>
          )}
        </div>
        {notice && (
          <p
            role={notice.error ? 'alert' : 'status'}
            className={`text-sm ${notice.error ? 'text-danger' : 'text-success'}`}
          >
            {notice.text}
          </p>
        )}
      </div>

      {/* Rooms */}
      <div className="space-y-3">
        <h3 className="font-semibold">{t('roomReview.title')}</h3>
        <p className="text-sm text-fg-muted">{t('roomReview.intro')}</p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {model.rooms.map((room, index) => {
            const area = metrics.rooms.find((entry) => entry.id === room.id)?.areaM2 ?? 0;
            return (
              <li key={room.id} className="space-y-2 rounded-xl border border-line p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">
                    {index + 1}. {roomDisplayName(t, room)}
                  </span>
                  <span className="text-sm text-fg-muted">{formatArea(area, locale)}</span>
                </div>
                {incomplete.has(room.id) && (
                  <p className="text-xs text-warning">{t('roomReview.incomplete')}</p>
                )}
                <label className="block space-y-1">
                  <span className="block text-xs font-medium">{t('roomReview.label')}</span>
                  <select
                    value={room.label}
                    disabled={busy}
                    onChange={(event) =>
                      changeLabel(room.id, { label: event.target.value as RoomLabel })
                    }
                    className={inputClass}
                  >
                    {labelChoices.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="block text-xs font-medium">{t('roomReview.name')}</span>
                  <RoomNameInput
                    // A new key when the saved name changes, so the field starts from it.
                    key={`${room.id}:${labels[room.id]?.name ?? ''}`}
                    saved={labels[room.id]?.name ?? ''}
                    placeholder={t('roomReview.namePlaceholder')}
                    onSave={(name) => changeLabel(room.id, { name })}
                  />
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Photos and rooms */}
      <div className="space-y-3">
        <h3 className="font-semibold">{t('photoRooms.title')}</h3>
        {photos.length === 0 ? (
          <p className="text-sm text-fg-muted">{t('photoRooms.noPhotos')}</p>
        ) : (
          <>
            <p className="text-sm text-fg-muted">{t('photoRooms.intro')}</p>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {photos.map((photo, index) => {
                const current =
                  photo.room?.scanId === scanId && roomIds.has(photo.room.roomId)
                    ? photo.room.roomId
                    : '';
                return (
                  <li key={photo.id} className="space-y-2">
                    {/* eslint-disable-next-line @next/next/no-img-element -- small editor thumbnails */}
                    <img
                      src={photo.url}
                      alt={t('photoRooms.photo', { index: index + 1 })}
                      className="aspect-[4/3] w-full rounded-lg object-cover"
                    />
                    <select
                      value={current}
                      disabled={busy}
                      onChange={(event) => void assignPhoto(photo, event.target.value || null)}
                      aria-label={t('photoRooms.photo', { index: index + 1 })}
                      className={inputClass}
                    >
                      <option value="">{t('photoRooms.none')}</option>
                      {model.rooms.map((room) => (
                        <option key={room.id} value={room.id}>
                          {roomDisplayName(t, room)}
                        </option>
                      ))}
                    </select>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

/** A room name field that saves when it loses focus (or on Enter). */
function RoomNameInput({
  saved,
  placeholder,
  onSave,
}: {
  saved: string;
  placeholder: string;
  onSave: (name: string) => void;
}) {
  const [value, setValue] = useState(saved);
  return (
    <input
      value={value}
      maxLength={LISTING_LIMITS.roomName.max}
      placeholder={placeholder}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => value !== saved && onSave(value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
      className={inputClass}
    />
  );
}

/**
 * The floor plan; while dividing, a drag across it draws a line. The SVG fits its view box into
 * the box, centered, so a pointer position maps back to plan coordinates.
 */
function DividablePlan({
  model,
  text,
  title,
  dividing,
  onLine,
}: {
  model: RoomModelV1;
  text: ReturnType<typeof useViewerText>['text'];
  title: string;
  dividing: boolean;
  onLine: (a: Vec2, b: Vec2) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [stroke, setStroke] = useState<Stroke | null>(null);
  const startRef = useRef<Vec2 | null>(null);

  const local = (event: PointerEvent<HTMLDivElement>): Vec2 => {
    const rect = event.currentTarget.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  };
  const toPlan = (point: Vec2): Vec2 => {
    const rect = box.current!.getBoundingClientRect();
    const view = floorPlanViewBox(model);
    const scale = Math.min(rect.width / view.width, rect.height / view.height);
    const offsetX = (rect.width - view.width * scale) / 2;
    const offsetY = (rect.height - view.height * scale) / 2;
    return [view.minX + (point[0] - offsetX) / scale, view.minZ + (point[1] - offsetY) / scale];
  };

  return (
    <div
      ref={box}
      className="relative h-[min(60vh,460px)] overflow-hidden rounded-xl border border-line bg-white"
    >
      <FloorPlan model={model} text={text} title={title} className="h-full w-full" />
      {dividing && (
        <div
          className="absolute inset-0 cursor-crosshair"
          style={{ touchAction: 'none' }}
          // The start is kept in a ref and the end read from the release itself, so a quick
          // drag never depends on a re-render in between; the state only draws the line.
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            const start = local(event);
            startRef.current = start;
            setStroke({ start, end: start });
          }}
          onPointerMove={(event) => {
            const start = startRef.current;
            if (start) setStroke({ start, end: local(event) });
          }}
          onPointerUp={(event) => {
            const start = startRef.current;
            startRef.current = null;
            setStroke(null);
            if (!start) return;
            const end = local(event);
            const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
            if (length >= MIN_STROKE_PX) onLine(toPlan(start), toPlan(end));
          }}
          onPointerCancel={() => {
            startRef.current = null;
            setStroke(null);
          }}
        >
          {stroke && (
            <svg className="pointer-events-none absolute inset-0 h-full w-full">
              <line
                x1={stroke.start[0]}
                y1={stroke.start[1]}
                x2={stroke.end[0]}
                y2={stroke.end[1]}
                stroke="#199ed6"
                strokeWidth={4}
                strokeLinecap="round"
              />
            </svg>
          )}
        </div>
      )}
    </div>
  );
}

const inputClass =
  'w-full rounded-lg border border-line-2 bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-primary disabled:opacity-60';
const smallButton =
  'rounded-full border border-line-2 px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50';
