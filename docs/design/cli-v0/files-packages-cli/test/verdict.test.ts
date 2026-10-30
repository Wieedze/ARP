import { verdictFor, verdictText, type LocalStats, type NetworkReading } from '../src/verdict.js';

const now = new Date('2026-11-10T12:00:00Z');
const local = (over: Partial<LocalStats> = {}): LocalStats => ({
  calls: 40,
  ok: 39,
  auth: 0,
  medianMs: 300,
  lastChange: null,
  ...over,
});
const net = (over: Partial<NetworkReading> = {}): NetworkReading => ({
  success: 0.97,
  operators: 12,
  medianMs: 280,
  ...over,
});

describe('verdictFor, first rule wins', () => {
  it('says not enough data under 10 calls, under 3 operators, or with no network reading', () => {
    expect(verdictFor(local({ calls: 9, ok: 9 }), net(), now).kind).toBe('not enough data');
    expect(verdictFor(local(), net({ operators: 2 }), now).kind).toBe('not enough data');
    expect(verdictFor(local(), null, now).kind).toBe('not enough data');
  });

  it('says broken everywhere when both sides are under 75 %', () => {
    expect(verdictFor(local({ ok: 10 }), net({ success: 0.05 }), now).kind).toBe(
      'broken everywhere',
    );
  });

  it('says only you when the network works and this agent is 20 points below', () => {
    expect(verdictText(verdictFor(local({ ok: 24 }), net(), now))).toBe('only you: check config');
    expect(verdictText(verdictFor(local({ ok: 24, auth: 10 }), net(), now))).toBe(
      'only you: check credentials',
    );
  });

  it('says changed for a change in the last 7 days', () => {
    expect(verdictText(verdictFor(local({ lastChange: '2026-11-08T09:00:00Z' }), net(), now))).toBe(
      'changed 2026-11-08',
    );
    expect(verdictFor(local({ lastChange: '2026-10-30T09:00:00Z' }), net(), now).kind).toBe('ok');
  });

  it('says slow for you over twice the network median', () => {
    expect(verdictFor(local({ medianMs: 900 }), net(), now).kind).toBe('slow for you');
  });

  it('says ok otherwise', () => {
    expect(verdictFor(local(), net(), now).kind).toBe('ok');
  });
});
