/** What is recorded with every saved scan. Pure, so it is unit-tested without a device. */
export interface ScanMeta {
  id: string;
  /** ISO 8601. */
  createdAt: string;
  /** Apple's export format can change between iOS versions, so the source is recorded. */
  device: { modelId: string | null; osVersion: string | null } | null;
}

const SCAN_ID = /^scan-\d{8}-\d{6}-[a-z0-9]{4}$/;

/** Scan ids are used as folder and file names, so they are checked before use. */
export const isScanId = (value: unknown): value is string =>
  typeof value === 'string' && SCAN_ID.test(value);

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * A new id such as `scan-20261112-140312-k3f9`. It names the export files (expo-roomplan
 * overwrites `tmp/Export/<scanName>.*`) and the folder the scan is saved in.
 */
export function newScanId(now: Date = new Date(), random: () => number = Math.random): string {
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const suffix = Array.from({ length: 4 }, () =>
    'abcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(random() * 36)),
  ).join('');
  return `scan-${date}-${time}-${suffix}`;
}

/** `2026-11-12 14:03`, in the phone's time zone. The same in every locale. */
export function formatScanTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
