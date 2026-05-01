// src/hooks/useProgressData.ts
import { useEffect, useState } from 'react'
import { notifications } from '@mantine/notifications'
import { useAuthStore } from '@/stores/authStore'
import { learnerStateService } from '@/services/learnerStateService'
import { learnerProgressService } from '@/services/learnerProgressService'
import { lessonService } from '@/services/lessonService'
import { progressService } from '@/services/progressService'
import { goalService } from '@/services/goalService'
import { logError } from '@/lib/logger'
import type { DailyGoalRollup, WeeklyGoal } from '@/types/learning'

export interface ProgressData {
  // Wave 1 — required, blocks primary render
  wave1Loading: boolean
  wave1Error: Error | null
  itemsByStage: { new: number; anchoring: number; retrieving: number; productive: number; maintenance: number }
  skillStats: { avgRecognition: number; avgRecall: number; avgStability: number }
  lessonsCompleted: { completed: number; total: number }
  forecast: { date: Date; count: number }[]

  // Wave 2 — non-blocking
  wave2Loading: boolean
  wave2Error: Error | null
  dailyRollups: DailyGoalRollup[] | null
  accuracyBySkillType: {
    recognitionAccuracy: number
    recognitionSampleSize: number
    recallAccuracy: number
    recallSampleSize: number
  } | null
  lapsePrevention: { atRisk: number; rescued: number } | null
  weeklyGoals: WeeklyGoal[] | null
  vulnerableItems: { id: string; indonesianText: string; meaning: string; lapseCount: number; consecutiveFailures: number }[] | null
  avgLatencyMs: { currentWeekMs: number | null; priorWeekMs: number | null } | null
}

type Wave1State = Pick<ProgressData, 'wave1Loading' | 'wave1Error' | 'itemsByStage' | 'skillStats' | 'lessonsCompleted' | 'forecast'>
type Wave2State = Pick<ProgressData, 'wave2Loading' | 'wave2Error' | 'dailyRollups' | 'accuracyBySkillType' | 'lapsePrevention' | 'weeklyGoals' | 'vulnerableItems' | 'avgLatencyMs'>

const defaultWave1: Wave1State = {
  wave1Loading: true,
  wave1Error: null,
  itemsByStage: { new: 0, anchoring: 0, retrieving: 0, productive: 0, maintenance: 0 },
  skillStats: { avgRecognition: 0, avgRecall: 0, avgStability: 0 },
  lessonsCompleted: { completed: 0, total: 0 },
  forecast: [],
}

const defaultWave2: Wave2State = {
  wave2Loading: false,
  wave2Error: null,
  dailyRollups: null,
  accuracyBySkillType: null,
  lapsePrevention: null,
  weeklyGoals: null,
  vulnerableItems: null,
  avgLatencyMs: null,
}

// Fill in zero-counted days for the next `days` days starting today,
// merging counts from the SQL function's sparse-day result.
function buildDenseForecast(
  sparse: { date: string; count: number }[],
  days: number,
): { date: Date; count: number }[] {
  const counts = new Map(sparse.map(d => [d.date, d.count]))
  const result: { date: Date; count: number }[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = 0; i < days; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    const key = d.toISOString().slice(0, 10)
    result.push({ date: d, count: counts.get(key) ?? 0 })
  }
  return result
}

export function useProgressData(): ProgressData {
  const user = useAuthStore((s) => s.user)
  const [wave1State, setWave1State] = useState(defaultWave1)
  const [wave2State, setWave2State] = useState(defaultWave2)

  useEffect(() => {
    if (!user) return

    async function run() {
      // --- Wave 1 ---
      try {
        const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
        const [itemStates, memoryHealth, forecastSparse, lessonProgressData, lessonsData] = await Promise.all([
          learnerStateService.getItemStates(user!.id),
          // Replaces the legacy learner_skill_state batch fetch + JS aggregation.
          // getMemoryHealth returns 2-decimal-rounded stabilities (architect NIT-3 v4).
          learnerProgressService.getMemoryHealth({ userId: user!.id }),
          learnerProgressService.getReviewForecast({ userId: user!.id, days: 7, timezone: userTimezone }),
          lessonService.getUserLessonProgress(user!.id),
          lessonService.getLessonsBasic(),
        ])

        const itemsByStage = { new: 0, anchoring: 0, retrieving: 0, productive: 0, maintenance: 0 }
        for (const state of itemStates) {
          itemsByStage[state.stage]++
        }

        const skillStats = {
          avgRecognition: memoryHealth.avgRecognitionStability,
          avgRecall: memoryHealth.avgRecallStability,
          avgStability: memoryHealth.avgOverallStability,
        }

        const completed = lessonProgressData.filter((lp) => lp.completed_at != null).length
        const lessonsCompleted = { completed, total: lessonsData.length }
        const forecast = buildDenseForecast(forecastSparse, 7)

        setWave1State({
          wave1Loading: false,
          wave1Error: null,
          itemsByStage,
          skillStats,
          lessonsCompleted,
          forecast,
        })
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        logError({ page: 'progress', action: 'wave1Fetch', error: err })
        notifications.show({
          color: 'red',
          title: 'Failed to load progress',
          message: 'Could not load your progress data. Please try again.',
        })
        setWave1State((prev) => ({ ...prev, wave1Loading: false, wave1Error: error as Error | null }))
        return
      }

      // --- Wave 2 ---
      setWave2State((prev) => ({ ...prev, wave2Loading: true }))

      const [rollupsResult, accuracyResult, lapseResult, goalsResult, vulnerableResult, latencyResult] =
        await Promise.allSettled([
          learnerStateService.getDailyRollups(user!.id, 7),
          progressService.getAccuracyBySkillType(user!.id),
          progressService.getLapsePrevention(user!.id),
          goalService.getGoalProgress(user!.id),
          progressService.getVulnerableItems(user!.id),
          progressService.getAvgLatencyMs(user!.id),
        ])

      const nextWave2: Wave2State = {
        wave2Loading: false,
        wave2Error: null,
        dailyRollups: null,
        accuracyBySkillType: null,
        lapsePrevention: null,
        weeklyGoals: null,
        vulnerableItems: null,
        avgLatencyMs: null,
      }

      if (rollupsResult.status === 'fulfilled') {
        nextWave2.dailyRollups = rollupsResult.value
      } else {
        logError({ page: 'progress', action: 'wave2FetchDailyRollups', error: rollupsResult.reason })
      }

      if (accuracyResult.status === 'fulfilled') {
        nextWave2.accuracyBySkillType = accuracyResult.value
      } else {
        logError({ page: 'progress', action: 'wave2FetchAccuracy', error: accuracyResult.reason })
      }

      if (lapseResult.status === 'fulfilled') {
        nextWave2.lapsePrevention = lapseResult.value
      } else {
        logError({ page: 'progress', action: 'wave2FetchLapsePrevention', error: lapseResult.reason })
      }

      if (goalsResult.status === 'fulfilled') {
        const goalProgress = goalsResult.value
        nextWave2.weeklyGoals = goalProgress.state === 'active' ? (goalProgress.weeklyGoals ?? []) : []
      } else {
        logError({ page: 'progress', action: 'wave2FetchGoals', error: goalsResult.reason })
      }

      if (vulnerableResult.status === 'fulfilled') {
        nextWave2.vulnerableItems = vulnerableResult.value
      } else {
        logError({ page: 'progress', action: 'wave2FetchVulnerableItems', error: vulnerableResult.reason })
      }

      if (latencyResult.status === 'fulfilled') {
        nextWave2.avgLatencyMs = latencyResult.value
      } else {
        logError({ page: 'progress', action: 'wave2FetchLatency', error: latencyResult.reason })
      }

      setWave2State(nextWave2)
    }

    run()
  }, [user])

  return {
    ...wave1State,
    ...wave2State,
  }
}
