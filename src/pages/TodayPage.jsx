import { useState, useEffect, useRef } from 'react'
import { format, isToday, isBefore, startOfDay, endOfDay } from 'date-fns'
import clsx from 'clsx'
import { supabase } from '../lib/supabase'
import { computeTimeLogged } from '../lib/time'
import { TaskCardDisplay } from '../components/board/TaskCard'
import TaskModal from '../components/tasks/TaskModal'

function normalizeTasks(data = []) {
  return data.map(task => ({
    ...task,
    tags:             (task.task_tags || []).map(tt => tt.tags).filter(Boolean),
    subtaskCount:     (task.subtasks || []).length,
    subtaskDoneCount: (task.subtasks || []).filter(s => s.is_done).length,
    timeLoggedMs:     computeTimeLogged(task),
    isTimerActive:    !!task.timer_started_at,
  }))
}

const SECTIONS = [
  { id: 'in_progress', label: 'In Progress', dot: 'bg-amber-400', emptyText: 'Nothing in progress' },
  { id: 'due_today',   label: 'Due Today',   dot: 'bg-blue-400',  emptyText: null },
  { id: 'overdue',     label: 'Overdue',     dot: 'bg-red-500',   emptyText: null },
]

const SORT_OPTS = [
  { id: 'deadline',        label: 'Deadline' },
  { id: 'priority',        label: 'Priority' },
  { id: 'title',           label: 'Name' },
  { id: 'created_at_asc',  label: 'Date created ↑' },
  { id: 'created_at_desc', label: 'Date created ↓' },
]

const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 }

const FILTER_OPTS = [
  { id: 'all',       label: 'All' },
  { id: 'urgent',    label: 'Urgent' },
  { id: 'high',      label: 'High' },
  { id: 'medium',    label: 'Medium' },
  { id: 'low',       label: 'Low' },
  { id: 'recurring', label: 'Recurring' },
]

function sortTaskList(list, sortBy) {
  if (sortBy === 'deadline') {
    return [...list].sort((a, b) => {
      if (!a.deadline && !b.deadline) return 0
      if (!a.deadline) return 1
      if (!b.deadline) return -1
      return new Date(a.deadline) - new Date(b.deadline)
    })
  }
  if (sortBy === 'priority') {
    return [...list].sort((a, b) =>
      (PRIORITY_RANK[a.priority] ?? 4) - (PRIORITY_RANK[b.priority] ?? 4)
    )
  }
  if (sortBy === 'title') {
    return [...list].sort((a, b) => a.title.localeCompare(b.title))
  }
  if (sortBy === 'created_at_asc')  return [...list].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  if (sortBy === 'created_at_desc') return [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  return list
}

export default function TodayPage({ session }) {
  const [tasks, setTasks]               = useState([])
  const [allTags, setAllTags]           = useState([])
  const [loading, setLoading]           = useState(true)
  const [editingTask, setEditingTask]   = useState(null)
  const [searchQuery, setSearchQuery]   = useState('')
  const [addingTask, setAddingTask]     = useState(false)
  const [newTitle, setNewTitle]         = useState('')
  const [sortBy, setSortBy]             = useState(() => localStorage.getItem('tracku_today_sort') || 'deadline')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [tagFilter, setTagFilter]       = useState(() => localStorage.getItem('tracku_today_tag') || 'all')
  const [sortOpen, setSortOpen]         = useState(false)
  const [filterOpen, setFilterOpen]     = useState(false)
  const addInputRef = useRef(null)

  useEffect(() => { if (addingTask) addInputRef.current?.focus() }, [addingTask])

  useEffect(() => {
    fetchData()
    const id = setInterval(() => {
      setTasks(prev => {
        if (!prev.some(t => t.isTimerActive)) return prev
        return prev.map(t => t.isTimerActive ? { ...t, timeLoggedMs: computeTimeLogged(t) } : t)
      })
    }, 1_000)
    return () => clearInterval(id)
  }, [])

  async function fetchData() {
    const [{ data: taskData }, { data: tagData }] = await Promise.all([
      supabase
        .from('tasks')
        .select('*, task_tags(tags(id, name, color)), subtasks(id, is_done)')
        .eq('user_id', session.user.id)
        .neq('status', 'done')
        .order('deadline', { ascending: true, nullsLast: true }),
      supabase.from('tags').select('*').order('position', { ascending: true, nullsFirst: false }).order('name'),
    ])
    setTasks(normalizeTasks((taskData || []).filter(t => t.archived !== true)))
    setAllTags(tagData || [])
    setLoading(false)
  }

  async function handleAddTask() {
    const title = newTitle.trim()
    if (!title) { setAddingTask(false); return }
    const colTasks = tasks.filter(t => t.status === 'not_started')
    const minPos   = colTasks.length ? Math.min(...colTasks.map(t => t.position ?? 0)) : 0
    const position = minPos - 1000
    const { data } = await supabase
      .from('tasks')
      .insert({ user_id: session.user.id, title, status: 'not_started', position, deadline: endOfDay(new Date()).toISOString() })
      .select('*, task_tags(tags(id, name, color)), subtasks(id, is_done)')
      .single()
    if (data) setTasks(prev => [...prev, ...normalizeTasks([data])])
    setNewTitle('')
    setAddingTask(false)
  }

  function handleTaskUpdate(updatedRaw) {
    const [normalized] = normalizeTasks([updatedRaw])
    setTasks(prev => prev.map(t => t.id === normalized.id ? { ...t, ...normalized } : t))
    setEditingTask(prev => {
      if (!prev) return prev
      const tags = normalized.tags?.length ? normalized.tags : prev.tags
      return { ...prev, ...normalized, tags }
    })
  }

  async function handleModalClose() {
    const taskId = editingTask?.id
    setEditingTask(null)
    if (!taskId) return
    const { data } = await supabase
      .from('tasks')
      .select('*, task_tags(tags(id, name, color)), subtasks(id, is_done)')
      .eq('id', taskId).single()
    if (data) {
      const [normalized] = normalizeTasks([data])
      if (normalized.status === 'done') {
        setTasks(prev => prev.filter(t => t.id !== taskId))
      } else {
        setTasks(prev => prev.map(t => t.id === normalized.id ? normalized : t))
      }
    }
  }

  async function handleToggleHold(task) {
    const now = new Date()
    if (task.status === 'in_progress') {
      const secs = task.timer_started_at
        ? Math.max(0, Math.floor((now - new Date(task.timer_started_at)) / 1000))
        : 0
      const newTimeSecs = (task.time_spent_seconds || 0) + secs
      setTasks(prev => prev.map(t => t.id === task.id ? {
        ...t,
        status: 'on_hold',
        timer_started_at: null,
        isTimerActive: false,
        time_spent_seconds: newTimeSecs,
        timeLoggedMs: newTimeSecs * 1000,
      } : t))
      if (task.timer_started_at) {
        supabase.from('time_logs').insert({
          task_id: task.id, user_id: task.user_id,
          started_at: task.timer_started_at, ended_at: now.toISOString(),
          duration_seconds: secs,
        })
      }
      await supabase.from('tasks').update({
        status: 'on_hold',
        timer_started_at: null,
        time_spent_seconds: newTimeSecs,
      }).eq('id', task.id)
    } else if (task.status === 'on_hold') {
      const timerStartedAt = now.toISOString()
      setTasks(prev => prev.map(t => t.id === task.id ? {
        ...t,
        status: 'in_progress',
        timer_started_at: timerStartedAt,
        isTimerActive: true,
      } : t))
      await supabase.from('tasks').update({
        status: 'in_progress',
        timer_started_at: timerStartedAt,
      }).eq('id', task.id)
    }
  }

  function handleSortChange(id) {
    setSortBy(id)
    localStorage.setItem('tracku_today_sort', id)
  }

  function handleTagFilterChange(id) {
    setTagFilter(id)
    localStorage.setItem('tracku_today_tag', id)
  }

  const today = startOfDay(new Date())

  const filtered = tasks.filter(t => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const match = t.title.toLowerCase().includes(q) ||
        t.tags?.some(tag => tag.name.toLowerCase().includes(q)) ||
        t.notes?.toLowerCase().includes(q)
      if (!match) return false
    }
    if (priorityFilter === 'recurring') { if (!t.is_recurring) return false }
    else if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false
    if (tagFilter !== 'all' && !t.tags?.some(tag => tag.id === tagFilter)) return false
    return true
  })

  const sections = {
    in_progress: sortTaskList(filtered.filter(t => t.status === 'in_progress' || t.status === 'on_hold'), sortBy),
    due_today:   sortTaskList(filtered.filter(t => t.status !== 'in_progress' && t.status !== 'on_hold' && t.deadline && isToday(new Date(t.deadline))), sortBy),
    overdue:     sortTaskList(filtered.filter(t => t.status !== 'in_progress' && t.status !== 'on_hold' && t.deadline && isBefore(new Date(t.deadline), today)), sortBy),
  }

  const totalCount = sections.in_progress.length + sections.due_today.length + sections.overdue.length
  const sortActive   = sortBy !== 'deadline'
  const filterActive = priorityFilter !== 'all'

  if (loading) return (
    <div className="flex items-center justify-center h-full text-sm text-gray-400">Loading…</div>
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <div className="flex items-center gap-2.5">
          <h1 className="text-sm font-semibold text-gray-900 dark:text-white">Today</h1>
          <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">{format(new Date(), 'MMM d')}</span>
          <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full font-medium">
            {totalCount} {totalCount === 1 ? 'task' : 'tasks'}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">⌕</span>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search…"
              className="pl-7 pr-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:border-purple-400 text-gray-900 dark:text-white placeholder-gray-400 w-40 transition-all focus:w-52"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">✕</button>
            )}
          </div>
          <button
            onClick={() => setAddingTask(true)}
            className="text-xs px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-medium transition-all active:scale-95 shadow-sm hover:shadow-md whitespace-nowrap"
          >+ New Task</button>
        </div>
      </div>

      {/* Tag + control strip */}
      <div className="flex items-center border-b border-gray-100 dark:border-gray-800 shrink-0">
        {/* Tag tabs — scrollable */}
        <div className="flex items-center flex-1 overflow-x-auto min-w-0" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <div className="flex items-center px-6 min-w-max">
            <button
              onClick={() => handleTagFilterChange('all')}
              className={clsx(
                'px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 -mb-px transition-all duration-200',
                tagFilter === 'all'
                  ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
              )}
            >All</button>
            {allTags.map(tag => (
              <button
                key={tag.id}
                onClick={() => handleTagFilterChange(tag.id)}
                className={clsx(
                  'px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 -mb-px transition-all duration-200',
                  tagFilter === tag.id
                    ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
                )}
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle" style={{ backgroundColor: tag.color }} />
                {tag.name}
              </button>
            ))}
          </div>
        </div>

        {/* Sort + Filter buttons — fixed right */}
        <div className="flex items-center gap-1.5 px-3 py-2 shrink-0 border-l border-gray-100 dark:border-gray-800">

          {/* Sort dropdown */}
          <div className="relative">
            <button
              onClick={() => { setSortOpen(o => !o); setFilterOpen(false) }}
              className={clsx(
                'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-all',
                sortActive
                  ? 'border-purple-200 text-purple-600 bg-purple-50 dark:border-purple-800 dark:text-purple-400 dark:bg-purple-900/20'
                  : 'border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400 hover:border-gray-300 hover:text-gray-600 dark:hover:border-gray-600 dark:hover:text-gray-300',
              )}
            >
              <span>↕</span>
              <span>Sort{sortActive ? ` · ${SORT_OPTS.find(o => o.id === sortBy)?.label}` : ''}</span>
            </button>
            {sortOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-lg py-1 min-w-[152px] animate-pop-in">
                  {SORT_OPTS.map(o => (
                    <button
                      key={o.id}
                      onClick={() => { handleSortChange(o.id); setSortOpen(false) }}
                      className={clsx(
                        'w-full text-left flex items-center gap-2 px-3 py-2 text-xs transition-colors',
                        sortBy === o.id
                          ? 'text-purple-600 dark:text-purple-400 font-medium'
                          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800',
                      )}
                    >
                      <span className={clsx('w-3 text-center', sortBy === o.id ? 'text-purple-600 dark:text-purple-400' : 'opacity-0')}>✓</span>
                      {o.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Filter (priority) dropdown */}
          <div className="relative">
            <button
              onClick={() => { setFilterOpen(o => !o); setSortOpen(false) }}
              className={clsx(
                'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-all',
                filterActive
                  ? 'border-purple-200 text-purple-600 bg-purple-50 dark:border-purple-800 dark:text-purple-400 dark:bg-purple-900/20'
                  : 'border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400 hover:border-gray-300 hover:text-gray-600 dark:hover:border-gray-600 dark:hover:text-gray-300',
              )}
            >
              <span>⊟</span>
              <span>Filter{filterActive ? ` · ${FILTER_OPTS.find(o => o.id === priorityFilter)?.label}` : ''}</span>
            </button>
            {filterOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setFilterOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-lg py-1 min-w-[152px] animate-pop-in">
                  {FILTER_OPTS.map(o => (
                    <button
                      key={o.id}
                      onClick={() => { setPriorityFilter(o.id); setFilterOpen(false) }}
                      className={clsx(
                        'w-full text-left flex items-center gap-2 px-3 py-2 text-xs transition-colors',
                        priorityFilter === o.id
                          ? 'text-purple-600 dark:text-purple-400 font-medium'
                          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800',
                      )}
                    >
                      <span className={clsx('w-3 text-center', priorityFilter === o.id ? 'text-purple-600 dark:text-purple-400' : 'opacity-0')}>✓</span>
                      {o.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="max-w-2xl mx-auto space-y-8">

          {addingTask && (
            <div className="animate-fade-up bg-white dark:bg-gray-800 rounded-xl border-2 border-purple-300 dark:border-purple-700 px-4 py-3 shadow-sm">
              <input
                ref={addInputRef}
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleAddTask()
                  if (e.key === 'Escape') { setNewTitle(''); setAddingTask(false) }
                }}
                onBlur={() => { if (newTitle.trim()) handleAddTask(); else { setNewTitle(''); setAddingTask(false) } }}
                placeholder="Task title…"
                className="w-full text-sm bg-transparent text-gray-900 dark:text-white outline-none placeholder-gray-300 dark:placeholder-gray-600"
              />
              <p className="text-xs text-gray-300 dark:text-gray-600 mt-1.5">↵ Add · Esc Cancel · Deadline set to today</p>
            </div>
          )}

          {totalCount === 0 && !addingTask ? (
            <div className="flex flex-col items-center justify-center h-64 gap-2">
              <div className="text-2xl">✦</div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {searchQuery || filterActive || tagFilter !== 'all' ? 'No tasks match your filters' : "You're all caught up"}
              </p>
              <p className="text-xs text-gray-300 dark:text-gray-600">
                {!searchQuery && !filterActive && tagFilter === 'all' && 'Nothing in progress or due today'}
              </p>
            </div>
          ) : (
            SECTIONS.map(section => {
              const sectionTasks = sections[section.id]
              if (sectionTasks.length === 0 && !section.emptyText) return null
              return (
                <div key={section.id}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={clsx('w-2 h-2 rounded-full shrink-0', section.dot)} />
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      {section.label}
                    </span>
                    <span className="text-xs text-gray-300 dark:text-gray-600 tabular-nums">{sectionTasks.length}</span>
                  </div>
                  {sectionTasks.length === 0 ? (
                    <p className="text-xs text-gray-300 dark:text-gray-700 pl-4">{section.emptyText}</p>
                  ) : (
                    <div className="space-y-2">
                      {sectionTasks.map(task => (
                        <div key={task.id} onClick={() => setEditingTask(task)} className="cursor-pointer">
                          <TaskCardDisplay
                            task={task}
                            onHold={(task.status === 'in_progress' || task.status === 'on_hold') ? () => handleToggleHold(task) : undefined}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {editingTask && (
        <TaskModal
          task={editingTask}
          allTags={allTags}
          onClose={handleModalClose}
          onTaskUpdate={handleTaskUpdate}
          onArchive={id => { setTasks(prev => prev.filter(t => t.id !== id)); setEditingTask(null) }}
        />
      )}
    </div>
  )
}
