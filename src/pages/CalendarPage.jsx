import { useState } from 'react'
import { format, addMonths, subMonths, addWeeks, subWeeks, startOfWeek, endOfWeek, isSameDay } from 'date-fns'
import clsx from 'clsx'
import { supabase } from '../lib/supabase'
import { useCalendarData } from '../hooks/useCalendarData'
import MonthView from '../components/calendar/MonthView'
import WeekView from '../components/calendar/WeekView'
import DayPanel from '../components/calendar/DayPanel'
import InspectorPanel from '../components/calendar/InspectorPanel'

const RECURRING_FILTERS = [
  { id: 'all',       label: 'All' },
  { id: 'recurring', label: 'Recurring' },
  { id: 'one_time',  label: 'One-time' },
]

const STATUS_FILTERS = [
  { id: 'all',         label: 'All',         dot: null },
  { id: 'in_progress', label: 'In Progress',  dot: 'bg-amber-400' },
  { id: 'done',        label: 'Done',         dot: 'bg-green-500' },
]

export default function CalendarPage({ session }) {
  const { tasks, allTags, loading, handleTaskUpdate } = useCalendarData(session)

  const [viewMode, setViewMode]       = useState(localStorage.getItem('tracku_calendar_view') || 'week')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null)
  const [inspectedTask, setInspectedTask] = useState(null)

  const [recurringFilter, setRecurringFilter] = useState(
    () => localStorage.getItem('tracku_cal_recurring') || 'all'
  )
  const [statusFilter, setStatusFilter] = useState(
    () => localStorage.getItem('tracku_cal_status') || 'all'
  )

  const filteredTasks = tasks.filter(t => {
    if (recurringFilter === 'recurring' && !t.is_recurring) return false
    if (recurringFilter === 'one_time' && t.is_recurring) return false
    if (statusFilter === 'done' && t.status !== 'done') return false
    if (statusFilter === 'in_progress' && t.status !== 'in_progress' && t.status !== 'on_hold') return false
    return true
  })

  function goBack() {
    setSelectedDate(null)
    setCurrentDate(d => viewMode === 'month' ? subMonths(d, 1) : subWeeks(d, 1))
  }

  function goForward() {
    setSelectedDate(null)
    setCurrentDate(d => viewMode === 'month' ? addMonths(d, 1) : addWeeks(d, 1))
  }

  function goToday() {
    setSelectedDate(null)
    setCurrentDate(new Date())
  }

  function handleDateClick(date) {
    setInspectedTask(null)
    setSelectedDate(prev => prev && isSameDay(prev, date) ? null : date)
  }

  function handleViewChange(v) {
    setViewMode(v)
    localStorage.setItem('tracku_calendar_view', v)
    setSelectedDate(null)
    setInspectedTask(null)
  }

  function handleTaskClick(task) {
    setSelectedDate(null)
    setInspectedTask(prev => prev?.id === task.id ? null : task)
  }

  function handleInspectorUpdate(updatedRaw) {
    handleTaskUpdate(updatedRaw)
    setInspectedTask(prev => {
      if (!prev) return prev
      const tags = updatedRaw.tags?.length ? updatedRaw.tags : prev.tags
      return { ...prev, ...updatedRaw, tags }
    })
  }

  async function handleInspectorClose() {
    const taskId = inspectedTask?.id
    setInspectedTask(null)
    if (!taskId) return
    const { data } = await supabase
      .from('tasks')
      .select('*, task_tags(tags(id, name, color)), subtasks(id, is_done)')
      .eq('id', taskId).single()
    if (data) handleTaskUpdate(data)
  }

  function handleRecurringFilter(v) {
    setRecurringFilter(v)
    localStorage.setItem('tracku_cal_recurring', v)
    setInspectedTask(null)
    setSelectedDate(null)
  }

  function handleStatusFilter(v) {
    setStatusFilter(v)
    localStorage.setItem('tracku_cal_status', v)
    setInspectedTask(null)
    setSelectedDate(null)
  }

  const hasActiveFilters = recurringFilter !== 'all' || statusFilter !== 'all'

  const headerTitle = viewMode === 'month'
    ? format(currentDate, 'MMMM yyyy')
    : `${format(startOfWeek(currentDate), 'MMM d')} – ${format(endOfWeek(currentDate), 'MMM d, yyyy')}`

  if (loading) return (
    <div className="flex items-center justify-center h-full text-sm text-gray-400">Loading…</div>
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Main header */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <div className="flex items-center gap-2.5">
          <h1 className="text-sm font-semibold text-gray-900 dark:text-white">Calendar</h1>
          <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">{headerTitle}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Month / Week toggle */}
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            {['month', 'week'].map(v => (
              <button
                key={v}
                onClick={() => handleViewChange(v)}
                className={clsx(
                  'px-3 py-1 rounded-md text-xs font-medium capitalize transition-all',
                  viewMode === v
                    ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
                )}
              >{v}</button>
            ))}
          </div>
          {/* Navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={goBack}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >‹</button>
            <button
              onClick={goToday}
              className="px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >Today</button>
            <button
              onClick={goForward}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >›</button>
          </div>
        </div>
      </div>

      {/* Filter strip */}
      <div className="flex items-center gap-3 px-6 py-2 border-b border-gray-100 dark:border-gray-800 shrink-0">

        {/* Recurring filter */}
        <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 gap-0.5">
          {RECURRING_FILTERS.map(opt => (
            <button
              key={opt.id}
              onClick={() => handleRecurringFilter(opt.id)}
              className={clsx(
                'px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                recurringFilter === opt.id
                  ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
              )}
            >{opt.label}</button>
          ))}
        </div>

        <div className="w-px h-3.5 bg-gray-200 dark:bg-gray-700 shrink-0" />

        {/* Status filter */}
        <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 gap-0.5">
          {STATUS_FILTERS.map(opt => (
            <button
              key={opt.id}
              onClick={() => handleStatusFilter(opt.id)}
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                statusFilter === opt.id
                  ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
              )}
            >
              {opt.dot && <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', opt.dot)} />}
              {opt.label}
            </button>
          ))}
        </div>

        {/* Active filter count + clear */}
        {hasActiveFilters && (
          <button
            onClick={() => { handleRecurringFilter('all'); handleStatusFilter('all') }}
            className="flex items-center gap-1 text-xs font-medium text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors ml-1"
          >
            <span className="text-[10px] w-4 h-4 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center font-bold">
              {(recurringFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0)}
            </span>
            Clear
          </button>
        )}

        {/* Task count indicator */}
        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500 tabular-nums">
          {filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'}
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden min-w-0 flex">
          {viewMode === 'month' ? (
            <MonthView
              currentDate={currentDate}
              tasks={filteredTasks}
              selectedDate={selectedDate}
              onDateClick={handleDateClick}
            />
          ) : (
            <WeekView
              currentDate={currentDate}
              tasks={filteredTasks}
              onTaskClick={handleTaskClick}
            />
          )}
        </div>

        {selectedDate && viewMode === 'month' && !inspectedTask && (
          <DayPanel
            key={selectedDate.toISOString()}
            date={selectedDate}
            tasks={filteredTasks}
            onClose={() => setSelectedDate(null)}
            onTaskClick={handleTaskClick}
          />
        )}

        {inspectedTask && (
          <InspectorPanel
            key={inspectedTask.id}
            task={inspectedTask}
            allTags={allTags}
            onClose={handleInspectorClose}
            onTaskUpdate={handleInspectorUpdate}
            onArchive={id => { handleTaskUpdate({ id, archived: true }); setInspectedTask(null) }}
          />
        )}
      </div>

    </div>
  )
}
