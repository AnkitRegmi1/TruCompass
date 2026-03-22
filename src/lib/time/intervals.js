import { buildDisplayTimeRange } from "./timeZone.js";

export function overlapsRange(start, end, rangeStart, rangeEnd) {
  return start < rangeEnd && end > rangeStart;
}

export function clampRange(start, end, rangeStart, rangeEnd) {
  const clampedStart = start > rangeStart ? start : rangeStart;
  const clampedEnd = end < rangeEnd ? end : rangeEnd;

  if (clampedEnd <= clampedStart) {
    return null;
  }

  return {
    start: clampedStart,
    end: clampedEnd,
  };
}

export function mergeRanges(ranges) {
  if (!ranges.length) {
    return [];
  }

  const sortedRanges = [...ranges].sort((left, right) => left.start - right.start);
  const mergedRanges = [sortedRanges[0]];

  for (const currentRange of sortedRanges.slice(1)) {
    const lastRange = mergedRanges.at(-1);

    if (currentRange.start <= lastRange.end) {
      lastRange.end = new Date(
        Math.max(lastRange.end.getTime(), currentRange.end.getTime()),
      );
      continue;
    }

    mergedRanges.push(currentRange);
  }

  return mergedRanges;
}

export function createDisplayBlock(start, end, timeZone, extra = {}) {
  return {
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    label: buildDisplayTimeRange(start, end, timeZone, false),
    durationMinutes: Math.round((end.getTime() - start.getTime()) / 60_000),
    ...extra,
  };
}
