// src/App.tsx
import { lazy, Suspense } from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import { Container, Title, Text, Button, Center, Loader } from '@mantine/core'
import { Layout } from '@/components/Layout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { PwaUpdatePrompt } from '@/components/PwaUpdatePrompt'
import { OfflineBanner } from '@/components/OfflineBanner'
import { Login } from '@/pages/Login'
import { Register } from '@/pages/Register'
import { Dashboard } from '@/pages/Dashboard'
import { useAuthStore } from '@/stores/authStore'
import { useT } from '@/hooks/useT'

// Lazy-loaded routes (less frequently visited pages, plus the heavy
// eagerly-visited-but-large surfaces — Session/Lessons/Ontdek/LessonRouter/
// LocalPreview — to keep the initial JS payload small; Login/Register/
// Dashboard/Layout/ProtectedRoute stay eager as the landing surfaces)
const Lessons = lazy(() => import('@/pages/Lessons').then(m => ({ default: m.Lessons })))
const Ontdek = lazy(() => import('@/pages/Ontdek').then(m => ({ default: m.Ontdek })))
const LessonRouter = lazy(() => import('@/pages/LessonRouter').then(m => ({ default: m.LessonRouter })))
const Session = lazy(() => import('@/pages/Session').then(m => ({ default: m.Session })))
const Welkom = lazy(() => import('@/pages/Welkom').then(m => ({ default: m.Welkom })))
const Instaptoets = lazy(() => import('@/pages/Instaptoets').then(m => ({ default: m.Instaptoets })))
const LocalPreviewIndex = lazy(() => import('@/pages/LocalPreview').then(m => ({ default: m.LocalPreviewIndex })))
const LocalPreviewLesson = lazy(() => import('@/pages/LocalPreview').then(m => ({ default: m.LocalPreviewLesson })))
const Podcasts = lazy(() => import('@/pages/Podcasts').then(m => ({ default: m.Podcasts })))
const Podcast = lazy(() => import('@/pages/Podcast').then(m => ({ default: m.Podcast })))
const Lezen = lazy(() => import('@/pages/Lezen').then(m => ({ default: m.Lezen })))
const LezenReader = lazy(() => import('@/pages/LezenReader').then(m => ({ default: m.LezenReader })))
const GrammarPodcasts = lazy(() => import('@/pages/GrammarPodcasts').then(m => ({ default: m.GrammarPodcasts })))
const Profile = lazy(() => import('@/pages/Profile').then(m => ({ default: m.Profile })))
const Progress = lazy(() => import('@/pages/Progress').then(m => ({ default: m.Progress })))
const AffixTrainer = lazy(() => import('@/pages/AffixTrainer').then(m => ({ default: m.AffixTrainer })))
const Pronunciation = lazy(() => import('@/pages/Pronunciation').then(m => ({ default: m.Pronunciation })))
const SectionCoverage = lazy(() => import('@/pages/SectionCoverage').then(m => ({ default: m.SectionCoverage })))
const ExerciseCoverage = lazy(() => import('@/pages/ExerciseCoverage').then(m => ({ default: m.ExerciseCoverage })))
const ContentReview = lazy(() => import('@/pages/ContentReview').then(m => ({ default: m.ContentReview })))
const DesignLab = lazy(() => import('@/pages/admin/DesignLab').then(m => ({ default: m.DesignLab })))
const PageLab = lazy(() => import('@/pages/admin/PageLab').then(m => ({ default: m.PageLab })))
const Privacy = lazy(() => import('@/pages/Privacy').then(m => ({ default: m.Privacy })))
const Landing = lazy(() => import('@/pages/Landing').then(m => ({ default: m.Landing })))

// ─── Bespoke lesson pages — preview routes ────────────────────────────────────
// /lesson/:lessonId resolves to the bespoke page when one is registered (see
// pages/lessons/registry.ts and LessonRouter). These /lesson-preview/<N>
// routes stay as stable explicit URLs for in-progress design work.
const Lesson1Bespoke = lazy(() => import('@/pages/lessons/lesson-1/Page'))
const Lesson2Bespoke = lazy(() => import('@/pages/lessons/lesson-2/Page'))
const Lesson3Bespoke = lazy(() => import('@/pages/lessons/lesson-3/Page'))
const Lesson4Bespoke = lazy(() => import('@/pages/lessons/lesson-4/Page'))
const Lesson5Bespoke = lazy(() => import('@/pages/lessons/lesson-5/Page'))
const Lesson6Bespoke = lazy(() => import('@/pages/lessons/lesson-6/Page'))
const Lesson7Bespoke = lazy(() => import('@/pages/lessons/lesson-7/Page'))
const Lesson8Bespoke = lazy(() => import('@/pages/lessons/lesson-8/Page'))
const Lesson9Bespoke = lazy(() => import('@/pages/lessons/lesson-9/Page'))
const Lesson10Bespoke = lazy(() => import('@/pages/lessons/lesson-10/Page'))
const Lesson11Bespoke = lazy(() => import('@/pages/lessons/lesson-11/Page'))
const Lesson12Bespoke = lazy(() => import('@/pages/lessons/lesson-12/Page'))
const Lesson13Bespoke = lazy(() => import('@/pages/lessons/lesson-13/Page'))
const Lesson14Bespoke = lazy(() => import('@/pages/lessons/lesson-14/Page'))
const Lesson15Bespoke = lazy(() => import('@/pages/lessons/lesson-15/Page'))
const Lesson16Bespoke = lazy(() => import('@/pages/lessons/lesson-16/Page'))
const Lesson17Bespoke = lazy(() => import('@/pages/lessons/lesson-17/Page'))
const Lesson18Bespoke = lazy(() => import('@/pages/lessons/lesson-18/Page'))
const Lesson19Bespoke = lazy(() => import('@/pages/lessons/lesson-19/Page'))
const Lesson20Bespoke = lazy(() => import('@/pages/lessons/lesson-20/Page'))
const Lesson21Bespoke = lazy(() => import('@/pages/lessons/lesson-21/Page'))
const Lesson22Bespoke = lazy(() => import('@/pages/lessons/lesson-22/Page'))
const Lesson23Bespoke = lazy(() => import('@/pages/lessons/lesson-23/Page'))
const Lesson24Bespoke = lazy(() => import('@/pages/lessons/lesson-24/Page'))
const Lesson25Bespoke = lazy(() => import('@/pages/lessons/lesson-25/Page'))
const Lesson26Bespoke = lazy(() => import('@/pages/lessons/lesson-26/Page'))

function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Center h="60vh"><Loader size="lg" /></Center>}>
      {children}
    </Suspense>
  )
}

function NotFound() {
  const T = useT()
  return (
    <Container size="sm" style={{ textAlign: 'center', paddingTop: '4rem' }}>
      <Title order={2} mb="md">{T.common.notFoundTitle}</Title>
      <Text c="dimmed" mb="xl">{T.common.notFoundMessage}</Text>
      <Button component={Link} to="/">{T.common.goToDashboard}</Button>
    </Container>
  )
}

function App() {
  const { user, loading } = useAuthStore()
  // `/` is the public landing page for logged-out visitors and Home for
  // authenticated users (desktop program slice 1). While auth state is still
  // resolving, keep the protected variant mounted — ProtectedRoute shows the
  // full-page loader — so a logged-in refresh never flashes the landing page.
  // Same dev bypass as ProtectedRoute so `/?bypassAuth=1` still previews Home.
  const devBypass = import.meta.env.DEV
    && new URL(window.location.href).searchParams.get('bypassAuth') === '1'
  const showLanding = !user && !loading && !devBypass

  return (
    <>
      <PwaUpdatePrompt />
      <OfflineBanner />
      <Routes>
      {showLanding && <Route path="/" element={<LazyPage><Landing /></LazyPage>} />}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/preview" element={<LazyPage><LocalPreviewIndex /></LazyPage>} />
      <Route path="/preview/lesson/:slug" element={<LazyPage><LocalPreviewLesson /></LazyPage>} />
      <Route path="/privacy" element={<LazyPage><Privacy /></LazyPage>} />

      <Route element={<Layout />}>
        {!showLanding && (
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
        )}
        <Route
          path="/welkom"
          element={
            <ProtectedRoute>
              <LazyPage><Welkom /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/instaptoets"
          element={
            <ProtectedRoute>
              <LazyPage><Instaptoets /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/leren"
          element={
            <ProtectedRoute>
              <LazyPage><Lessons /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/ontdek"
          element={
            <ProtectedRoute>
              <LazyPage><Ontdek /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lesson/:lessonId"
          element={
            <ProtectedRoute>
              <LazyPage><LessonRouter /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lesson-preview/1"
          element={
            <ProtectedRoute>
              <LazyPage><Lesson1Bespoke /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lesson-preview/2"
          element={
            <ProtectedRoute>
              <LazyPage><Lesson2Bespoke /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lesson-preview/3"
          element={
            <ProtectedRoute>
              <LazyPage><Lesson3Bespoke /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lesson-preview/4"
          element={
            <ProtectedRoute>
              <LazyPage><Lesson4Bespoke /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lesson-preview/5"
          element={
            <ProtectedRoute>
              <LazyPage><Lesson5Bespoke /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lesson-preview/6"
          element={
            <ProtectedRoute>
              <LazyPage><Lesson6Bespoke /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lesson-preview/7"
          element={
            <ProtectedRoute>
              <LazyPage><Lesson7Bespoke /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lesson-preview/8"
          element={
            <ProtectedRoute>
              <LazyPage><Lesson8Bespoke /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lesson-preview/9"
          element={
            <ProtectedRoute>
              <LazyPage><Lesson9Bespoke /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lesson-preview/10"
          element={
            <ProtectedRoute>
              <LazyPage><Lesson10Bespoke /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lesson-preview/11"
          element={
            <ProtectedRoute>
              <LazyPage><Lesson11Bespoke /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lesson-preview/12"
          element={
            <ProtectedRoute>
              <LazyPage><Lesson12Bespoke /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lesson-preview/13"
          element={
            <ProtectedRoute>
              <LazyPage><Lesson13Bespoke /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lesson-preview/14"
          element={
            <ProtectedRoute>
              <LazyPage><Lesson14Bespoke /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lesson-preview/15"
          element={
            <ProtectedRoute>
              <LazyPage><Lesson15Bespoke /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lesson-preview/16"
          element={
            <ProtectedRoute>
              <LazyPage><Lesson16Bespoke /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lesson-preview/17"
          element={
            <ProtectedRoute>
              <LazyPage><Lesson17Bespoke /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lesson-preview/18"
          element={
            <ProtectedRoute>
              <LazyPage><Lesson18Bespoke /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lesson-preview/19"
          element={
            <ProtectedRoute>
              <LazyPage><Lesson19Bespoke /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lesson-preview/20"
          element={
            <ProtectedRoute>
              <LazyPage><Lesson20Bespoke /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lesson-preview/21"
          element={
            <ProtectedRoute>
              <LazyPage><Lesson21Bespoke /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lesson-preview/22"
          element={
            <ProtectedRoute>
              <LazyPage><Lesson22Bespoke /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lesson-preview/23"
          element={
            <ProtectedRoute>
              <LazyPage><Lesson23Bespoke /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lesson-preview/24"
          element={
            <ProtectedRoute>
              <LazyPage><Lesson24Bespoke /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lesson-preview/25"
          element={
            <ProtectedRoute>
              <LazyPage><Lesson25Bespoke /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lesson-preview/26"
          element={
            <ProtectedRoute>
              <LazyPage><Lesson26Bespoke /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/podcasts"
          element={
            <ProtectedRoute>
              <LazyPage><Podcasts /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/podcast/:podcastId"
          element={
            <ProtectedRoute>
              <LazyPage><Podcast /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lezen"
          element={
            <ProtectedRoute>
              <LazyPage><Lezen /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lezen/:podcastId"
          element={
            <ProtectedRoute>
              <LazyPage><LezenReader /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/grammatica"
          element={
            <ProtectedRoute>
              <LazyPage><GrammarPodcasts /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/session"
          element={
            <ProtectedRoute>
              <LazyPage><Session /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <LazyPage><Profile /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/progress"
          element={
            <ProtectedRoute>
              <LazyPage><Progress /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/morphology"
          element={
            <ProtectedRoute>
              <LazyPage><AffixTrainer /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/pronunciation"
          element={
            <ProtectedRoute>
              <LazyPage><Pronunciation /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/content/sections"
          element={
            <ProtectedRoute>
              <LazyPage><SectionCoverage /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/content/exercises"
          element={
            <ProtectedRoute>
              <LazyPage><ExerciseCoverage /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/content-review"
          element={
            <ProtectedRoute>
              <LazyPage><ContentReview /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/design-lab"
          element={
            <ProtectedRoute>
              <LazyPage><DesignLab /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/page-lab"
          element={
            <ProtectedRoute>
              <LazyPage><PageLab /></LazyPage>
            </ProtectedRoute>
          }
        />
        <Route
          path="*"
          element={
            <ProtectedRoute>
              <NotFound />
            </ProtectedRoute>
          }
        />
      </Route>
      </Routes>
    </>
  )
}

export default App
