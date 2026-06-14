import { useState, useRef, useEffect } from 'react'
import { format, addMonths, subMonths, addWeeks, subWeeks, startOfWeek, endOfWeek, startOfDay, isSameDay } from 'date-fns'
import clsx from 'clsx'
import { supabase } from '../lib/supabase'
import { useCalendarData } from '../hooks/useCalendarData'
import MonthView from '../components/calendar/MonthView'
import WeekView from '../components/calendar/WeekView'
import MobileWeekView from '../components/calendar/MobileWeekView'
import DayPanel from '../components/calendar/DayPanel'
import TaskModal from '../components/tasks/TaskModal'

const RECURRING_FILTERS = [
  { id: 'all',       label: 'All' },
  { id: 'recurring', label: 'Recurring' },
  { id: 'one_time',  label: 'One-time' },
]

const STATUS_FILTERS = [
  { id: 'all',         label: 'All',         dot: null },
  { id: 'in_progress', label: 'In Progress',  dot: 'bg-amber-400' },
  { id: 'done',        label: 'Done',         dot: 'bg-green-500' },
  { id: 'overdue',     label: 'Overdue',      dot: 'bg-red-500' },
]

export default function CalendarPage({ session }) {
  const { tasks, allTags, loading, handleTaskUpdate, addTask } = useCalendarData(session)

  const [viewMode, setViewMode]       = useState(localStorage.getItem('tracku_calendar_view') || 'week')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null)
  const [inspectedTask, setInspectedTask] = useState(null)

  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const [tagFilter, setTagFilter]   = useState('all')

  const [recurringFilter, setRecurringFilter] = useState(
    () => localStorage.getItem('tracku_cal_recurring') || 'all'
  )
  const [statusFilter, setStatusFilter] = useState(
    () => localStorage.getItem('tracku_cal_status') || 'all'
  )

  const filteredTasks = tasks.filter(t => {
    if (t._isHistory) {
      // Virtual history entries: only filter by recurring/status; skip tag filter
      if (recurringFilter === 'one_time') return false
      if (statusFilter === 'in_progress' || statusFilter === 'overdue') return false
      return true
    }
    if (tagFilter !== 'all' && !t.tags?.some(tag => tag.id === tagFilter)) return false
    if (recurringFilter === 'recurring' && !t.is_recurring) return false
    if (recurringFilter === 'one_time' && t.is_recurring) return false
    if (statusFilter === 'done' && t.status !== 'done') return false
    if (statusFilter === 'in_progress' && t.status !== 'in_progress' && t.status !== 'on_hold') return false
    if (statusFilter === 'overdue') {
      const isOverdue = t.deadline && startOfDay(new Date(t.deadline)) < startOfDay(new Date()) && t.status !== 'done'
      if (!isOverdue) return false
    }
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

  const filterPanelRef = useRef(null)
  useEffect(() => {
    if (!showFilterPanel) return
    function onMouseDown(e) {
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target)) {
        setShowFilterPanel(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [showFilterPanel])

  const hasActiveFilters = recurringFilter !== 'all' || statusFilter !== 'all' || tagFilter !== 'all'

  const headerTitle = viewMode === 'month'
    ? format(currentDate, 'MMMM yyyy')
    : `${format(startOfWeek(currentDate), 'MMM d')} – ${format(endOfWeek(currentDate), 'MMM d, yyyy')}`

  if (loading) return (
    <div className="flex items-center justify-center h-full text-sm text-gray-400">Loading…</div>
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Desktop header ── */}
      <div className="hidden md:block px-6 pt-6 pb-4 shrink-0">

        {/* Row 1: Title + nav controls */}
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-5xl font-black text-gray-900 dark:text-white leading-none tracking-tight">
            {format(currentDate, 'MMMM yyyy')}
          </h1>

          <div className="flex items-center gap-2.5 shrink-0 mt-1">
            {/* ‹ Today(count) › */}
            <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <button onClick={goBack} className="w-8 h-9 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-base">‹</button>
              <button onClick={goToday} className="flex items-center gap-2 px-3 h-9 border-x border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  {viewMode === 'month'
                    ? format(currentDate, 'MMMM yyyy')
                    : `${format(startOfWeek(currentDate), 'MMM d')} – ${format(endOfWeek(currentDate), 'MMM d')}`}
                </span>
              </button>
              <button onClick={goForward} className="w-8 h-9 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-base">›</button>
            </div>

            {/* Month / Week */}
            <div className="flex border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              {['month', 'week'].map(v => (
                <button key={v} onClick={() => handleViewChange(v)}
                  className={clsx(
                    'px-4 py-2 text-sm font-medium capitalize transition-all',
                    viewMode === v ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800',
                    v === 'week' && 'border-l border-gray-200 dark:border-gray-700',
                  )}
                >{v}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Row 2: Inline filter bar */}
        <div className="flex items-center gap-1 mt-4">

          {/* Status pills */}
          {STATUS_FILTERS.map(opt => (
            <button key={opt.id} onClick={() => handleStatusFilter(opt.id)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95',
                statusFilter === opt.id
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
              )}
            >
              {opt.dot && <span className={clsx('w-2 h-2 rounded-full shrink-0', opt.dot)} />}
              {opt.label}
            </button>
          ))}

          <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1.5" />

          {/* Type pills */}
          {RECURRING_FILTERS.map(opt => (
            <button key={opt.id} onClick={() => handleRecurringFilter(opt.id)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95',
                recurringFilter === opt.id
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
              )}
            >{opt.label}</button>
          ))}

          {/* Filter icon button + dropdown */}
          <div className="ml-auto relative" ref={filterPanelRef}>
            <button
              onClick={() => setShowFilterPanel(p => !p)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95',
                showFilterPanel || hasActiveFilters
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : 'border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
              )}
            >
              {/* Funnel icon */}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              Filters
              {hasActiveFilters && (
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
              )}
            </button>

            {/* Dropdown panel */}
            {showFilterPanel && (
              <div className="absolute top-full right-0 mt-2 w-72 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl z-50 p-4">

                {/* Task Status */}
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5">Task Status</p>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {STATUS_FILTERS.map(opt => (
                    <button key={opt.id} onClick={() => handleStatusFilter(opt.id)}
                      className={clsx(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95',
                        statusFilter === opt.id
                          ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700',
                      )}
                    >
                      {opt.dot && <span className={clsx('w-2 h-2 rounded-full shrink-0', opt.dot)} />}
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Task Type */}
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5">Task Type</p>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {RECURRING_FILTERS.map(opt => (
                    <button key={opt.id} onClick={() => handleRecurringFilter(opt.id)}
                      className={clsx(
                        'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95',
                        recurringFilter === opt.id
                          ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700',
                      )}
                    >{opt.label}</button>
                  ))}
                </div>

                {/* Tag */}
                {allTags.length > 0 && (
                  <>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5">Tag</p>
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      <button onClick={() => setTagFilter('all')}
                        className={clsx(
                          'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95',
                          tagFilter === 'all'
                            ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700',
                        )}
                      >All</button>
                      {allTags.map(tag => (
                        <button key={tag.id} onClick={() => setTagFilter(prev => prev === tag.id ? 'all' : tag.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                          style={tagFilter === tag.id ? { backgroundColor: tag.color, color: '#fff', borderColor: tag.color } : {}}
                        >
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                          {tag.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {/* Clear all */}
                {hasActiveFilters && (
                  <button
                    onClick={() => { handleRecurringFilter('all'); handleStatusFilter('all'); setTagFilter('all') }}
                    className="w-full py-2 rounded-lg text-xs font-medium text-red-500 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 active:scale-95 transition-all"
                  >Clear all filters</button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile filter sheet */}
      {showMobileFilters && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={() => setShowMobileFilters(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white dark:bg-gray-900 rounded-t-2xl px-5 pt-4 shadow-2xl animate-slide-up"
            style={{ paddingBottom: 'calc(56px + env(safe-area-inset-bottom, 0px) + 80px)' }}
          >
            <div className="w-8 h-1 rounded-full bg-gray-200 dark:bg-gray-700 mx-auto mb-5" />
            {allTags.length > 0 && (
              <>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Tag</p>
                <div className="flex flex-wrap gap-2 mb-5">
                  <button onClick={() => setTagFilter('all')}
                    className={clsx('px-3 py-1.5 rounded-xl text-sm font-medium transition-all active:scale-95',
                      tagFilter === 'all' ? 'bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                    )}>All</button>
                  {allTags.map(tag => (
                    <button key={tag.id} onClick={() => setTagFilter(prev => prev === tag.id ? 'all' : tag.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all active:scale-95 border border-gray-200 dark:border-gray-700"
                      style={tagFilter === tag.id ? { backgroundColor: tag.color, color: '#fff', borderColor: tag.color } : {}}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                      {tag.name}
                    </button>
                  ))}
                </div>
              </>
            )}
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Type</p>
            <div className="flex gap-2 mb-5">
              {RECURRING_FILTERS.map(opt => (
                <button key={opt.id} onClick={() => handleRecurringFilter(opt.id)}
                  className={clsx('px-4 py-2 rounded-xl text-sm font-medium transition-all active:scale-95',
                    recurringFilter === opt.id
                      ? 'bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  )}>{opt.label}</button>
              ))}
            </div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Status</p>
            <div className="flex gap-2 mb-6">
              {STATUS_FILTERS.map(opt => (
                <button key={opt.id} onClick={() => handleStatusFilter(opt.id)}
                  className={clsx('flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all active:scale-95',
                    statusFilter === opt.id
                      ? 'bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  )}>
                  {opt.dot && <span className={clsx('w-2 h-2 rounded-full shrink-0', opt.dot)} />}
                  {opt.label}
                </button>
              ))}
            </div>
            {hasActiveFilters && (
              <button
                onClick={() => { handleRecurringFilter('all'); handleStatusFilter('all'); setTagFilter('all'); setShowMobileFilters(false) }}
                className="w-full py-2.5 rounded-xl text-sm font-medium text-red-500 border border-red-200 dark:border-red-800 active:scale-95 transition-all"
              >Clear filters</button>
            )}
          </div>
        </>
      )}

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Mobile: vertical agenda (week) or month grid */}
        <div className={clsx(
          'flex md:hidden flex-1 overflow-hidden flex-col',
          viewMode === 'week' ? 'bg-[#EBEBEB] dark:bg-[#1A1A1A]' : 'bg-gray-50 dark:bg-gray-950',
        )}>
          {viewMode === 'week' ? (
            <MobileWeekView
              currentDate={currentDate}
              tasks={filteredTasks}
              onTaskClick={handleTaskClick}
              onAddTask={addTask}
            />
          ) : (
            <MonthView
              currentDate={currentDate}
              tasks={filteredTasks}
              selectedDate={selectedDate}
              onDateClick={handleDateClick}
            />
          )}
        </div>

        {/* Desktop: original views */}
        <div className="hidden md:flex flex-1 overflow-hidden min-w-0">
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
          <TaskModal
            key={inspectedTask.id}
            task={inspectedTask}
            allTags={allTags}
            onClose={handleInspectorClose}
            onTaskUpdate={handleInspectorUpdate}
            onArchive={id => { handleTaskUpdate({ id, archived: true }); setInspectedTask(null) }}
          />
        )}
      </div>

      {/* Mobile floating bar */}
      <div
        className="md:hidden fixed bottom-0 left-0 right-0 flex items-center justify-between gap-2 px-4 pointer-events-none"
        style={{ paddingBottom: 'calc(56px + env(safe-area-inset-bottom, 0px) + 12px)' }}
      >
        {/* Filter — far left */}
        <button
          onClick={() => setShowMobileFilters(p => !p)}
          className={clsx(
            'pointer-events-auto w-[48px] h-[48px] shrink-0 rounded-2xl flex items-center justify-center shadow-md transition-all active:scale-95',
            hasActiveFilters
              ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900'
              : 'bg-[#D2D2D2] dark:bg-gray-700 text-gray-700 dark:text-gray-200',
          )}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {/* Week / Month toggle — centre */}
        <div className="pointer-events-auto flex bg-[#D2D2D2] dark:bg-gray-700 rounded-2xl p-1 shadow-md gap-0.5">
          {['month', 'week'].map(v => (
            <button
              key={v}
              onClick={() => handleViewChange(v)}
              className={clsx(
                'px-3.5 py-2 rounded-xl text-xs font-semibold capitalize transition-all',
                viewMode === v
                  ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400',
              )}
            >{v}</button>
          ))}
        </div>

        {/* ‹ › arrows — far right */}
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            onClick={goBack}
            className="w-[48px] h-[48px] rounded-2xl bg-[#D2D2D2] dark:bg-gray-700 text-gray-700 dark:text-gray-200 flex items-center justify-center shadow-md active:scale-95 transition-all text-xl font-light"
          >‹</button>
          <button
            onClick={goForward}
            className="w-[48px] h-[48px] rounded-2xl bg-[#D2D2D2] dark:bg-gray-700 text-gray-700 dark:text-gray-200 flex items-center justify-center shadow-md active:scale-95 transition-all text-xl font-light"
          >›</button>
        </div>
      </div>

    </div>
  )
}
