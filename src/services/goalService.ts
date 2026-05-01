// src/services/goalService.ts
import { supabase } from '@/lib/supabase'
import { learnerProgressService } from '@/services/learnerProgressService'
import type {
  WeeklyGoalSet,
  WeeklyGoal,
  WeeklyGoalResponse,
  GoalStatus,
  TodayPlan
} from '@/types/learning'

export const goalService = {
  /**
   * Main entry point for the dashboard to get the current week's goals and today's plan.
   */
  async getGoalProgress(userId: string): Promise<WeeklyGoalResponse> {
    // 1. Get profile for timezone
    const { data: profile, error: profileError } = await supabase
      .schema('indonesian')
      .from('profiles')
      .select('timezone, preferred_session_size')
      .eq('id', userId)
      .single()

    if (profileError || !profile?.timezone) {
      return {
        state: 'timezone_required',
        weeklyGoalSet: null,
        weeklyGoals: [],
        todayPlan: null,
        requiredProfileAction: 'set_timezone'
      }
    }

    const timezone = profile.timezone
    const now = new Date()

    // 2. Look for current goal set
    let goalSet = await this.getCurrentGoalSet(userId, now)

    // 3. If no current set, finalize older ones and generate new one
    if (!goalSet) {
      await this.finalizeOlderWeeks(userId, now)
      goalSet = await this.generateWeeklyGoalSet(userId, timezone, now)
    }

    // 4. Get child goals
    let goals = await this.getGoalsForSet(goalSet.id)

    // 5. Refresh open-week progress
    if (!goalSet.closed_at) {
      goals = await this.refreshGoalProgress(userId, goalSet, goals)
    }

    // 6. Compute today's plan
    const todayPlan = await this.computeTodayPlan(userId, profile.preferred_session_size, goalSet, goals)

    return {
      state: 'active',
      weeklyGoalSet: goalSet,
      weeklyGoals: goals,
      todayPlan
    }
  },

  async getCurrentGoalSet(userId: string, now: Date): Promise<WeeklyGoalSet | null> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learner_weekly_goal_sets')
      .select('*')
      .eq('user_id', userId)
      .lte('week_starts_at_utc', now.toISOString())
      .gt('week_ends_at_utc', now.toISOString())
      .maybeSingle()

    if (error) throw error
    return data
  },

  async getGoalsForSet(goalSetId: string): Promise<WeeklyGoal[]> {
    const { data, error } = await supabase
      .schema('indonesian')
      .from('learner_weekly_goals')
      .select('*')
      .eq('goal_set_id', goalSetId)

    if (error) throw error
    return data
  },

  async finalizeOlderWeeks(userId: string, now: Date): Promise<void> {
    const { data: olderSets, error } = await supabase
      .schema('indonesian')
      .from('learner_weekly_goal_sets')
      .select('id')
      .eq('user_id', userId)
      .lt('week_ends_at_utc', now.toISOString())
      .is('closed_at', null)

    if (error) throw error
    for (const set of olderSets) {
      await this.finalizeWeek(set.id)
    }
  },

  /**
   * Generates a new weekly goal set with adaptive targets from the prior week.
   */
  async generateWeeklyGoalSet(userId: string, timezone: string, now: Date): Promise<WeeklyGoalSet> {
    const boundaries = this.getWeekBoundaries(now, timezone)
    
    // Get prior closed week to adapt targets
    const { data: priorSet } = await supabase
      .schema('indonesian')
      .from('learner_weekly_goal_sets')
      .select('*, learner_weekly_goals(*)')
      .eq('user_id', userId)
      .lt('week_ends_at_utc', boundaries.weekStartsAtUtc.toISOString())
      .order('week_ends_at_utc', { ascending: false })
      .limit(1)
      .maybeSingle()

    const targets = this.determineAdaptiveTargets(priorSet)

    // Atomic creation
    const { data: goalSet, error: setBatchError } = await supabase
      .schema('indonesian')
      .from('learner_weekly_goal_sets')
      .insert({
        user_id: userId,
        goal_timezone: timezone,
        week_start_date_local: boundaries.weekStartDateLocal,
        week_end_date_local: boundaries.weekEndDateLocal,
        week_starts_at_utc: boundaries.weekStartsAtUtc.toISOString(),
        week_ends_at_utc: boundaries.weekEndsAtUtc.toISOString(),
      })
      .select()
      .single()

    if (setBatchError) throw setBatchError

    const goalsToInsert = [
      {
        goal_set_id: goalSet.id,
        goal_type: 'consistency',
        goal_direction: 'at_least',
        goal_unit: 'count',
        target_value_numeric: targets.consistency,
      },
      {
        goal_set_id: goalSet.id,
        goal_type: 'recall_quality',
        goal_direction: 'at_least',
        goal_unit: 'percent',
        target_value_numeric: targets.recall_quality,
      },
      {
        goal_set_id: goalSet.id,
        goal_type: 'usable_vocabulary',
        goal_direction: 'at_least',
        goal_unit: 'count',
        target_value_numeric: targets.usable_vocabulary,
      },
      {
        goal_set_id: goalSet.id,
        goal_type: 'review_health',
        goal_direction: 'at_most',
        goal_unit: 'count',
        target_value_numeric: targets.review_health,
      }
    ]

    const { error: goalsError } = await supabase
      .schema('indonesian')
      .from('learner_weekly_goals')
      .insert(goalsToInsert)

    if (goalsError) throw goalsError

    return goalSet
  },

  /**
   * Determine targets based on prior week's performance.
   */
  determineAdaptiveTargets(priorSet: any) {
    const defaults = {
      consistency: 4,
      recall_quality: 0.80,
      usable_vocabulary: 8,
      review_health: 20
    }

    if (!priorSet) return defaults

    const priorGoals = priorSet.learner_weekly_goals as WeeklyGoal[]
    const consistencyGoal = priorGoals.find(g => g.goal_type === 'consistency')
    const recallGoal = priorGoals.find(g => g.goal_type === 'recall_quality')
    const vocabGoal = priorGoals.find(g => g.goal_type === 'usable_vocabulary')
    const healthGoal = priorGoals.find(g => g.goal_type === 'review_health')

    const targets = { ...defaults }
    if (consistencyGoal) targets.consistency = consistencyGoal.target_value_numeric
    if (recallGoal) targets.recall_quality = recallGoal.target_value_numeric
    if (vocabGoal) targets.usable_vocabulary = vocabGoal.target_value_numeric
    if (healthGoal) targets.review_health = healthGoal.target_value_numeric

    // 1. Protective reduction rule
    if (healthGoal && (healthGoal.status as string) === 'missed') {
      targets.consistency = Math.max(targets.consistency - 1, 4)
      targets.recall_quality = Math.max(targets.recall_quality - 0.02, 0.80)
      targets.usable_vocabulary = Math.max(targets.usable_vocabulary - 2, 6)
    } 
    // 2. Promotion rule
    else if (
      consistencyGoal?.status === 'achieved' &&
      recallGoal?.status === 'achieved' &&
      vocabGoal?.status === 'achieved' &&
      healthGoal?.status !== 'missed' &&
      (recallGoal?.sample_size ?? 0) >= 20
    ) {
      targets.consistency = Math.min(targets.consistency + 1, 6)
      targets.recall_quality = Math.min(targets.recall_quality + 0.02, 0.85)
      targets.usable_vocabulary = Math.min(targets.usable_vocabulary + 2, 16)
    }

    return targets
  },

  /**
   * Boundary helper for Monday-start weeks.
   */
  getWeekBoundaries(now: Date, timezone: string) {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    })
    const parts = formatter.formatToParts(now)
    const partMap = Object.fromEntries(parts.map(p => [p.type, p.value])) as any
    
    // Create a normalized local date object (independent of actual time of day)
    // We use UTC methods to avoid local system timezone interference during calculations
    const y = parseInt(partMap.year)
    const m = parseInt(partMap.month) - 1
    const d = parseInt(partMap.day)
    
    const localDate = new Date(Date.UTC(y, m, d))
    
    const dayNumericFormatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' })
    const dayShort = dayNumericFormatter.format(now)
    const dayMap: Record<string, number> = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 }
    const dayOfWeek = dayMap[dayShort]

    const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    
    const mondayLocal = new Date(localDate)
    mondayLocal.setUTCDate(mondayLocal.getUTCDate() - daysToSubtract)
    
    const weekStartDateLocal = mondayLocal.toISOString().split('T')[0]
    
    const nextMondayLocal = new Date(mondayLocal)
    nextMondayLocal.setUTCDate(nextMondayLocal.getUTCDate() + 7)
    const weekEndDateLocal = nextMondayLocal.toISOString().split('T')[0]

    // To get the exact UTC instant for Monday 00:00 in that timezone:
    const weekStartsAtUtc = this.getUtcForLocalTimeParts(
      mondayLocal.getUTCFullYear(),
      mondayLocal.getUTCMonth() + 1,
      mondayLocal.getUTCDate(),
      timezone
    )
    
    const weekEndsAtUtc = this.getUtcForLocalTimeParts(
      nextMondayLocal.getUTCFullYear(),
      nextMondayLocal.getUTCMonth() + 1,
      nextMondayLocal.getUTCDate(),
      timezone
    )

    return {
      weekStartDateLocal,
      weekEndDateLocal,
      weekStartsAtUtc,
      weekEndsAtUtc
    }
  },

  getUtcForLocalTimeParts(year: number, month: number, day: number, timezone: string): Date {
    // Strategy: find the UTC instant such that when formatted in 'timezone', it is exactly year-month-day 00:00:00
    const pad = (n: number) => n.toString().padStart(2, '0')
    const targetLocalStr = `${year}-${pad(month)}-${pad(day)} 00:00:00`
    
    // Start with a guess: the UTC date with these parts
    let guess = new Date(Date.UTC(year, month - 1, day))
    
    // Adjust guess until it matches
    for (let i = 0; i < 2; i++) {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        hour12: false
      })
      const p = Object.fromEntries(formatter.formatToParts(guess).map(p => [p.type, p.value])) as any
      const currentLocalStr = `${p.year}-${pad(parseInt(p.month))}-${pad(parseInt(p.day))} ${pad(parseInt(p.hour === '24' ? '0' : p.hour))}:00:00`
      
      if (currentLocalStr === targetLocalStr) break
      
      // If not matching, adjust by the difference
      const currentLocalDate = new Date(Date.UTC(parseInt(p.year), parseInt(p.month) - 1, parseInt(p.day), parseInt(p.hour === '24' ? '0' : p.hour)))
      const targetLocalDate = new Date(Date.UTC(year, month - 1, day))
      const diff = targetLocalDate.getTime() - currentLocalDate.getTime()
      guess = new Date(guess.getTime() + diff)
    }
    
    return guess
  },

  async refreshGoalProgress(userId: string, goalSet: WeeklyGoalSet, goals: WeeklyGoal[]): Promise<WeeklyGoal[]> {
    const now = new Date()
    const elapsedFraction = (now.getTime() - new Date(goalSet.week_starts_at_utc).getTime()) / (7 * 24 * 60 * 60 * 1000)

    const refreshedGoals: WeeklyGoal[] = []

    for (const goal of goals) {
      let currentVal = 0
      let sampleSize = 0
      let status: GoalStatus = 'on_track'
      let isProvisional = false
      let provisionalReason = null
      let goalConfigJsonb: Record<string, unknown> | null = null

      if (goal.goal_type === 'consistency') {
        const studyDays = await this.getStudyDaysCount(userId, goalSet)
        currentVal = studyDays
        status = this.computeConsistencyStatus(currentVal, goal.target_value_numeric, goalSet)
      } 
      else if (goal.goal_type === 'recall_quality') {
        const stats = await this.getRecallAndRecognitionStats(userId, goalSet)
        currentVal = stats.recallAccuracy
        sampleSize = stats.recallSampleSize
        isProvisional = sampleSize < 10
        if (isProvisional) provisionalReason = 'Low sample size'
        status = this.computeRecallStatus(currentVal, goal.target_value_numeric, sampleSize)
        goalConfigJsonb = {
          recognition_accuracy: stats.recognitionAccuracy,
          recall_accuracy: stats.recallAccuracy,
          recognition_sample_size: stats.recognitionSampleSize,
          recall_sample_size: stats.recallSampleSize,
        }
      }
      else if (goal.goal_type === 'usable_vocabulary') {
        currentVal = await this.getUsableVocabGain(userId, goalSet)
        status = this.computeVocabStatus(currentVal, goal.target_value_numeric, elapsedFraction)
      }
      else if (goal.goal_type === 'review_health') {
        currentVal = await this.getOverdueCount(userId, goalSet.goal_timezone)
        status = this.computeHealthStatus(currentVal, goal.target_value_numeric)
      }

      const updatePayload: Record<string, unknown> = {
        current_value_numeric: currentVal,
        status,
        sample_size: sampleSize,
        is_provisional: isProvisional,
        provisional_reason: provisionalReason,
        updated_at: new Date().toISOString(),
      }
      if (goalConfigJsonb !== null) updatePayload.goal_config_jsonb = goalConfigJsonb

      const { data: updatedGoal, error } = await supabase
        .schema('indonesian')
        .from('learner_weekly_goals')
        .update(updatePayload)
        .eq('id', goal.id)
        .select()
        .single()

      if (error) throw error
      refreshedGoals.push(updatedGoal)
    }

    return refreshedGoals
  },

  async getStudyDaysCount(userId: string, goalSet: WeeklyGoalSet): Promise<number> {
    // Canonical contract: distinct study-day count goes through learnerProgressService.
    // The SQL function get_study_days_count buckets capability_review_events
    // by user-timezone date — semantically identical to the legacy
    // toLocaleDateString({ timeZone }) bucketing, against the capability system.
    return learnerProgressService.getStudyDaysCount({
      userId,
      weekStartUtc: goalSet.week_starts_at_utc,
      weekEndUtc: goalSet.week_ends_at_utc,
      timezone: goalSet.goal_timezone,
    })
  },

  async getRecallAndRecognitionStats(userId: string, goalSet: WeeklyGoalSet): Promise<{
    recallAccuracy: number
    recallSampleSize: number
    recognitionAccuracy: number
    recognitionSampleSize: number
  }> {
    // Canonical contract: weekly recall/recognition stats go through
    // learnerProgressService. Architect NIT-1 v4: the service returns RAW
    // counts (not ratios); we adapt counts → ratios here for the goal
    // evaluator's accuracy semantics. recognition maps to capability_type
    // 'text_recognition' (matching the legacy 'recognition' skill_type).
    const counts = await learnerProgressService.getRecallStatsForWeek({
      userId,
      weekStartUtc: goalSet.week_starts_at_utc,
      weekEndUtc: goalSet.week_ends_at_utc,
    })

    return {
      recallAccuracy: counts.recallTotal > 0
        ? counts.recallCorrect / counts.recallTotal
        : 0,
      recallSampleSize: counts.recallTotal,
      recognitionAccuracy: counts.recognitionTotal > 0
        ? counts.recognitionCorrect / counts.recognitionTotal
        : 0,
      recognitionSampleSize: counts.recognitionTotal,
    }
  },

  async getUsableVocabGain(userId: string, goalSet: WeeklyGoalSet): Promise<number> {
    // Canonical contract: usable vocabulary gained this week goes through
    // learnerProgressService. Semantic shift documented in spec §10:
    // legacy counted distinct learning_item_ids transitioning to stage
    // 'retrieving'/'productive'/'maintenance' in the week (via learner_stage_events);
    // capability equivalent counts distinct items whose first-ever form_recall
    // capability_review_event fell in the week. For users on the capability
    // session path this is a faithful mirror; legacy-path users won't have
    // capability_review_events anyway.
    return learnerProgressService.getUsableVocabularyGain({
      userId,
      weekStartUtc: goalSet.week_starts_at_utc,
      weekEndUtc: goalSet.week_ends_at_utc,
    })
  },

  async getOverdueCount(userId: string, timezone: string): Promise<number> {
    // Canonical contract: overdue capabilities go through learnerProgressService.
    // The SQL function get_overdue_count computes start-of-today in the user's
    // timezone and counts active+ready+published capabilities with
    // next_due_at < that boundary — same semantics as the legacy code, against
    // the capability system.
    return learnerProgressService.getOverdueCount({ userId, timezone })
  },

  computeConsistencyStatus(current: number, target: number, goalSet: WeeklyGoalSet): GoalStatus {
    if (current >= target) return 'achieved'
    
    // Check if still recoverable
    const now = new Date()
    const endsAt = new Date(goalSet.week_ends_at_utc)
    const remainingDays = Math.ceil((endsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    
    return (current + remainingDays >= target) ? 'on_track' : 'at_risk'
  },

  computeRecallStatus(current: number, target: number, sampleSize: number): GoalStatus {
    if (sampleSize === 0) return 'on_track'
    if (current >= target) return 'achieved'
    return (current >= target - 0.03) ? 'on_track' : 'at_risk'
  },

  computeVocabStatus(current: number, target: number, elapsedFraction: number): GoalStatus {
    if (current >= target) return 'achieved'
    const expected = target * elapsedFraction
    return (current >= expected) ? 'on_track' : 'at_risk'
  },

  computeHealthStatus(current: number, target: number): GoalStatus {
    return (current <= target) ? 'on_track' : 'at_risk'
  },

  async finalizeWeek(goalSetId: string): Promise<void> {
    const { data: goalSet, error: getError } = await supabase
      .schema('indonesian')
      .from('learner_weekly_goal_sets')
      .select('*')
      .eq('id', goalSetId)
      .single()

    if (getError) throw getError
    if (goalSet.closed_at) return

    const closingOverdue = await this.getOverdueCount(goalSet.user_id, goalSet.goal_timezone)
    const goals = await this.getGoalsForSet(goalSetId)
    
    // Resolve final statuses
    for (const goal of goals) {
      const finalStatus: GoalStatus = goal.goal_type === 'review_health'
        ? (closingOverdue <= goal.target_value_numeric ? 'achieved' : 'missed')
        : (goal.current_value_numeric >= goal.target_value_numeric ? 'achieved' : 'missed')

      await supabase
        .schema('indonesian')
        .from('learner_weekly_goals')
        .update({ status: finalStatus, updated_at: new Date().toISOString() })
        .eq('id', goal.id)
    }

    await supabase
      .schema('indonesian')
      .from('learner_weekly_goal_sets')
      .update({
        closing_overdue_count: closingOverdue,
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', goalSetId)
  },

  async computeTodayPlan(userId: string, preferredSize: number, _goalSet: WeeklyGoalSet, goals: WeeklyGoal[]): Promise<TodayPlan> {
    const now = new Date()
    // Canonical contract: surfacing-layer reads of user-progress data go through
    // learnerProgressService. The legacy from('learner_skill_state') query is replaced;
    // all goal-policy math (dueTarget ceiling, newTarget derivation, 20% weak cap)
    // stays here in TS per the spec's deep-module contract.
    const raw = await learnerProgressService.getTodaysPlanRawCounts({ userId, now })
    const dueNow = raw.dueRaw

    const overdueCountGoal = goals.find(g => g.goal_type === 'review_health')?.current_value_numeric ?? 0
    const recallQualityGoal = goals.find(g => g.goal_type === 'recall_quality')
    const vocabGoal = goals.find(g => g.goal_type === 'usable_vocabulary')

    // Due reviews target
    let dueTarget = preferredSize
    if (dueNow <= preferredSize) {
      dueTarget = dueNow
    } else if (overdueCountGoal > 20) {
      dueTarget = Math.min(dueNow, preferredSize + 5)
    }

    // New items target
    const vocabTarget = vocabGoal?.target_value_numeric ?? 8
    let newBase: number
    if (vocabTarget <= 6) newBase = 3
    else if (vocabTarget <= 10) newBase = 4
    else if (vocabTarget <= 14) newBase = 5
    else newBase = 6

    let newTarget = newBase
    if (dueNow > 20) newTarget = 2
    if (dueNow > 40) newTarget = 0

    const recallQuality = recallQualityGoal?.current_value_numeric ?? 0.80
    const recallTarget = recallQualityGoal?.target_value_numeric ?? 0.80
    if (recallQuality < recallTarget - 0.05) newTarget = Math.max(0, newTarget - 2)
    if (vocabGoal?.status === 'achieved') newTarget = Math.max(0, newTarget - 1)

    // Check if already studied today
    const { data: todaySessions } = await supabase
      .schema('indonesian')
      .from('learning_sessions')
      .select('id')
      .eq('user_id', userId)
      .gte('started_at', new Date(now.setHours(0,0,0,0)).toISOString())
      .limit(1)

    if (todaySessions && todaySessions.length > 0) {
      newTarget = Math.max(0, newTarget - 1)
    }

    // Recall target
    const desiredRecall = Math.max(8, Math.ceil(dueTarget * 0.4))
    const recallTargetToday = Math.min(desiredRecall, raw.recallSupplyRaw + newTarget)

    const estimatedMinutes = Math.max(1, Math.ceil((dueTarget + newTarget) * raw.meanLatencyMs / 60_000))

    // 20% weak cap (architect SIG-5 v3): SQL returns weakRaw uncapped; TS
    // applies the 20%-of-dueTarget cap.
    const weakTarget = Math.min(raw.weakRaw, Math.ceil(dueTarget * 0.2))

    return {
      due_reviews_today_target: dueTarget,
      new_items_today_target: newTarget,
      recall_interactions_today_target: recallTargetToday,
      estimated_minutes_today: estimatedMinutes,
      weak_items_target: weakTarget,
      preferred_session_size: preferredSize,
    }
  },

  /**
   * Helper for job service: get default target values for a goal type.
   * Used by integrity repair sweeper to recreate missing goal rows.
   */
  getDefaultTargets(goalType: string): { direction: string; unit: string; target: number } {
    switch (goalType) {
      case 'consistency':
        return { direction: 'at_least', unit: 'count', target: 4 }
      case 'recall_quality':
        return { direction: 'at_least', unit: 'percent', target: 0.80 }
      case 'usable_vocabulary':
        return { direction: 'at_least', unit: 'count', target: 8 }
      case 'review_health':
        return { direction: 'at_most', unit: 'count', target: 20 }
      default:
        throw new Error(`Unknown goal type: ${goalType}`)
    }
  }
}
