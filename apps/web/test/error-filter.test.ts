import { describe, expect, it } from 'vitest';
import { isReportableException } from '../src/lib/error-filter';

const ownFrame = { filename: 'https://bairmair-bairmair.vercel.app/_next/static/chunks/abc.js' };

describe('isReportableException', () => {
  it('keeps errors from our own code', () => {
    expect(
      isReportableException([
        {
          type: 'TypeError',
          value: "Cannot read properties of null (reading 'id')",
          stacktrace: { frames: [ownFrame] },
        },
      ]),
    ).toBe(true);
  });

  it('keeps errors without a stack or a list', () => {
    expect(isReportableException([{ type: 'Error', value: 'Load failed' }])).toBe(true);
    expect(isReportableException(undefined)).toBe(true);
  });

  it('drops errors thrown inside browser extensions', () => {
    for (const filename of [
      'chrome-extension://abcdef/content.js',
      'moz-extension://1234/inject.js',
      'safari-web-extension://AB12/script.js',
    ]) {
      expect(
        isReportableException([
          {
            type: 'TypeError',
            value: 'x is undefined',
            stacktrace: { frames: [ownFrame, { filename }] },
          },
        ]),
      ).toBe(false);
    }
  });

  it('drops cross-origin "Script error." and ResizeObserver warnings', () => {
    expect(isReportableException([{ type: 'Error', value: 'Script error.' }])).toBe(false);
    expect(
      isReportableException([
        { type: 'Error', value: 'ResizeObserver loop completed with undelivered notifications.' },
      ]),
    ).toBe(false);
  });
});
