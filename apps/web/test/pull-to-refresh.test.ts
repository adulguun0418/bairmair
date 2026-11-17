import { describe, expect, it } from 'vitest';
import {
  PULL,
  allowsVerticalPan,
  dragIntent,
  isStandaloneDisplay,
  pullOffset,
  pullPhase,
} from '@/lib/pull-to-refresh';

describe('isStandaloneDisplay', () => {
  const media = (matches: boolean) => () => ({ matches });

  it('is true for iOS home-screen apps', () => {
    expect(isStandaloneDisplay({ navigator: { standalone: true }, matchMedia: media(false) })).toBe(
      true,
    );
  });

  it('follows the display-mode media query elsewhere', () => {
    expect(isStandaloneDisplay({ navigator: {}, matchMedia: media(true) })).toBe(true);
    expect(
      isStandaloneDisplay({ navigator: { standalone: false }, matchMedia: media(false) }),
    ).toBe(false);
  });

  it('is false without matchMedia', () => {
    expect(isStandaloneDisplay({})).toBe(false);
  });
});

describe('pullOffset and pullPhase', () => {
  it('ignores upward travel', () => {
    expect(pullOffset(-40)).toBe(0);
    expect(pullOffset(0)).toBe(0);
  });

  it('follows the finger with resistance and stops at the maximum', () => {
    expect(pullOffset(100)).toBe(55);
    expect(pullOffset(10_000)).toBe(PULL.max);
  });

  it('is ready once the offset reaches the threshold', () => {
    expect(pullPhase(PULL.threshold - 1)).toBe('pulling');
    expect(pullPhase(PULL.threshold)).toBe('ready');
    expect(pullPhase(pullOffset(117))).toBe('ready');
  });
});

describe('dragIntent', () => {
  it('waits until the finger has moved past the slop', () => {
    expect(dragIntent(3, 5)).toBe('undecided');
  });

  it('takes downward drags', () => {
    expect(dragIntent(2, 20)).toBe('pull');
    expect(dragIntent(-10, 10)).toBe('pull');
  });

  it('leaves sideways and upward drags alone', () => {
    expect(dragIntent(30, 10)).toBe('cancel');
    expect(dragIntent(0, -20)).toBe('cancel');
  });
});

describe('allowsVerticalPan', () => {
  it('allows the defaults and explicit vertical panning', () => {
    for (const value of [
      'auto',
      'manipulation',
      '',
      'pan-y',
      'pan-x pan-y',
      'pan-down pinch-zoom',
    ]) {
      expect(allowsVerticalPan(value)).toBe(true);
    }
  });

  it('refuses elements that take vertical drags', () => {
    for (const value of ['none', 'pan-x', 'pinch-zoom', 'pan-up']) {
      expect(allowsVerticalPan(value)).toBe(false);
    }
  });
});
