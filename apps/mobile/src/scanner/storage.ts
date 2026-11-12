import { Directory, File, Paths } from 'expo-file-system';
import { isScanId, type ScanMeta } from './scan-meta';

/**
 * Scans saved on the phone, one folder each: `Documents/scans/<id>/`.
 *
 * expo-roomplan writes its export to the app's temp folder (`tmp/Export/<scanName>.*`), which
 * iOS may clear at any time, so both files are copied here as soon as they arrive.
 */

const RAW_JSON = 'roomplan.json';
const USDZ = 'roomplan.usdz';
const MODEL_JSON = 'roommodel.json';
const META = 'meta.json';

export interface SavedScan {
  meta: ScanMeta;
  /** Apple's `CapturedStructure` JSON: the source of truth for conversions. */
  rawJson: File;
  usdz: File | null;
}

const scansRoot = () => new Directory(Paths.document, 'scans');

function scanDir(id: string): Directory {
  if (!isScanId(id)) throw new Error(`Invalid scan id: ${id}`);
  return new Directory(scansRoot(), id);
}

/** Copies a fresh export out of the temp folder and records where it came from. */
export async function saveExport(
  meta: ScanMeta,
  exported: { jsonUrl: string; scanUrl?: string },
): Promise<SavedScan> {
  const dir = scanDir(meta.id);
  dir.create({ intermediates: true, idempotent: true });

  const rawJson = new File(dir, RAW_JSON);
  await new File(exported.jsonUrl).copy(rawJson);

  let usdz: File | null = null;
  if (exported.scanUrl) {
    usdz = new File(dir, USDZ);
    await new File(exported.scanUrl).copy(usdz);
  }

  const metaFile = new File(dir, META);
  metaFile.create({ overwrite: true });
  await metaFile.write(JSON.stringify(meta, null, 2));

  // The temp copies are no longer needed.
  for (const url of [exported.jsonUrl, exported.scanUrl]) {
    if (!url) continue;
    try {
      new File(url).delete();
    } catch {
      // Already gone; iOS may clear the temp folder at any time.
    }
  }

  return { meta, rawJson, usdz };
}

function readScan(dir: Directory): SavedScan | null {
  const rawJson = new File(dir, RAW_JSON);
  if (!rawJson.exists) return null;
  const usdz = new File(dir, USDZ);

  let meta: ScanMeta = { id: dir.name, createdAt: '', device: null };
  try {
    meta = { ...meta, ...(JSON.parse(new File(dir, META).textSync()) as Partial<ScanMeta>) };
  } catch {
    // A scan without readable metadata is still usable.
  }
  return { meta, rawJson, usdz: usdz.exists ? usdz : null };
}

/** All saved scans, newest first. */
export function listScans(): SavedScan[] {
  const root = scansRoot();
  if (!root.exists) return [];
  return root
    .list()
    .filter((entry): entry is Directory => entry instanceof Directory && isScanId(entry.name))
    .map(readScan)
    .filter((scan): scan is SavedScan => scan !== null)
    .sort((a, b) => b.meta.createdAt.localeCompare(a.meta.createdAt));
}

export function getScan(id: string): SavedScan | null {
  if (!isScanId(id)) return null;
  const dir = new Directory(scansRoot(), id);
  return dir.exists ? readScan(dir) : null;
}

/** Writes the converted model next to the raw file, so it can be shared as a file. */
export async function writeModelJson(id: string, json: string): Promise<File> {
  const file = new File(scanDir(id), MODEL_JSON);
  file.create({ overwrite: true });
  await file.write(json);
  return file;
}

export function deleteScan(id: string): void {
  const dir = scanDir(id);
  if (dir.exists) dir.delete();
}
