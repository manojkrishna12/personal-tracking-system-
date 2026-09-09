import { addDaysStr } from '../utils/dates'

export interface StreakResult {
  current: number
  best: number
}

export interface StreaksResult {
  tracking: StreakResult
  habits: Record<string, StreakResult>
  /**
   * Reverse-goal habits (success = explicitly marked ✗). Computed only for
   * keys present in the input map — absent keys mean "no avoid streak".
   * Derived from the same records every call; nothing is stored, so editing
   * any past day recalculates automatically.
   */
  avoidHabits: Record<string, StreakResult>
}

/**
 * Strict streaks — no today/yesterday grace:
 *  - tracking streak: consecutive calendar days with a saved DailyRecord
 *  - habit streak:    consecutive calendar days where the habit is explicitly ✓
 *  - avoid streak:    consecutive calendar days where the habit is explicitly ✗
 *                     (reverse goals like Maggie — not doing it is success)
 * A missing day breaks the streak. For habits, ✓ and ✗ are each other's
 * opposite: a recorded opposite day ends the run; an unrecorded day ends it too.
 */
export function computeStreaks(
  recordedDates: string[],
  habitCompletedDates: Record<string, string[]>,
  today: string,
  habitNotCompletedDates: Record<string, string[]> = {},
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

  const avoidHabits: Record<string, StreakResult> = {}
  for (const [key, dates] of Object.entries(habitNotCompletedDates)) {
    const set = new Set(dates)
    avoidHabits[key] = { current: runEndingToday(set, today), best: bestRun(set) }
  }

  return { tracking, habits, avoidHabits }
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
