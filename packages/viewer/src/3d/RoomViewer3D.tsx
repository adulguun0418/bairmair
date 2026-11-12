'use client';

import {
  layoutHotspots,
  polygonArea,
  visualCenter,
  type ObjectCategory,
  type RoomModelV1,
  type RoomObject,
} from '@bairmair/room-model';
import { Html, OrbitControls, RoundedBox } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import type { PerspectiveCamera, Vector3 } from 'three';
import type { ViewerText } from '../text';
import { buildScene, COLORS, GLASS_OPACITY, type SceneData, type WallMesh } from './scene';

export interface RoomViewer3DProps {
  model: RoomModelV1;
  text: ViewerText;
  selectedRoomId?: string | null;
  onSelectRoom?: (roomId: string) => void;
  onSelectPhoto?: (photoId: string) => void;
  showObjects?: boolean;
  /** Show room names and areas on the floors. */
  showLabels?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** Opacity of a wall between the camera and its room. */
const FADED_WALL_OPACITY = 0.12;
/** A drag longer than this many pixels is a camera move, not a tap on a room. */
const TAP_TOLERANCE_PX = 6;

/**
 * The 3D "dollhouse" view of a model: floors, walls with door and window cutouts, and
 * furniture as simple shapes. Walls between the camera and their room fade out so the
 * inside stays visible from any angle.
 *
 * Renders only on demand (no continuous animation loop) to save battery on phones.
 */
export function RoomViewer3D({
  model,
  text,
  selectedRoomId = null,
  onSelectRoom,
  onSelectPhoto,
  showObjects = true,
  showLabels = true,
  className,
  style,
}: RoomViewer3DProps) {
  const scene = useMemo(() => buildScene(model), [model]);
  useEffect(() => () => scene.dispose(), [scene]);
  const [resetCount, setResetCount] = useState(0);
  // Labels and photo markers are DOM elements placed over the canvas. Giving them this stable
  // container from the start matters: drei's default target is only set after the first
  // render, and switching targets mid-commit left the first label empty.
  const overlay = useRef<HTMLDivElement>(null) as RefObject<HTMLElement>;

  return (
    <div
      ref={overlay as RefObject<HTMLDivElement>}
      className={className}
      style={{ position: 'relative', width: '100%', height: '100%', touchAction: 'none', ...style }}
    >
      <ViewerErrorBoundary fallback={<p style={styles.fallback}>{text.webglUnavailable}</p>}>
        <Canvas
          flat
          frameloop="demand"
          dpr={[1, 2]}
          camera={{ fov: 40, near: 0.05, far: 500, position: [0, 12, 12] }}
          fallback={<p style={styles.fallback}>{text.webglUnavailable}</p>}
        >
          <Lights />
          <Floors scene={scene} selectedRoomId={selectedRoomId} onSelectRoom={onSelectRoom} />
          <Walls walls={scene.walls} />
          {scene.thresholds && (
            <mesh geometry={scene.thresholds}>
              <meshStandardMaterial color={COLORS.threshold} roughness={0.95} />
            </mesh>
          )}
          {showObjects && <Objects objects={model.objects} />}
          <RoomMarkers
            model={model}
            text={text}
            portal={overlay}
            showLabels={showLabels}
            onSelectPhoto={onSelectPhoto}
          />
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.12}
            maxPolarAngle={Math.PI * 0.46}
          />
          <CameraRig bounds={scene.bounds} resetCount={resetCount} />
        </Canvas>
      </ViewerErrorBoundary>
      <button type="button" style={styles.resetButton} onClick={() => setResetCount((n) => n + 1)}>
        {text.resetView}
      </button>
      <p style={styles.hint} aria-hidden="true">
        {text.hint}
      </p>
    </div>
  );
}

function Lights() {
  return (
    <>
      <hemisphereLight args={['#ffffff', '#b9ae9a', 1.25]} />
      <directionalLight position={[6, 12, 8]} intensity={1.5} />
      <directionalLight position={[-8, 6, -5]} intensity={0.45} />
    </>
  );
}

/** Frames the whole model on first render and whenever "reset view" is pressed. */
function CameraRig({ bounds, resetCount }: { bounds: SceneData['bounds']; resetCount: number }) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const controls = useThree((state) => state.controls) as unknown as {
    target: Vector3;
    minDistance: number;
    maxDistance: number;
    update(): void;
  } | null;
  const invalidate = useThree((state) => state.invalidate);
  // Read the size from the store when framing, so a resize does not re-frame the view.
  const getState = useThree((state) => state.get);

  useEffect(() => {
    if (!controls) return;
    const { width, height } = getState().size;
    const aspect = height > 0 ? width / height : 1;
    const centerX = (bounds.min[0] + bounds.max[0]) / 2;
    const centerZ = (bounds.min[1] + bounds.max[1]) / 2;
    const radius =
      Math.hypot(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1]) / 2 + 0.3;
    const verticalFov = (camera.fov * Math.PI) / 180;
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
    const distance = radius / Math.sin(Math.min(verticalFov, horizontalFov) / 2);

    // From the front (+Z, the bottom of the floor plan), slightly to the right, looking down.
    const azimuth = 0.45;
    const elevation = 0.95;
    const targetY = bounds.floorY + 0.4;
    camera.position.set(
      centerX + Math.sin(azimuth) * Math.cos(elevation) * distance,
      targetY + Math.sin(elevation) * distance,
      centerZ + Math.cos(azimuth) * Math.cos(elevation) * distance,
    );
    controls.target.set(centerX, targetY, centerZ);
    controls.minDistance = Math.min(1.5, distance * 0.3);
    controls.maxDistance = distance * 2.2;
    controls.update();
    invalidate();
  }, [camera, controls, bounds, resetCount, invalidate, getState]);

  return null;
}

function Floors({
  scene,
  selectedRoomId,
  onSelectRoom,
}: {
  scene: SceneData;
  selectedRoomId: string | null;
  onSelectRoom?: (roomId: string) => void;
}) {
  const onClick = (roomId: string) => (event: ThreeEvent<MouseEvent>) => {
    if (!onSelectRoom || event.delta > TAP_TOLERANCE_PX) return;
    event.stopPropagation();
    onSelectRoom(roomId);
  };
  const setCursor = (cursor: string) => () => {
    if (onSelectRoom) document.body.style.cursor = cursor;
  };
  useEffect(() => () => void (document.body.style.cursor = ''), []);

  return scene.floors.map(({ room, geometry }) => (
    <mesh
      key={room.id}
      geometry={geometry}
      onClick={onClick(room.id)}
      onPointerOver={setCursor('pointer')}
      onPointerOut={setCursor('')}
    >
      <meshStandardMaterial
        color={room.id === selectedRoomId ? COLORS.floorSelected : COLORS.floor}
        roughness={0.95}
      />
    </mesh>
  ));
}

function Walls({ walls }: { walls: WallMesh[] }) {
  useFrame((state, delta) => {
    const { x, z } = state.camera.position;
    const step = Math.min(1, delta * 10);
    let animating = false;
    for (const wall of walls) {
      let target = 1;
      if (wall.outward) {
        // Camera on the outer side of the wall: the wall is between the camera and its room.
        const side =
          (x - wall.center[0]) * wall.outward[0] + (z - wall.center[1]) * wall.outward[1];
        if (side > 0.05) target = FADED_WALL_OPACITY;
      }
      const material = wall.material;
      const next = material.opacity + (target - material.opacity) * step;
      const settled = Math.abs(target - next) < 0.01;
      material.opacity = settled ? target : next;
      material.depthWrite = material.opacity > 0.6;
      wall.glassMaterial.opacity = GLASS_OPACITY * material.opacity;
      if (!settled) animating = true;
    }
    if (animating) state.invalidate();
  });

  return walls.map((wall) => (
    <group key={wall.id} position={wall.position} rotation-y={wall.yaw}>
      <mesh geometry={wall.geometry} material={wall.material} />
      {wall.panes.map((pane, index) => (
        <mesh key={index} position={pane.position} material={wall.glassMaterial}>
          <planeGeometry args={[pane.width, pane.height]} />
        </mesh>
      ))}
    </group>
  ));
}

const OBJECT_COLORS: Record<ObjectCategory, string> = {
  bed: '#c9b79c',
  sofa: '#9fb3c8',
  chair: '#b5a58c',
  table: '#a68a64',
  storage: '#d8cdb8',
  refrigerator: '#e6eaed',
  stove: '#c9cfd4',
  oven: '#c9cfd4',
  sink: '#e6eaed',
  dishwasher: '#dde2e5',
  washerDryer: '#e6eaed',
  toilet: '#f5f7f8',
  bathtub: '#f5f7f8',
  television: '#3a3f44',
  fireplace: '#8d6e63',
  stairs: '#bcaaa4',
  other: '#c8c2b8',
};

function Objects({ objects }: { objects: RoomObject[] }) {
  return objects.map((object) => {
    const { width, height, depth } = object.dimensions;
    if (depth < 0.02) return null;
    const radius = Math.min(0.04, Math.min(width, height, depth) * 0.25);
    return (
      <RoundedBox
        key={object.id}
        args={[width, height, depth]}
        radius={radius}
        smoothness={2}
        position={object.transform.position}
        rotation-y={object.transform.yaw}
      >
        <meshStandardMaterial color={OBJECT_COLORS[object.category]} roughness={0.85} />
      </RoundedBox>
    );
  });
}

/**
 * One marker per room at its visual center: the room name and area, with buttons for the
 * room's photos underneath. Keeping the photo buttons inside the label means they can never
 * cover it, whichever way the view is turned. Photos that carry a camera pose (a later
 * feature) get their own marker where the photo was taken.
 */
function RoomMarkers({
  model,
  text,
  portal,
  showLabels,
  onSelectPhoto,
}: {
  model: RoomModelV1;
  text: ViewerText;
  portal: RefObject<HTMLElement>;
  showLabels: boolean;
  onSelectPhoto?: (photoId: string) => void;
}) {
  const { markers, posed } = useMemo(() => {
    const posedIds = new Set(
      model.hotspots.filter((hotspot) => hotspot.cameraPose).map((hotspot) => hotspot.photoId),
    );
    // Same numbering as the floor plan.
    const numbered = layoutHotspots(model).map((placement, index) => ({
      ...placement,
      number: index + 1,
    }));
    return {
      markers: model.rooms.map((room) => ({
        room,
        point: visualCenter(room.floor.polygon).point,
        area: polygonArea(room.floor.polygon),
        photos: numbered.filter((p) => p.roomId === room.id && !posedIds.has(p.photoId)),
      })),
      posed: numbered.filter((placement) => posedIds.has(placement.photoId)),
    };
  }, [model]);
  const rooms = useMemo(() => new Map(model.rooms.map((room) => [room.id, room])), [model]);

  const photoButton = (photoId: string, number: number, roomId: string) => {
    const room = rooms.get(roomId);
    const label = room ? text.photo(number, room) : undefined;
    return (
      <button
        key={photoId}
        type="button"
        style={styles.hotspot}
        aria-label={label}
        title={label}
        disabled={!onSelectPhoto}
        onClick={() => onSelectPhoto?.(photoId)}
      >
        <CameraIcon />
      </button>
    );
  };

  return (
    <>
      {markers.map(({ room, point, area, photos }) => {
        if (!showLabels && photos.length === 0) return null;
        return (
          <Html
            key={room.id}
            position={[point[0], room.floor.y + 0.05, point[1]]}
            portal={portal}
            center
            zIndexRange={[10, 0]}
            style={{ pointerEvents: 'none' }}
          >
            <div style={styles.marker}>
              {showLabels && (
                <div style={styles.label}>
                  <div style={styles.labelName}>{text.roomName(room)}</div>
                  <div style={styles.labelArea}>{text.area(area)}</div>
                </div>
              )}
              {photos.length > 0 && (
                <div style={styles.photoRow}>
                  {photos.map((photo) => photoButton(photo.photoId, photo.number, room.id))}
                </div>
              )}
            </div>
          </Html>
        );
      })}
      {posed.map((placement) => (
        <Html
          key={placement.photoId}
          position={[
            placement.position[0],
            (rooms.get(placement.roomId)?.floor.y ?? 0) + 1.2,
            placement.position[1],
          ]}
          portal={portal}
          center
          zIndexRange={[30, 20]}
        >
          {photoButton(placement.photoId, placement.number, placement.roomId)}
        </Html>
      ))}
    </>
  );
}

function CameraIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none">
      <path
        d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"
        fill="#fff"
      />
      <circle cx="12" cy="13" r="3.4" fill="#d9480f" />
    </svg>
  );
}

class ViewerErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const styles = {
  fallback: {
    margin: 0,
    padding: 24,
    textAlign: 'center',
    color: '#5d656b',
  },
  resetButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: '6px 12px',
    border: 'none',
    borderRadius: 999,
    background: 'rgba(255, 255, 255, 0.92)',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.18)',
    font: 'inherit',
    fontSize: 13,
    color: '#23272a',
    cursor: 'pointer',
  },
  hint: {
    position: 'absolute',
    left: 12,
    bottom: 10,
    margin: 0,
    fontSize: 12,
    color: '#5d656b',
    pointerEvents: 'none',
  },
  marker: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
  },
  photoRow: {
    display: 'flex',
    gap: 6,
    pointerEvents: 'auto',
  },
  label: {
    padding: '3px 9px',
    borderRadius: 8,
    background: 'rgba(255, 255, 255, 0.88)',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.12)',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    lineHeight: 1.25,
  },
  labelName: { fontSize: 12, fontWeight: 600, color: '#23272a' },
  labelArea: { fontSize: 11, color: '#5d656b' },
  hotspot: {
    display: 'grid',
    placeItems: 'center',
    width: 30,
    height: 30,
    padding: 0,
    border: '2px solid #fff',
    borderRadius: '50%',
    background: '#d9480f',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)',
    cursor: 'pointer',
  },
} satisfies Record<string, CSSProperties>;
