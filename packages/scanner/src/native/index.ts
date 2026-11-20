// React Native (iOS): the scan screen and the scans saved on the phone. Metro picks
// `scan-session.ios.tsx` on iOS; other platforms get the "not supported" fallback.
export { deviceFacts, scanSupport } from './device';
export { ScanFailure, ScanIntro } from './scan-intro';
export { ScanReport } from './scan-report';
export { ScanSession } from './scan-session';
export type { ScanSessionProps } from './scan-session.types';
export {
  deleteScan,
  getScan,
  listScans,
  saveExport,
  writeModelJson,
  type SavedScan,
} from './storage';
