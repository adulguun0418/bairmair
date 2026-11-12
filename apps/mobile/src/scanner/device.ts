import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { getScanSupport, type DeviceFacts, type ScanSupport } from './support';

/** Facts about this phone. Constant for the lifetime of the app. */
export const deviceFacts: DeviceFacts = {
  os: Platform.OS,
  isDevice: Device.isDevice,
  osVersion: Device.osVersion,
  modelId: Device.modelId,
};

export const scanSupport: ScanSupport = getScanSupport(deviceFacts);
