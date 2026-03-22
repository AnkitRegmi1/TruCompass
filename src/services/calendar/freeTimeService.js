import { clampRange, createDisplayBlock, mergeRanges } from "../../lib/time/intervals.js";

export class FreeTimeService {
  calculateFreeBlocks({ busyRanges, wakingRange, timeZone }) {
    const clampedBusyRanges = busyRanges
      .map((range) =>
        clampRange(range.start, range.end, wakingRange.start, wakingRange.end),
      )
      .filter(Boolean);

    const mergedBusyRanges = mergeRanges(clampedBusyRanges);
    const freeBlocks = [];
    let cursor = wakingRange.start;

    for (const busyRange of mergedBusyRanges) {
      if (busyRange.start > cursor) {
        freeBlocks.push(createDisplayBlock(cursor, busyRange.start, timeZone));
      }

      if (busyRange.end > cursor) {
        cursor = busyRange.end;
      }
    }

    if (cursor < wakingRange.end) {
      freeBlocks.push(createDisplayBlock(cursor, wakingRange.end, timeZone));
    }

    return freeBlocks;
  }
}
