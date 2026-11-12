import { describe, expect, it } from 'vitest';
import { canStartScan, getScanSupport, type DeviceFacts } from '../src/scanner/support';

const iphone = (modelId: string, osVersion = '18.2'): DeviceFacts => ({
  os: 'ios',
  isDevice: true,
  osVersion,
  modelId,
});

describe('getScanSupport', () => {
  it('accepts every LiDAR iPhone on iOS 17 or later', () => {
    for (const modelId of ['iPhone13,3', 'iPhone15,3', 'iPhone16,1', 'iPhone18,2', 'iPhone19,2']) {
      expect(getScanSupport(iphone(modelId))).toEqual({ status: 'supported' });
    }
    expect(getScanSupport(iphone('iPhone14,2', '17.0'))).toEqual({ status: 'supported' });
    expect(getScanSupport(iphone('iPhone16,2', '27'))).toEqual({ status: 'supported' });
  });

  it('rejects iPhones without LiDAR, including the iPhone Air and 17e', () => {
    for (const modelId of [
      'iPhone13,2',
      'iPhone15,4',
      'iPhone17,3',
      'iPhone18,3',
      'iPhone18,4',
      'iPhone18,5',
    ]) {
      expect(getScanSupport(iphone(modelId))).toEqual({
        status: 'unsupported',
        reason: 'no-lidar',
      });
    }
  });

  it('rejects iPads, which run this iPhone-only app in compatibility mode', () => {
    expect(getScanSupport(iphone('iPad13,4'))).toEqual({
      status: 'unsupported',
      reason: 'no-lidar',
    });
  });

  it('lets a model from a newer generation try, so the native check decides', () => {
    expect(getScanSupport(iphone('iPhone19,7'))).toEqual({ status: 'unverified' });
    expect(getScanSupport(iphone('iPhone20,1'))).toEqual({ status: 'unverified' });
  });

  it('needs iOS 17 for multi-room capture', () => {
    expect(getScanSupport(iphone('iPhone16,1', '16.7.10'))).toEqual({
      status: 'unsupported',
      reason: 'os-too-old',
    });
    expect(getScanSupport(iphone('iPhone16,1', ''))).toEqual({
      status: 'unsupported',
      reason: 'os-too-old',
    });
  });

  it('rejects other platforms and the simulator', () => {
    expect(getScanSupport({ ...iphone('iPhone16,1'), os: 'android' })).toEqual({
      status: 'unsupported',
      reason: 'not-ios',
    });
    expect(getScanSupport({ ...iphone('arm64'), isDevice: false })).toEqual({
      status: 'unsupported',
      reason: 'simulator',
    });
  });

  it('does not treat object keys as model IDs', () => {
    expect(getScanSupport(iphone('constructor')).status).toBe('unsupported');
    expect(getScanSupport({ ...iphone(''), modelId: null }).status).toBe('unsupported');
  });

  it('allows starting a scan unless the device is unsupported', () => {
    expect(canStartScan({ status: 'supported' })).toBe(true);
    expect(canStartScan({ status: 'unverified' })).toBe(true);
    expect(canStartScan({ status: 'unsupported', reason: 'no-lidar' })).toBe(false);
  });
});
