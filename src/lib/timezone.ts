import 'server-only';
import { DateTime } from 'luxon';

export interface PostingSchedule {
  weekdays: string[]; // "HH:MM"
  weekends: string[];
}

export interface ChannelForSchedule {
  id: string;
  timezone: string;
  posting_schedule: PostingSchedule;
}

export class BacklogOverflowError extends Error {
  constructor(public channelId: string) {
    super(`BacklogOverflowError: no open slot in 14d horizon for channel ${channelId}`);
    this.name = 'BacklogOverflowError';
  }
}

const MAX_HORIZON_DAYS = 14;

/**
 * Returns the next open slot (as a UTC DateTime) on or after `since`, per the
 * channel's posting_schedule + timezone. Skips DST-eliminated slots. For
 * fall-back ambiguous times, resolves to the SECOND occurrence (standard-time,
 * later in UTC) by shifting candidates whose wall clock is preserved after
 * adding the offset delta.
 *
 * `isOccupied` is async because the cron uses a Supabase query.
 */
export async function nextOpenSlotAfter(
  channel: ChannelForSchedule,
  since: DateTime,
  isOccupied: (slotUtc: DateTime) => Promise<boolean>,
): Promise<DateTime> {
  const tz = channel.timezone;
  const sinceLocal = since.setZone(tz);

  for (let dayOffset = 0; dayOffset <= MAX_HORIZON_DAYS; dayOffset++) {
    const day = sinceLocal.plus({ days: dayOffset });
    // luxon: 1=Mon..7=Sun; weekend = Sat(6) or Sun(7)
    const isWeekend = day.weekday >= 6;
    const slots = isWeekend
      ? channel.posting_schedule.weekends
      : channel.posting_schedule.weekdays;

    // Detect fall-back transition: compare offset at start of day vs 3 AM
    // (well past any spring/fall transition). If start offset > end offset,
    // this is a fall-back day; we'll resolve ambiguous slots to standard-time.
    const threeAm = day.set({ hour: 3, minute: 0, second: 0, millisecond: 0 });
    const postTransitionOffset = threeAm.offset;

    for (const slotStr of slots) {
      const m = /^(\d{1,2}):(\d{2})$/.exec(slotStr);
      if (!m) continue;
      const h = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);

      const candidate = day.set({ hour: h, minute: min, second: 0, millisecond: 0 });

      // Spring-forward: luxon silently shifts an eliminated slot forward.
      // Detect by comparing the requested hour/minute against what luxon produced.
      if (candidate.hour !== h || candidate.minute !== min) continue;

      // Fall-back: when luxon resolves an ambiguous wall time to the first (DST) occurrence,
      // shifting forward by the offset delta lands on the second (standard-time) occurrence
      // AT THE SAME WALL CLOCK. For non-ambiguous times the shifted instant has a different
      // wall clock, so we leave the original candidate alone.
      let slotLocal = candidate;
      if (candidate.offset !== postTransitionOffset) {
        const offsetDiff = candidate.offset - postTransitionOffset;
        const shifted = candidate.plus({ minutes: offsetDiff });
        if (shifted.hour === h && shifted.minute === min) {
          slotLocal = shifted;
        }
      }

      if (slotLocal <= sinceLocal) continue;
      const slotUtc = slotLocal.toUTC();
      if (await isOccupied(slotUtc)) continue;
      return slotUtc;
    }
  }
  throw new BacklogOverflowError(channel.id);
}

export function toLocalHourDow(at: Date, tz: string): { hour: number; dow: number } {
  const local = DateTime.fromJSDate(at).setZone(tz);
  // luxon: 1=Mon..7=Sun; convert to 0=Sun..6=Sat
  return { hour: local.hour, dow: local.weekday === 7 ? 0 : local.weekday };
}
