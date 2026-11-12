'use client';

import {
  renderFloorPlanSvg,
  type FloorPlanText,
  type FloorPlanTheme,
  type RoomModelV1,
} from '@bairmair/room-model';
import { useMemo, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';

export interface FloorPlanProps {
  model: RoomModelV1;
  /** Localized labels. Without them the plan is drawn without text. */
  text?: FloorPlanText;
  /** Accessible title of the drawing. */
  title?: string;
  selectedRoomId?: string | null;
  onSelectRoom?: (roomId: string) => void;
  onSelectPhoto?: (photoId: string) => void;
  story?: number;
  showObjects?: boolean;
  showHotspots?: boolean;
  theme?: Partial<FloorPlanTheme>;
  className?: string;
  style?: CSSProperties;
}

/**
 * The 2D floor plan, drawn by `renderFloorPlanSvg` from `@bairmair/room-model`. Rooms and photo
 * markers are clickable and keyboard-focusable when the matching handlers are passed.
 *
 * The SVG string is built from validated model data and escapes all text, so it is safe to
 * insert as HTML.
 */
export function FloorPlan({
  model,
  text,
  title,
  selectedRoomId = null,
  onSelectRoom,
  onSelectPhoto,
  story,
  showObjects,
  showHotspots,
  theme,
  className,
  style,
}: FloorPlanProps) {
  const interactive = Boolean(onSelectRoom || onSelectPhoto);
  const svg = useMemo(
    () =>
      renderFloorPlanSvg(model, {
        text,
        title,
        selectedRoomId,
        story,
        showObjects,
        showHotspots,
        theme,
        interactive,
      }),
    [model, text, title, selectedRoomId, story, showObjects, showHotspots, theme, interactive],
  );

  const activate = (target: EventTarget) => {
    if (!(target instanceof Element)) return;
    const photo = target.closest('[data-photo-id]');
    const photoId = photo?.getAttribute('data-photo-id');
    if (photoId && onSelectPhoto) {
      onSelectPhoto(photoId);
      return;
    }
    const roomId = target.closest('[data-room-id]')?.getAttribute('data-room-id');
    if (roomId && onSelectRoom) onSelectRoom(roomId);
  };

  const onClick = (event: MouseEvent) => activate(event.target);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    activate(event.target);
  };

  return (
    <div
      className={className}
      style={style}
      onClick={interactive ? onClick : undefined}
      onKeyDown={interactive ? onKeyDown : undefined}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
