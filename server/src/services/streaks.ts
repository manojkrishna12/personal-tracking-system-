import { addDaysStr } from '../utils/dates'

export interface StreakResult {
  current: number
  best: number
}

export interface StreaksResult {
  tracking: StreakResult
  habits: Record<string, StreakResult>
}

/**
 * Strict streaks — no today/yesterday grace:
 *  - tracking streak: consecutive calendar days with a saved DailyRecord
 *  - habit streak:    consecutive calendar days where the habit is explicitly ✓
 * A missing day (or a ✗ day for habits) breaks the streak.
 */
export function computeStreaks(
  recordedDates: string[],
  habitCompletedDates: Record<string, string[]>,
  today: string,
): StreaksResult {
  const recorded = new Set(recordedDates)
  const tracking = {
    current: runEndingToday(recorded, today),
    best: bestRun(recorded),
  }

  const habits: Record<string, StreakResult> = {}
  for (const [key, dates] of Object.entries(habitCompletedDates)) {
    const set = new Set(dates)
    habits[key] = { current: runEndingToday(set, today), best: bestRun(set) }
  }

  return { tracking, habits }
}

function runEndingToday(set: Set<string>, today: string): number {
  let count = 0
  let d = today
  while (set.has(d)) {
    count++
    d = addDaysStr(d, -1)
  }
  return count
}

function bestRun(set: Set<string>): number {
  const dates = [...set].sort()
  let best = 0
  let run = 0
  let prev: string | null = null
  for (const d of dates) {
    run = prev !== null && d === addDaysStr(prev, 1) ? run + 1 : 1
    if (run > best) best = run
    prev = d
  }
  return best
}