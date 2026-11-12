/**
 * Whether this device can run the scan flow.
 *
 * expo-roomplan has no support check in JS: `RoomCaptureSession.isSupported` is only checked
 * natively when a scan starts, and then arrives as an error status. So the app decides up front
 * from the device model: iOS 17+ (needed for multi-room capture) on an iPhone with a LiDAR
 * sensor. The native check stays as a backstop for models this file cannot classify.
 *
 * Pure: no React Native imports, so it is unit-tested without a device.
 */

/** iPhones with a LiDAR sensor (every Pro and Pro Max since the iPhone 12 Pro), by model ID. */
export const LIDAR_IPHONES: ReadonlyMap<string, string> = new Map([
  ['iPhone13,3', 'iPhone 12 Pro'],
  ['iPhone13,4', 'iPhone 12 Pro Max'],
  ['iPhone14,2', 'iPhone 13 Pro'],
  ['iPhone14,3', 'iPhone 13 Pro Max'],
  ['iPhone15,2', 'iPhone 14 Pro'],
  ['iPhone15,3', 'iPhone 14 Pro Max'],
  ['iPhone16,1', 'iPhone 15 Pro'],
  ['iPhone16,2', 'iPhone 15 Pro Max'],
  ['iPhone17,1', 'iPhone 16 Pro'],
  ['iPhone17,2', 'iPhone 16 Pro Max'],
  ['iPhone18,1', 'iPhone 17 Pro'],
  ['iPhone18,2', 'iPhone 17 Pro Max'],
  ['iPhone19,2', 'iPhone 18 Pro'],
  ['iPhone19,3', 'iPhone 18 Pro Max'],
]);

/**
 * The newest iPhone generation (the number in the model ID before the comma) whose model IDs are
 * all known. An unknown ID from a newer generation is "unverified": the scan may be attempted
 * and the native check decides. A new Pro model can then scan before this list is updated, and
 * a new model without LiDAR gets the native "not supported" error instead of a hidden button.
 */
export const LAST_FULLY_KNOWN_GENERATION = 18;

/** Multi-room capture (`StructureBuilder`) needs iOS 17. */
export const MIN_IOS_MAJOR = 17;

export type UnsupportedReason = 'not-ios' | 'simulator' | 'os-too-old' | 'no-lidar';

export type ScanSupport =
  | { status: 'supported' }
  | { status: 'unverified' }
  | { status: 'unsupported'; reason: UnsupportedReason };

export interface DeviceFacts {
  /** `Platform.OS`. */
  os: string;
  /** `false` in a simulator. */
  isDevice: boolean;
  /** For example `"18.1.1"`. */
  osVersion: string | null;
  /** iOS hardware model ID, for example `"iPhone16,1"`. */
  modelId: string | null;
}

const unsupported = (reason: UnsupportedReason): ScanSupport => ({ status: 'unsupported', reason });

export function getScanSupport(device: DeviceFacts): ScanSupport {
  if (device.os !== 'ios') return unsupported('not-ios');
  if (!device.isDevice) return unsupported('simulator');

  const major = Number.parseInt(device.osVersion ?? '', 10);
  if (!Number.isFinite(major) || major < MIN_IOS_MAJOR) return unsupported('os-too-old');

  const modelId = device.modelId ?? '';
  if (LIDAR_IPHONES.has(modelId)) return { status: 'supported' };

  const generation = /^iPhone(\d+),\d+$/.exec(modelId)?.[1];
  if (generation !== undefined && Number(generation) > LAST_FULLY_KNOWN_GENERATION) {
    return { status: 'unverified' };
  }
  return unsupported('no-lidar');
}

export const canStartScan = (support: ScanSupport): boolean => support.status !== 'unsupported';
