import { Routes, Route, NavLink } from 'react-router-dom'
import {
  LayoutGrid, Sun, Repeat2, BarChart2, CalendarDays, Settings, Check,
} from 'lucide-react'
import BoardPage from './BoardPage'
import RecurringPage from './RecurringPage'
import TodayPage from './TodayPage'
import DashboardPage from './DashboardPage'
import CalendarPage from './CalendarPage'
import SettingsPage from './SettingsPage'

const navItems = [
  { to: '/',          label: 'Board',     icon: LayoutGrid   },
  { to: '/today',     label: 'Today',     icon: Sun          },
  { to: '/recurring', label: 'Recurring', icon: Repeat2      },
  { to: '/dashboard', label: 'Dashboard', icon: BarChart2    },
  { to: '/calendar',  label: 'Calendar',  icon: CalendarDays },
]

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm shrink-0">
        <Check size={16} strokeWidth={3} className="text-white" />
      </div>
      <span className="text-[15px] font-bold text-gray-900 dark:text-white tracking-tight">TrackU</span>
    </div>
  )
}

export default function AppShell({ session }) {
  const initials = session.user.email?.slice(0, 2).toUpperCase()

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-56 min-w-56 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">

        {/* Logo */}
        <div className="px-5 py-5 border-b border-gray-100 dark:border-gray-800">
          <Logo />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 space-y-0.5">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/60 hover:text-gray-900 dark:hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    size={17}
                    strokeWidth={isActive ? 2.2 : 1.8}
                    className={isActive ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400 dark:text-gray-500'}
                  />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom */}
        <div className="px-3 py-3 border-t border-gray-100 dark:border-gray-800 space-y-0.5">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/60 hover:text-gray-900 dark:hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Settings
                  size={17}
                  strokeWidth={isActive ? 2.2 : 1.8}
                  className={isActive ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400 dark:text-gray-500'}
                />
                Settings
              </>
            )}
          </NavLink>

          <div className="flex items-center gap-2.5 px-3 py-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-xs font-semibold text-white shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate leading-tight">{session.user.email}</p>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-hidden flex flex-col bg-white dark:bg-gray-950">
        <Routes>
          <Route path="/" element={<BoardPage session={session} />} />
          <Route path="/today" element={<TodayPage session={session} />} />
          <Route path="/recurring" element={<RecurringPage session={session} />} />
          <Route path="/dashboard" element={<DashboardPage session={session} />} />
          <Route path="/calendar" element={<CalendarPage session={session} />} />
          <Route path="/settings" element={<SettingsPage session={session} />} />
        </Routes>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center py-2.5 gap-1 text-[10px] font-medium transition-colors ${
                isActive ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400 dark:text-gray-500'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
