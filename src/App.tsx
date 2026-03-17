// src/App.tsx
import { Routes, Route } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Login } from '@/pages/Login'
import { Register } from '@/pages/Register'
import { Lessons } from '@/pages/Lessons'
import { Lesson } from '@/pages/Lesson'
import { Podcasts } from '@/pages/Podcasts'
import { Podcast } from '@/pages/Podcast'
import { Leaderboard } from '@/pages/Leaderboard'
import { Sets } from '@/pages/Sets'
import { Set } from '@/pages/Set'
import { Dashboard } from '@/pages/Dashboard'
import { Cards } from '@/pages/Cards'
import { Review } from '@/pages/Review'
import { Practice } from '@/pages/Practice'
import { Profile } from '@/pages/Profile'

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
          path="/cards"
          element={
            <ProtectedRoute>
              <Cards />
            </ProtectedRoute>
          }
        />
        <Route
          path="/review"
          element={
            <ProtectedRoute>
              <Review />
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
          path="/sets"
          element={
            <ProtectedRoute>
              <Sets />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sets/:setId"
          element={
            <ProtectedRoute>
              <Set />
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
      </Route>
    </Routes>
  )
}

export default App
