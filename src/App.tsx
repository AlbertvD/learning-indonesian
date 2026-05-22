// src/App.tsx
import { lazy, Suspense } from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import { Container, Title, Text, Button, Center, Loader } from '@mantine/core'
import { Layout } from '@/components/Layout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Login } from '@/pages/Login'
import { Register } from '@/pages/Register'
import { Dashboard } from '@/pages/Dashboard'
import { Lessons } from '@/pages/Lessons'
import { LessonRouter } from '@/pages/LessonRouter'
import { Session } from '@/pages/Session'
import { LocalPreviewIndex, LocalPreviewLesson } from '@/pages/LocalPreview'

// Lazy-loaded routes (less frequently visited pages)
const Podcasts = lazy(() => import('@/pages/Podcasts').then(m => ({ default: m.Podcasts })))
const Podcast = lazy(() => import('@/pages/Podcast').then(m => ({ default: m.Podcast })))
const Profile = lazy(() => import('@/pages/Profile').then(m => ({ default: m.Profile })))
const Progress = lazy(() => import('@/pages/Progress').then(m => ({ default: m.Progress })))
const SectionCoverage = lazy(() => import('@/pages/SectionCoverage').then(m => ({ default: m.SectionCoverage })))
const ExerciseCoverage = lazy(() => import('@/pages/ExerciseCoverage').then(m => ({ default: m.ExerciseCoverage })))
const ContentReview = lazy(() => import('@/pages/ContentReview').then(m => ({ default: m.ContentReview })))
const DesignLab = lazy(() => import('@/pages/admin/DesignLab').then(m => ({ default: m.DesignLab })))
const PageLab = lazy(() => import('@/pages/admin/PageLab').then(m => ({ default: m.PageLab })))

// ─── Bespoke lesson pages — preview routes ────────────────────────────────────
// /lesson/:lessonId resolves to the bespoke page when one is registered (see
// pages/lessons/registry.ts and LessonRouter). These /lesson-preview/<N>
// routes stay as stable explicit URLs for in-progress design work.
const Lesson1Bespoke = lazy(() => import('@/pages/lessons/lesson-1/Page'))
const Lesson2Bespoke = lazy(() => import('@/pages/lessons/lesson-2/Page'))
const Lesson3Bespoke = lazy(() => import('@/pages/lessons/lesson-3/Page'))

function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Center h="60vh"><Loader size="lg" /></Center>}>
      {children}
    </Suspense>
  )
}

function NotFound() {
  return (
    <Container size="sm" style={{ textAlign: 'center', paddingTop: '4rem' }}>
      <Title order={2} mb="md">Pagina niet gevonden</Title>
      <Text c="dimmed" mb="xl">De pagina die je zoekt bestaat niet.</Text>
      <Button component={Link} to="/">Ga naar dashboard</Button>
    </Container>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/preview" element={<LocalPreviewIndex />} />
      <Route path="/preview/lesson/:slug" element={<LocalPreviewLesson />} />

      <Route element={<Layout />}>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lessons"
          element={
            <ProtectedRoute>
              <Lessons />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lesson/:lessonId"
          element={
            <ProtectedRoute>
              <LessonRouter />
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
          path="/session"
          element={
            <ProtectedRoute>
              <Session />
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
  )
}

export default App
