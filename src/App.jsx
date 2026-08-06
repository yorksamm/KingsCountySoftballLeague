import { createBrowserRouter, RouterProvider, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import { isConfigured } from './lib/supabase.js'
import Spinner from './components/ui/Spinner.jsx'

import PublicLayout from './components/layout/PublicLayout.jsx'
import Home from './pages/Home.jsx'
import Upcoming from './pages/Upcoming.jsx'
import Schedule from './pages/Schedule.jsx'
import Teams from './pages/Teams.jsx'
import Standings from './pages/Standings.jsx'
import Rules from './pages/Rules.jsx'

import AdminLayout from './components/admin/AdminLayout.jsx'
import AdminLogin from './pages/admin/AdminLogin.jsx'
import AdminAnnouncements from './pages/admin/AdminAnnouncements.jsx'
import AdminDivisions from './pages/admin/AdminDivisions.jsx'
import AdminTeams from './pages/admin/AdminTeams.jsx'
import AdminRoster from './pages/admin/AdminRoster.jsx'
import AdminFields from './pages/admin/AdminFields.jsx'
import AdminSchedule from './pages/admin/AdminSchedule.jsx'
import AdminResults from './pages/admin/AdminResults.jsx'
import AdminRules from './pages/admin/AdminRules.jsx'

/**
 * Client-side route guard.
 *
 * This is UX ONLY (docs Section 4 and 8.1). It stops an unauthenticated person
 * from seeing an admin screen; it does not stop anyone from calling the REST
 * API directly with the publishable key that ships in this bundle. The actual
 * boundary is the RLS policy set in supabase_schema.sql. If those policies are
 * missing, deleting this component and deleting nothing else would make no
 * difference to an attacker.
 */
function RequireAuth({ children }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Spinner label="Checking your session…" />
  if (!session) return <Navigate to="/admin/login" state={{ from: location.pathname }} replace />
  return children
}

function NotFound() {
  return (
    <div className="wrap" style={{ padding: '3rem 1rem', textAlign: 'center' }}>
      <h1>Page not found</h1>
      <p style={{ color: 'var(--ink-soft)' }}>
        That page doesn’t exist. <a href="/">Back to the league home page</a>.
      </p>
    </div>
  )
}

/** Shown instead of a blank screen when .env.local hasn't been filled in. */
function SetupNeeded() {
  return (
    <div className="wrap" style={{ maxWidth: 640, padding: '3rem 1rem' }}>
      <h1>Almost there</h1>
      <p>This app can’t reach Supabase yet because its credentials aren’t set.</p>
      <ol style={{ lineHeight: 1.9, color: 'var(--ink-soft)' }}>
        <li>Copy <code>.env.example</code> to <code>.env.local</code></li>
        <li>Fill in <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> from
            your Supabase dashboard under <strong>Settings → API</strong></li>
        <li><strong>Restart</strong> <code>npm run dev</code> — Vite only reads env files at startup</li>
      </ol>
      <p style={{ fontSize: '.875rem', color: 'var(--ink-mute)' }}>
        Full instructions are in <code>README.md</code>.
      </p>
    </div>
  )
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <PublicLayout />,
    children: [
      { index: true,        element: <Home /> },
      { path: 'upcoming',   element: <Upcoming /> },
      { path: 'schedule',   element: <Schedule /> },
      { path: 'teams',      element: <Teams /> },
      { path: 'standings',  element: <Standings /> },
      { path: 'rules',      element: <Rules /> },
    ],
  },
  { path: '/admin/login', element: <AdminLogin /> },
  {
    path: '/admin',
    element: <RequireAuth><AdminLayout /></RequireAuth>,
    children: [
      { index: true,          element: <Navigate to="/admin/results" replace /> },
      { path: 'announcements', element: <AdminAnnouncements /> },
      { path: 'divisions',     element: <AdminDivisions /> },
      { path: 'teams',         element: <AdminTeams /> },
      { path: 'roster',        element: <AdminRoster /> },
      { path: 'fields',        element: <AdminFields /> },
      { path: 'schedule',      element: <AdminSchedule /> },
      { path: 'results',       element: <AdminResults /> },
      { path: 'rules',         element: <AdminRules /> },
    ],
  },
  { path: '*', element: <NotFound /> },
])

export default function App() {
  if (!isConfigured) return <SetupNeeded />

  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
