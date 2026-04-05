// src/hooks/useProgressData.ts
import { useEffect, useState } from 'react'
import { notifications } from '@mantine/notifications'
import { useAuthStore } from '@/stores/authStore'
import { learnerStateService } from '@/services/learnerStateService'
import { lessonService } from '@/services/lessonService'
import { progressService } from '@/services/progressService'
import { goalService } from '@/services/goalService'
import { computeReviewForecast } from '@/utils/progressUtils'
import { logError } from '@/lib/logger'
import type { LearnerSkillState, DailyGoalRollup, WeeklyGoal } from '@/types/learning'

export interface ProgressData {
  // Wave 1 — required, blocks primary render
  wave1Loading: boolean
  wave1Error: Error | null
  itemsByStage: { new: number; anchoring: number; retrieving: number; productive: number; maintenance: number }
  skillStats: { avgRecognition: number; avgRecall: number; avgStability: number }
  lessonsCompleted: { completed: number; total: number }
  skillStates: LearnerSkillState[]
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
  vulnerableItems: { id: string; indonesianText: string; lapseCount: number; consecutiveFailures: number }[] | null
}

type Wave1State = Pick<ProgressData, 'wave1Loading' | 'wave1Error' | 'itemsByStage' | 'skillStats' | 'lessonsCompleted' | 'skillStates' | 'forecast'>
type Wave2State = Pick<ProgressData, 'wave2Loading' | 'wave2Error' | 'dailyRollups' | 'accuracyBySkillType' | 'lapsePrevention' | 'weeklyGoals' | 'vulnerableItems'>

const defaultWave1: Wave1State = {
  wave1Loading: true,
  wave1Error: null,
  itemsByStage: { new: 0, anchoring: 0, retrieving: 0, productive: 0, maintenance: 0 },
  skillStats: { avgRecognition: 0, avgRecall: 0, avgStability: 0 },
  lessonsCompleted: { completed: 0, total: 0 },
  skillStates: [],
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
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100
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
        const [itemStates, skillStatesData, lessonProgressData, lessonsData] = await Promise.all([
          learnerStateService.getItemStates(user!.id),
          learnerStateService.getSkillStatesBatch(user!.id),
          lessonService.getUserLessonProgress(user!.id),
          lessonService.getLessonsBasic(),
        ])

        // itemsByStage
        const itemsByStage = { new: 0, anchoring: 0, retrieving: 0, productive: 0, maintenance: 0 }
        for (const state of itemStates) {
          itemsByStage[state.stage]++
        }

        // skillStats
        const recognitionStabilities = skillStatesData
          .filter((s) => s.skill_type === 'recognition')
          .map((s) => s.stability)
        const recallStabilities = skillStatesData
          .filter((s) => s.skill_type === 'form_recall')
          .map((s) => s.stability)
        const allStabilities = skillStatesData.map((s) => s.stability)

        const skillStats = {
          avgRecognition: avg(recognitionStabilities),
          avgRecall: avg(recallStabilities),
          avgStability: avg(allStabilities),
        }

        // lessonsCompleted
        const completed = lessonProgressData.filter((lp) => lp.completed_at != null).length
        const lessonsCompleted = { completed, total: lessonsData.length }

        // forecast (derived synchronously)
        const forecast = computeReviewForecast(skillStatesData)

        setWave1State({
          wave1Loading: false,
          wave1Error: null,
          itemsByStage,
          skillStats,
          lessonsCompleted,
          skillStates: skillStatesData,
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

      // --- Wave 2 (fires after wave 1 sets state) ---
      setWave2State((prev) => ({ ...prev, wave2Loading: true }))

      const [rollupsResult, accuracyResult, lapseResult, goalsResult, vulnerableResult] =
        await Promise.allSettled([
          learnerStateService.getDailyRollups(user!.id, 7),
          progressService.getAccuracyBySkillType(user!.id),
          progressService.getLapsePrevention(user!.id),
          goalService.getGoalProgress(user!.id),
          progressService.getVulnerableItems(user!.id),
        ])

      const nextWave2: Wave2State = {
        wave2Loading: false,
        wave2Error: null,
        dailyRollups: null,
        accuracyBySkillType: null,
        lapsePrevention: null,
        weeklyGoals: null,
        vulnerableItems: null,
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

      setWave2State(nextWave2)
    }

    run()
  }, [user])

  return {
    ...wave1State,
    ...wave2State,
  }
}
