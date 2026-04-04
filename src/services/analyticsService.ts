/**
 * Analytics Service
 *
 * Tracks user interactions with the goal system and learning experience.
 * Events are emitted as they occur for monitoring, debugging, and future analytics.
 */

import { supabase } from '@/lib/supabase'
import { logError } from '@/lib/logger'

export type AnalyticsEventType =
  | 'goal_generated'
  | 'goal_viewed'
  | 'daily_plan_viewed'
  | 'session_started_from_today'
  | 'goal_achieved'
  | 'goal_missed'
  | 'session_summary_viewed'

export interface AnalyticsEvent {
  event_type: AnalyticsEventType
  user_id: string
  goal_id?: string
  goal_type?: string
  session_id?: string
  metadata?: Record<string, any>
}

export const analyticsService = {
  /**
   * Emit an analytics event. Events are persisted to learner_analytics_events table.
   * Errors are logged but never block the calling operation.
   */
  async trackEvent(event: AnalyticsEvent): Promise<void> {
    try {
      await supabase
        .schema('indonesian')
        .from('learner_analytics_events')
        .insert({
          event_type: event.event_type,
          user_id: event.user_id,
          goal_id: event.goal_id || null,
          goal_type: event.goal_type || null,
          session_id: event.session_id || null,
          metadata: event.metadata || {},
        })
    } catch (err) {
      // Fire-and-forget: log but don't block
      logError({ page: 'analyticsService', action: 'trackEvent', error: err })
    }
  },

  /**
   * Track goal generation event.
   */
  async trackGoalGenerated(userId: string, goalIds: string[]): Promise<void> {
    for (const goalId of goalIds) {
      await this.trackEvent({
        event_type: 'goal_generated',
        user_id: userId,
        goal_id: goalId,
      })
    }
  },

  /**
   * Track goal viewed event.
   */
  async trackGoalViewed(userId: string, goalId: string, goalType: string): Promise<void> {
    await this.trackEvent({
      event_type: 'goal_viewed',
      user_id: userId,
      goal_id: goalId,
      goal_type: goalType,
    })
  },

  /**
   * Track daily plan viewed event.
   */
  async trackDailyPlanViewed(userId: string): Promise<void> {
    await this.trackEvent({
      event_type: 'daily_plan_viewed',
      user_id: userId,
    })
  },

  /**
   * Track session started from Today card event.
   */
  async trackSessionStartedFromToday(userId: string, sessionId: string): Promise<void> {
    await this.trackEvent({
      event_type: 'session_started_from_today',
      user_id: userId,
      session_id: sessionId,
    })
  },

  /**
   * Track goal achieved event.
   */
  async trackGoalAchieved(userId: string, goalId: string, goalType: string): Promise<void> {
    await this.trackEvent({
      event_type: 'goal_achieved',
      user_id: userId,
      goal_id: goalId,
      goal_type: goalType,
    })
  },

  /**
   * Track goal missed event.
   */
  async trackGoalMissed(userId: string, goalId: string, goalType: string): Promise<void> {
    await this.trackEvent({
      event_type: 'goal_missed',
      user_id: userId,
      goal_id: goalId,
      goal_type: goalType,
    })
  },

  /**
   * Track session summary goal-impact viewed event.
   */
  async trackSessionSummaryViewed(userId: string, sessionId: string, goalImpactCount: number): Promise<void> {
    await this.trackEvent({
      event_type: 'session_summary_viewed',
      user_id: userId,
      session_id: sessionId,
      metadata: { goal_impact_count: goalImpactCount },
    })
  },
}
