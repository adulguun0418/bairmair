import type { Translator } from '@bairmair/i18n';
import type { ScanSupport } from './support';

/** Why this phone can (or cannot) scan, in the UI language. */
export function supportMessage(t: Translator, support: ScanSupport): string {
  switch (support.status) {
    case 'supported':
      return t('scanSupport.supported');
    case 'unverified':
      return t('scanSupport.unverified');
    case 'unsupported':
      switch (support.reason) {
        case 'not-ios':
          return t('scanSupport.notIos');
        case 'simulator':
          return t('scanSupport.simulator');
        case 'os-too-old':
          return t('scanSupport.osTooOld');
        case 'no-lidar':
          return t('scanSupport.noLidar');
      }
  }
}
