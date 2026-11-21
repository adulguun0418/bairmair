import { describe, expect, it } from 'vitest';
import { promotionStatus, hasPromotion, type PromotionPeriod } from '../src/listing-promotion';

const day = 24 * 60 * 60 * 1000;
const now = new Date('2026-11-21T12:00:00Z');
const at = (days: number) => new Date(now.getTime() + days * day).toISOString();
const period = (tier: PromotionPeriod['tier'], from: number, to: number): PromotionPeriod => ({
  tier,
  startsAt: at(from),
  expiresAt: at(to),
});

describe('promotionStatus', () => {
  it('nothing bought', () => {
    const status = promotionStatus([], now);
    expect(status).toEqual({ tier: null, goldUntil: null, silverUntil: null });
    expect(hasPromotion(status)).toBe(false);
  });

  it('silver now', () => {
    expect(promotionStatus([period('silver', -1, 6)], now)).toEqual({
      tier: 'silver',
      goldUntil: null,
      silverUntil: at(6),
    });
  });

  it('gold wins over a silver period spanning it', () => {
    // Silver bought first (7 days), then Gold for 7: the Silver row is stretched past the Gold.
    const status = promotionStatus([period('silver', -2, 12), period('gold', 0, 7)], now);
    expect(status).toEqual({ tier: 'gold', goldUntil: at(7), silverUntil: at(12) });
  });

  it('extended periods end at the last one', () => {
    const status = promotionStatus([period('gold', -1, 6), period('gold', 6, 20)], now);
    expect(status.goldUntil).toBe(at(20));
  });

  it('a queued period is not the tier yet', () => {
    const status = promotionStatus([period('silver', 3, 10)], now);
    expect(status.tier).toBeNull();
    expect(status.silverUntil).toBe(at(10));
    expect(hasPromotion(status)).toBe(true);
  });

  it('ended periods are ignored', () => {
    expect(promotionStatus([period('gold', -10, -3)], now)).toEqual({
      tier: null,
      goldUntil: null,
      silverUntil: null,
    });
  });
});
