/**
 * Goal System Maintenance Jobs
 *
 * Handles 4 scheduled jobs for the weekly goal system:
 * 1. Weekly finalization - close past-due goal sets
 * 2. Current-week pre-generation - create goal sets at week start
 * 3. Daily rollup snapshots - materialize daily aggregates
 * 4. Integrity repair sweeper - heal inconsistencies
 *
 * These jobs are designed to be called by:
 * - pg_cron on the self-hosted Supabase instance
 * - Or manually via API/admin tools
 */

import { supabase } from '@/lib/supabase'
import { goalService } from '@/services/goalService'
import { logError } from '@/lib/logger'

export const goalJobService = {
  /**
   * Job 1: Weekly Finalization
   * Finds goal sets that have ended and closes them with final status.
   * Captures closing_overdue_count for accurate final review_health status.
   *
   * @returns Number of goal sets finalized
   */
  async runWeeklyFinalization(): Promise<number> {
    try {
      // Find open goal sets that have passed their end time
      const { data: openSets, error } = await supabase
        .schema('indonesian')
        .from('learner_weekly_goal_sets')
        .select('id, user_id')
        .lt('week_ends_at_utc', new Date().toISOString())
        .is('closed_at', null)

      if (error) throw error
      if (!openSets || openSets.length === 0) return 0

      // Finalize each one using the shared goal service
      let finalized = 0
      for (const set of openSets) {
        try {
          await goalService.finalizeWeek(set.id)
          finalized++
        } catch (err) {
          logError({ page: 'goalJobService', action: 'finalizeGoalSet', error: err })
          // Continue with next set even if one fails
        }
      }

      return finalized
    } catch (err) {
      logError({ page: 'goalJobService', action: 'runWeeklyFinalization', error: err })
      throw err
    }
  },

  /**
   * Job 2: Current-Week Pre-Generation
   * Creates goal sets for users whose local week has started but don't have a current set yet.
   * Reduces first-open latency by preparing goals in advance.
   *
   * @returns Number of goal sets generated
   */
  async runCurrentWeekPreGeneration(): Promise<number> {
    try {
      // Fetch all users with valid timezones
      const { data: users, error: usersError } = await supabase
        .schema('indonesian')
        .from('profiles')
        .select('id, timezone')
        .not('timezone', 'is', null)

      if (usersError) throw usersError
      if (!users || users.length === 0) return 0

      let generated = 0
      const now = new Date()

      for (const user of users) {
        try {
          // Check if user already has a current-week goal set
          const { data: existingSet } = await supabase
            .schema('indonesian')
            .from('learner_weekly_goal_sets')
            .select('id')
            .eq('user_id', user.id)
            .lte('week_starts_at_utc', now.toISOString())
            .gt('week_ends_at_utc', now.toISOString())
            .limit(1)

          if (existingSet && existingSet.length > 0) {
            // User already has current week set
            continue
          }

          // Generate new goal set using shared service
          const goalSet = await goalService.generateWeeklyGoalSet(user.id, user.timezone, now)
          if (goalSet) generated++
        } catch (err) {
          logError({ page: 'goalJobService', action: 'generateGoalSetForUser', error: err })
          // Continue with next user
        }
      }

      return generated
    } catch (err) {
      logError({ page: 'goalJobService', action: 'runCurrentWeekPreGeneration', error: err })
      throw err
    }
  },

  /**
   * Job 3: Daily Rollup Snapshots
   * Materializes denormalized daily aggregates for trends, analytics, and lightweight history.
   * Runs hourly to capture daily boundary rollovers without per-timezone cron definitions.
   *
   * @returns Number of rollup rows created/updated
   */
  async runDailyRollupSnapshot(): Promise<number> {
    try {
      // Fetch all users with valid timezones
      const { data: users, error: usersError } = await supabase
        .schema('indonesian')
        .from('profiles')
        .select('id, timezone')
        .not('timezone', 'is', null)

      if (usersError) throw usersError
      if (!users || users.length === 0) return 0

      let rollupCount = 0

      for (const user of users) {
        try {
          // Get today's date in user's timezone
          const localDate = getLocalDate(new Date(), user.timezone)
          const localDateStr = localDate.toISOString().split('T')[0]

          // Check if rollup already exists for today
          const { data: existing } = await supabase
            .schema('indonesian')
            .from('learner_daily_goal_rollups')
            .select('id')
            .eq('user_id', user.id)
            .eq('local_date', localDateStr)
            .limit(1)

          // Calculate daily metrics
          const startOfDay = new Date(localDate)
          startOfDay.setHours(0, 0, 0, 0)
          const endOfDay = new Date(localDate)
          endOfDay.setHours(23, 59, 59, 999)

          // Study day completed (has any review events today)
          const { data: reviews } = await supabase
            .schema('indonesian')
            .from('review_events')
            .select('id')
            .eq('user_id', user.id)
            .gte('created_at', startOfDay.toISOString())
            .lt('created_at', endOfDay.toISOString())
            .limit(1)

          const studyDayCompleted = reviews && reviews.length > 0

          // Recall accuracy for today
          const { data: todayRecalls } = await supabase
            .schema('indonesian')
            .from('review_events')
            .select('was_correct')
            .eq('user_id', user.id)
            .eq('skill_type', 'form_recall')
            .gte('created_at', startOfDay.toISOString())
            .lt('created_at', endOfDay.toISOString())

          let recallAccuracy: number | null = null
          let recallSampleSize = 0
          if (todayRecalls && todayRecalls.length > 0) {
            recallSampleSize = todayRecalls.length
            const correct = todayRecalls.filter(r => r.was_correct).length
            recallAccuracy = correct / recallSampleSize
          }

          // Usable items gained today
          const { data: stageEvents } = await supabase
            .schema('indonesian')
            .from('learner_stage_events')
            .select('learning_item_id')
            .eq('user_id', user.id)
            .in('to_stage', ['retrieving', 'productive', 'maintenance'])
            .gte('created_at', startOfDay.toISOString())
            .lt('created_at', endOfDay.toISOString())

          const usableItemsGainedToday = new Set(stageEvents?.map(e => e.learning_item_id) ?? []).size

          // Overdue count at end of day
          const { data: overdueSkills, error: overdueError } = await supabase
            .schema('indonesian')
            .from('learner_skill_state')
            .select('id', { count: 'exact' })
            .eq('user_id', user.id)
            .lt('next_due_at', endOfDay.toISOString())

          const overdueCount = !overdueError && overdueSkills ? overdueSkills.length : 0

          // Get total usable items (for context)
          const { data: allUsableItems } = await supabase
            .schema('indonesian')
            .from('learner_item_state')
            .select('id', { count: 'exact' })
            .eq('user_id', user.id)
            .in('stage', ['retrieving', 'productive', 'maintenance'])

          const usableItemsTotal = allUsableItems?.length ?? 0

          // Upsert or insert rollup
          if (existing && existing.length > 0) {
            // Update existing
            await supabase
              .schema('indonesian')
              .from('learner_daily_goal_rollups')
              .update({
                study_day_completed: studyDayCompleted,
                recall_accuracy: recallAccuracy,
                recall_sample_size: recallSampleSize,
                usable_items_gained_today: usableItemsGainedToday,
                usable_items_total: usableItemsTotal,
                overdue_count: overdueCount,
                updated_at: new Date().toISOString()
              })
              .eq('user_id', user.id)
              .eq('local_date', localDateStr)
          } else {
            // Insert new
            await supabase
              .schema('indonesian')
              .from('learner_daily_goal_rollups')
              .insert({
                user_id: user.id,
                goal_timezone: user.timezone,
                local_date: localDateStr,
                study_day_completed: studyDayCompleted,
                recall_accuracy: recallAccuracy,
                recall_sample_size: recallSampleSize,
                usable_items_gained_today: usableItemsGainedToday,
                usable_items_total: usableItemsTotal,
                overdue_count: overdueCount
              })
          }

          rollupCount++
        } catch (err) {
          logError({ page: 'goalJobService', action: 'createDailyRollup', error: err })
          // Continue with next user
        }
      }

      return rollupCount
    } catch (err) {
      logError({ page: 'goalJobService', action: 'runDailyRollupSnapshot', error: err })
      throw err
    }
  },

  /**
   * Job 4: Integrity and Repair Sweeper
   * Detects and repairs inconsistent goal state across scheduled and live flows.
   * Runs daily to heal orphaned rows, close overdue weeks, etc.
   *
   * @returns Number of repairs made
   */
  async runIntegrityRepairSweeper(): Promise<number> {
    let repairsCount = 0

    try {
      // Repair 1: Heal goal sets missing child rows
      const { data: goalSets } = await supabase
        .schema('indonesian')
        .from('learner_weekly_goal_sets')
        .select('id, user_id')

      if (goalSets) {
        for (const set of goalSets) {
          try {
            const { data: existingGoals } = await supabase
              .schema('indonesian')
              .from('learner_weekly_goals')
              .select('goal_type')
              .eq('goal_set_id', set.id)

            const existingTypes = new Set(existingGoals?.map(g => g.goal_type) ?? [])
            const expectedTypes = ['consistency', 'recall_quality', 'usable_vocabulary', 'review_health']
            const missingTypes = expectedTypes.filter(t => !existingTypes.has(t))

            if (missingTypes.length > 0) {
              // Regenerate missing goal rows
              const { data: goalSet } = await supabase
                .schema('indonesian')
                .from('learner_weekly_goal_sets')
                .select('*')
                .eq('id', set.id)
                .single()

              if (goalSet) {
                // Get profile timezone
                const { data: profile } = await supabase
                  .schema('indonesian')
                  .from('profiles')
                  .select('timezone')
                  .eq('id', set.user_id)
                  .single()

                if (profile?.timezone) {
                  // Regenerate missing goals using default targets
                  const defaults = {
                    consistency: { direction: 'at_least', unit: 'count', target: 4 },
                    recall_quality: { direction: 'at_least', unit: 'percent', target: 0.80 },
                    usable_vocabulary: { direction: 'at_least', unit: 'count', target: 8 },
                    review_health: { direction: 'at_most', unit: 'count', target: 20 }
                  }

                  for (const goalType of missingTypes) {
                    const targets = defaults[goalType as keyof typeof defaults]
                    if (!targets) continue

                    await supabase
                      .schema('indonesian')
                      .from('learner_weekly_goals')
                      .insert({
                        goal_set_id: set.id,
                        goal_type: goalType,
                        goal_direction: targets.direction,
                        goal_unit: targets.unit,
                        target_value_numeric: targets.target,
                        current_value_numeric: 0,
                        status: 'on_track',
                        is_provisional: false
                      })
                    repairsCount++
                  }
                }
              }
            }
          } catch (err) {
            logError({ page: 'goalJobService', action: 'repairGoalSet', error: err })
          }
        }
      }

      // Repair 2: Close still-open weeks that have passed end time
      const { data: overdueSets } = await supabase
        .schema('indonesian')
        .from('learner_weekly_goal_sets')
        .select('id')
        .lt('week_ends_at_utc', new Date().toISOString())
        .is('closed_at', null)

      if (overdueSets) {
        for (const set of overdueSets) {
          try {
            await goalService.finalizeWeek(set.id)
            repairsCount++
          } catch (err) {
            logError({ page: 'goalJobService', action: 'closeOverdueGoalSet', error: err })
          }
        }
      }
    } catch (err) {
      logError({ page: 'goalJobService', action: 'runIntegrityRepairSweeper', error: err })
      throw err
    }

    return repairsCount
  }
}

/**
 * Helper: Get local date in user's timezone
 */
function getLocalDate(utcDate: Date, timezone: string): Date {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: timezone,
    })

    const parts = formatter.formatToParts(utcDate)
    const year = parseInt(parts.find(p => p.type === 'year')?.value ?? '2026', 10)
    const month = parseInt(parts.find(p => p.type === 'month')?.value ?? '1', 10) - 1
    const day = parseInt(parts.find(p => p.type === 'day')?.value ?? '1', 10)

    return new Date(year, month, day)
  } catch {
    // Fallback to UTC if timezone is invalid
    return utcDate
  }
}
