import { formatArea, roomDisplayName } from '@bairmair/i18n';
import { renderFloorPlanSvg, type RoomModelV1 } from '@bairmair/room-model';
import { useMemo } from 'react';
import { useI18n } from '@/i18n/i18n';
import { FloorPlanView } from './floor-plan-view';

/** The floor plan of a scan, labelled in the UI language (the renderer the web app uses). */
export function ScanFloorPlan({ model, height }: { model: RoomModelV1; height?: number }) {
  const { t, locale } = useI18n();
  const svg = useMemo(
    () =>
      renderFloorPlanSvg(model, {
        text: {
          roomName: (room) => roomDisplayName(t, room),
          area: (squareMeters) => formatArea(squareMeters, locale),
        },
        title: t('viewer.viewPlan'),
        showHotspots: false,
      }),
    [model, t, locale],
  );
  return <FloorPlanView svg={svg} height={height} />;
}
