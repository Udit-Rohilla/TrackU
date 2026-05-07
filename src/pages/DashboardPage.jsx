import { useState, useEffect } from 'react'
import { format, subDays, isToday, startOfDay } from 'date-fns'
import clsx from 'clsx'
import { supabase } from '../lib/supabase'
import { computeTimeLogged } from '../lib/time'

function formatDuration(seconds) {
  if (!seconds || seconds < 60) return `${seconds || 0}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div className={clsx(
      'bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-5',
      'flex flex-col gap-1 shadow-sm',
    )}>
      <span className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">{label}</span>
      <span className={clsx('text-2xl font-bold tabular-nums', accent || 'text-gray-900 dark:text-white')}>{value}</span>
      {sub && <span className="text-xs text-gray-400 dark:text-gray-500">{sub}</span>}
    </div>
  )
}

export default function DashboardPage({ session }) {
  const [loading, setLoading]       = useState(true)
  const [stats, setStats]           = useState(null)
  const [weeklyData, setWeeklyData] = useState([])
  const [topStreaks, setTopStreaks]  = useState([])

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const todayStart = startOfDay(new Date()).toISOString()
    const weekStart  = subDays(new Date(), 6)
    weekStart.setHours(0, 0, 0, 0)

    const [
      { data: allActiveTasks },
      { data: doneTodayTasks },
      { data: doneWeekTasks },
      { data: timeLogs },
      { data: recurringTasks },
    ] = await Promise.all([
      supabase
        .from('tasks')
        .select('id, status, deadline, time_spent_seconds, timer_started_at')
        .eq('user_id', session.user.id)
        .neq('status', 'done')
        .neq('archived', true),
      supabase
        .from('tasks')
        .select('id, updated_at')
        .eq('user_id', session.user.id)
        .eq('status', 'done')
        .gte('updated_at', todayStart),
      supabase
        .from('tasks')
        .select('id, updated_at')
        .eq('user_id', session.user.id)
        .eq('status', 'done')
        .gte('updated_at', weekStart.toISOString()),
      supabase
        .from('time_logs')
        .select('duration_seconds')
        .eq('user_id', session.user.id)
        .gte('ended_at', todayStart),
      supabase
        .from('tasks')
        .select('id, title, streak_count, recurrence_type')
        .eq('user_id', session.user.id)
        .eq('is_recurring', true)
        .neq('archived', true)
        .gt('streak_count', 0)
        .order('streak_count', { ascending: false })
        .limit(5),
    ])

    const today = startOfDay(new Date())
    const inProgressTasks = (allActiveTasks || []).filter(t => t.status === 'in_progress')
    const overdueTasks    = (allActiveTasks || []).filter(t =>
      t.deadline && new Date(t.deadline) < today && t.status !== 'in_progress'
    )

    const timeLoggedToday = (timeLogs || []).reduce((sum, l) => sum + (l.duration_seconds || 0), 0)
    // Also add currently-running timers
    const runningTime = inProgressTasks.reduce((sum, t) => {
      if (!t.timer_started_at) return sum
      const secs = Math.floor((Date.now() - new Date(t.timer_started_at)) / 1000)
      return sum + secs
    }, 0)

    // Build weekly chart data (last 7 days incl. today)
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = subDays(new Date(), 6 - i)
      d.setHours(0, 0, 0, 0)
      return d
    })
    const weekly = days.map(day => ({
      label: isToday(day) ? 'Today' : format(day, 'EEE'),
      isToday: isToday(day),
      count: (doneWeekTasks || []).filter(t => {
        const td = new Date(t.updated_at)
        td.setHours(0, 0, 0, 0)
        return td.getTime() === day.getTime()
      }).length,
    }))

    setStats({
      doneToday:     (doneTodayTasks || []).length,
      inProgress:    inProgressTasks.length,
      overdue:       overdueTasks.length,
      timeToday:     timeLoggedToday + runningTime,
    })
    setWeeklyData(weekly)
    setTopStreaks(recurringTasks || [])
    setLoading(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full text-sm text-gray-400">Loading…</div>
  )

  const maxWeeklyCount = Math.max(...weeklyData.map(d => d.count), 1)

  const RECURRENCE_LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="px-6 py-3.5 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <h1 className="text-sm font-semibold text-gray-900 dark:text-white">Dashboard</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-8">

          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Done Today"
              value={stats.doneToday}
              sub={stats.doneToday === 1 ? '1 task completed' : `${stats.doneToday} tasks completed`}
              accent="text-green-600 dark:text-green-400"
            />
            <StatCard
              label="In Progress"
              value={stats.inProgress}
              sub="active right now"
              accent="text-amber-500 dark:text-amber-400"
            />
            <StatCard
              label="Overdue"
              value={stats.overdue}
              sub={stats.overdue === 0 ? 'all clear' : 'need attention'}
              accent={stats.overdue > 0 ? 'text-red-500 dark:text-red-400' : 'text-gray-900 dark:text-white'}
            />
            <StatCard
              label="Time Today"
              value={formatDuration(stats.timeToday)}
              sub="logged so far"
            />
          </div>

          {/* Top Streaks */}
          {topStreaks.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Top Streaks</h2>
              <div className="flex gap-3 flex-wrap">
                {topStreaks.map(task => (
                  <div key={task.id} className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
                    <span className="text-lg">🔥</span>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white leading-tight">{task.title}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {task.streak_count} day streak · {RECURRENCE_LABELS[task.recurrence_type] || task.recurrence_type}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Weekly Progress */}
          <div>
            <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-4">This Week</h2>
            <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-5 shadow-sm">
              <div className="flex items-end gap-2 h-24">
                {weeklyData.map((day, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                    <span className="text-xs tabular-nums font-medium text-gray-400 dark:text-gray-500">
                      {day.count > 0 ? day.count : ''}
                    </span>
                    <div className="w-full flex items-end" style={{ height: '60px' }}>
                      <div
                        className={clsx(
                          'w-full rounded-t-md transition-all duration-500',
                          day.isToday ? 'bg-purple-500' : 'bg-gray-200 dark:bg-gray-700',
                          day.count === 0 && 'opacity-40',
                        )}
                        style={{ height: day.count === 0 ? '4px' : `${(day.count / maxWeeklyCount) * 60}px` }}
                      />
                    </div>
                    <span className={clsx(
                      'text-xs font-medium',
                      day.isToday ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400 dark:text-gray-500',
                    )}>
                      {day.label}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-3 text-center">
                {weeklyData.reduce((s, d) => s + d.count, 0)} tasks completed this week
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
