import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import {
  nextOpenSlotAfter,
  BacklogOverflowError,
  toLocalHourDow,
  type PostingSchedule,
  type ChannelForSchedule,
} from '@/lib/timezone';

const SCHEDULE: PostingSchedule = {
  weekdays: ['07:30', '18:30'],
  weekends: ['11:30', '19:30'],
};

const CHANNEL: ChannelForSchedule = {
  id: 'c1',
  timezone: 'America/New_York',
  posting_schedule: SCHEDULE,
};

describe('nextOpenSlotAfter — basics', () => {
  it('returns same-day next slot when before earliest weekday slot', async () => {
    // Mon 2026-06-01 04:00 ET (= 08:00 UTC EDT)
    const since = DateTime.fromISO('2026-06-01T04:00:00', { zone: 'America/New_York' }).toUTC();
    const isOccupied = async () => false;
    const slot = await nextOpenSlotAfter(CHANNEL, since, isOccupied);
    expect(slot.setZone('America/New_York').toFormat('yyyy-LL-dd HH:mm')).toBe('2026-06-01 07:30');
  });

  it('moves to next day when after last weekday slot', async () => {
    // Mon 2026-06-01 22:00 ET
    const since = DateTime.fromISO('2026-06-01T22:00:00', { zone: 'America/New_York' }).toUTC();
    const slot = await nextOpenSlotAfter(CHANNEL, since, async () => false);
    expect(slot.setZone('America/New_York').toFormat('yyyy-LL-dd HH:mm')).toBe('2026-06-02 07:30');
  });

  it('uses weekend slots on Saturday', async () => {
    // Sat 2026-06-06 09:00 ET
    const since = DateTime.fromISO('2026-06-06T09:00:00', { zone: 'America/New_York' }).toUTC();
    const slot = await nextOpenSlotAfter(CHANNEL, since, async () => false);
    expect(slot.setZone('America/New_York').toFormat('yyyy-LL-dd HH:mm')).toBe('2026-06-06 11:30');
  });

  it('skips occupied slots', async () => {
    const since = DateTime.fromISO('2026-06-01T04:00:00', { zone: 'America/New_York' }).toUTC();
    let calls = 0;
    const isOccupied = async (_at: DateTime) => { calls += 1; return calls === 1; };
    const slot = await nextOpenSlotAfter(CHANNEL, since, isOccupied);
    expect(slot.setZone('America/New_York').toFormat('yyyy-LL-dd HH:mm')).toBe('2026-06-01 18:30');
  });

  it('throws BacklogOverflowError when no slot available in 14 days', async () => {
    const since = DateTime.fromISO('2026-06-01T04:00:00', { zone: 'America/New_York' }).toUTC();
    await expect(nextOpenSlotAfter(CHANNEL, since, async () => true)).rejects.toThrow(BacklogOverflowError);
  });
});

describe('toLocalHourDow', () => {
  it('converts UTC instant to channel-local hour + day-of-week (0=Sun..6=Sat)', () => {
    // Wed 2026-05-27 22:30 UTC = 18:30 ET (EDT)
    const r = toLocalHourDow(new Date('2026-05-27T22:30:00Z'), 'America/New_York');
    expect(r.hour).toBe(18);
    expect(r.dow).toBe(3);
  });
});

describe('nextOpenSlotAfter — DST', () => {
  it('spring-forward 2026-03-08: skips 02:30 ET slot for that day if present', async () => {
    // 2026-03-08 02:00 ET jumps to 03:00 ET. A schedule with a 02:30 slot has no
    // valid 02:30 ET on that day. Use a synthetic schedule for the test:
    const channel: ChannelForSchedule = {
      id: 'c1', timezone: 'America/New_York',
      posting_schedule: { weekdays: ['07:30'], weekends: ['02:30', '11:30'] },
    };
    // Sun 2026-03-08 01:00 ET. Expect: 02:30 is skipped (luxon isValid=false), result is 11:30.
    const since = DateTime.fromISO('2026-03-08T01:00:00', { zone: 'America/New_York' }).toUTC();
    const slot = await nextOpenSlotAfter(channel, since, async () => false);
    expect(slot.setZone('America/New_York').toFormat('yyyy-LL-dd HH:mm')).toBe('2026-03-08 11:30');
  });

  it('fall-back 2026-11-01: 01:30 ET resolves to the SECOND (standard-time) occurrence', async () => {
    const channel: ChannelForSchedule = {
      id: 'c1', timezone: 'America/New_York',
      posting_schedule: { weekdays: ['07:30'], weekends: ['01:30', '11:30'] },
    };
    // Sun 2026-11-01 00:30 ET (still EDT). Expect: 01:30 resolves to standard-time (later UTC),
    // i.e. UTC 06:30 (EDT 01:30 would be UTC 05:30; standard 01:30 is UTC 06:30).
    const since = DateTime.fromISO('2026-11-01T00:30:00', { zone: 'America/New_York' }).toUTC();
    const slot = await nextOpenSlotAfter(channel, since, async () => false);
    expect(slot.toUTC().toISO()).toBe('2026-11-01T06:30:00.000Z');
  });
});
