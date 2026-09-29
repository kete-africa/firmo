import { describe, expect, it } from 'vitest';
import { periodStart, standingOf } from '../domain';

// Spec 007: three documents offered, then thirty per rolling thirty days while the offer is active.

const now = new Date('2026-09-29T10:00:00Z');

describe('where an organization stands', () => {
  it('starts with three offered documents', () => {
    expect(standingOf({ issuedTotal: 0, issuedInPeriod: 0, accessUntil: null, now })).toEqual({
      kind: 'free',
      remaining: 3,
    });
    expect(standingOf({ issuedTotal: 2, issuedInPeriod: 0, accessUntil: null, now })).toEqual({
      kind: 'free',
      remaining: 1,
    });
  });

  it('needs the offer once the offered documents are used, or once it has ended', () => {
    expect(standingOf({ issuedTotal: 3, issuedInPeriod: 0, accessUntil: null, now }).kind).toBe(
      'plan_required',
    );
    expect(
      standingOf({ issuedTotal: 40, issuedInPeriod: 0, accessUntil: '2026-09-29T09:59:59Z', now })
        .kind,
    ).toBe('plan_required');
  });

  it('counts thirty documents in the rolling period of an active offer', () => {
    const until = '2026-10-15T00:00:00Z';
    expect(standingOf({ issuedTotal: 10, issuedInPeriod: 7, accessUntil: until, now })).toEqual({
      kind: 'subscribed',
      until,
      remaining: 23,
    });
    expect(standingOf({ issuedTotal: 50, issuedInPeriod: 30, accessUntil: until, now }).kind).toBe(
      'subscribed',
    );
  });

  it('keeps the offered documents left when subscribing early', () => {
    const until = '2026-10-15T00:00:00Z';
    expect(standingOf({ issuedTotal: 1, issuedInPeriod: 0, accessUntil: until, now })).toEqual({
      kind: 'subscribed',
      until,
      remaining: 32,
    });
  });

  it('rolls over thirty days', () => {
    expect(periodStart(now).toISOString()).toBe('2026-08-30T10:00:00.000Z');
  });
});
