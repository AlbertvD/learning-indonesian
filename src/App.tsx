// src/App.tsx
import { Routes, Route, Link } from 'react-router-dom'
import { Container, Title, Text, Button } from '@mantine/core'
import { Layout } from '@/components/Layout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Login } from '@/pages/Login'
import { Register } from '@/pages/Register'
import { Lessons } from '@/pages/Lessons'
import { Lesson } from '@/pages/Lesson'
import { Podcasts } from '@/pages/Podcasts'
import { Podcast } from '@/pages/Podcast'
import { Leaderboard } from '@/pages/Leaderboard'
import { Dashboard } from '@/pages/Dashboard'
import { Session } from '@/pages/Session'
import { Practice } from '@/pages/Practice'
import { Profile } from '@/pages/Profile'

function NotFound() {
  return (
    <Container size="sm" style={{ textAlign: 'center', paddingTop: '4rem' }}>
      <Title order={2} mb="md">Page not found</Title>
      <Text c="dimmed" mb="xl">The page you're looking for doesn't exist.</Text>
      <Button component={Link} to="/">Go to Dashboard</Button>
    </Container>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      
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
              <Lesson />
            </ProtectedRoute>
          }
        />
        <Route
          path="/podcasts"
          element={
            <ProtectedRoute>
              <Podcasts />
            </ProtectedRoute>
          }
        />
        <Route
          path="/podcast/:podcastId"
          element={
            <ProtectedRoute>
              <Podcast />
            </ProtectedRoute>
          }
        />
        <Route
          path="/practice"
          element={
            <ProtectedRoute>
              <Practice />
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
          path="/leaderboard"
          element={
            <ProtectedRoute>
              <Leaderboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
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
