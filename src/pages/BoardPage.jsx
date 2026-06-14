import { useState, useEffect, useRef } from 'react'
import {
  DndContext, DragOverlay, closestCenter,
  PointerSensor, TouchSensor, useSensor, useSensors,
  defaultDropAnimationSideEffects,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import clsx from 'clsx'
import { supabase } from '../lib/supabase'
import { computeTimeLogged } from '../lib/time'
import { sendNtfyNotification, getDeadlinePendingTasks, getOverduePendingTasks, getHourlyOverdueTasks, markHourlyOverdueNotified, pruneOverdueTimestamps, getRecurringNotifyTasks, markRecurringHourlyNotified } from '../lib/notifications'
import KanbanColumn from '../components/board/KanbanColumn'
import { TaskCardDisplay } from '../components/board/TaskCard'
import TaskModal from '../components/tasks/TaskModal'
import SortableTagStrip from '../components/board/SortableTagStrip'

const COLUMNS = [
  { id: 'not_started', label: 'Not Started' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'done',        label: 'Done' },
]
const COLUMN_IDS = new Set(COLUMNS.map(c => c.id))

const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 }
const FILTER_OPTS = [
  { id: 'all',       label: 'All' },
  { id: 'urgent',    label: 'Urgent' },
  { id: 'high',      label: 'High' },
  { id: 'medium',    label: 'Medium' },
  { id: 'low',       label: 'Low' },
  { id: 'recurring', label: 'Recurring' },
]
const SORT_OPTS = [
  { id: 'position',        label: 'Custom order' },
  { id: 'priority',        label: 'Priority' },
  { id: 'deadline',        label: 'Deadline' },
  { id: 'created_at_asc',  label: 'Date created ↑' },
  { id: 'created_at_desc', label: 'Date created ↓' },
]

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

export default function BoardPage({ session }) {
  const [tasks, setTasks]               = useState([])
  const [allTags, setAllTags]           = useState([])
  const [activeFilter, setActiveFilter] = useState(() => localStorage.getItem('tracku_board_default') || 'all')
  const [sortBy, setSortBy]             = useState(() => localStorage.getItem('tracku_board_sort') || 'position')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [filterKey, setFilterKey]       = useState(0)
  const [sortOpen, setSortOpen]         = useState(false)
  const [filterOpen, setFilterOpen]     = useState(false)
  const [searchQuery, setSearchQuery]   = useState('')
  const [activeTask, setActiveTask]     = useState(null)
  const [dropIndicator, setDropIndicator] = useState(null)
  // { colId, beforeId? } — line above beforeId; or { colId, atEnd } — line at bottom
  const [addingToColumn, setAddingToColumn] = useState(null)
  const [editingTask, setEditingTask]   = useState(null)
  const [loading, setLoading]           = useState(true)
  const [ntfyTopic, setNtfyTopic]       = useState('')
  const [newTag, setNewTag]             = useState(null)
  const tasksRef       = useRef(tasks)
  const indicatorRef   = useRef(null)
  const newTagInputRef = useRef(null)

  const isTouchDevice = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  const sensors = useSensors(
    ...( isTouchDevice ? [] : [
      useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    ]),
  )

  const dropAnimation = {
    duration: 220,
    easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
    sideEffects: defaultDropAnimationSideEffects({
      styles: { active: { opacity: '0.3' } },
    }),
  }

  useEffect(() => { tasksRef.current = tasks }, [tasks])
  useEffect(() => { fetchTasks(); fetchTags(); fetchNtfyTopic() }, [])

  // Realtime sync — picks up changes made on other devices/sessions
  useEffect(() => {
    const channel = supabase
      .channel('tasks-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks', filter: `user_id=eq.${session.user.id}` }, async payload => {
        const { data } = await supabase
          .from('tasks')
          .select('*, task_tags(tags(id, name, color)), subtasks(id, is_done)')
          .eq('id', payload.new.id)
          .single()
        if (!data) return
        if (data.archived) {
          setTasks(prev => prev.filter(t => t.id !== data.id))
        } else {
          const [normalized] = normalizeTasks([data])
          setTasks(prev => prev.some(t => t.id === normalized.id)
            ? prev.map(t => t.id === normalized.id ? normalized : t)
            : [normalized, ...prev]
          )
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tasks', filter: `user_id=eq.${session.user.id}` }, payload => {
        setTasks(prev => prev.filter(t => t.id !== payload.old.id))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      setTasks(prev => {
        const hasActive = prev.some(t => t.isTimerActive)
        if (!hasActive) return prev
        return prev.map(t => t.isTimerActive ? { ...t, timeLoggedMs: computeTimeLogged(t) } : t)
      })
    }, 1_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!ntfyTopic) return
    async function checkDeadlines() {
      for (const task of getDeadlinePendingTasks(tasksRef.current)) {
        const diff = new Date(task.deadline).getTime() - Date.now()
        const totalMins = Math.ceil(diff / 60_000)
        const h = Math.floor(totalMins / 60)
        const m = totalMins % 60
        const timeStr = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`
        const ok = await sendNtfyNotification(ntfyTopic, diff <= 0 ? 'Deadline just passed.' : `Due in ${timeStr}.`, task.title)
        if (ok) {
          await supabase.from('tasks').update({ deadline_notified: true }).eq('id', task.id)
          setTasks(prev => prev.map(t => t.id === task.id ? { ...t, deadline_notified: true } : t))
        }
      }
      for (const task of getOverduePendingTasks(tasksRef.current)) {
        const ok = await sendNtfyNotification(ntfyTopic, `Overdue: ${task.title}`, 'This task is overdue — mark it done or reschedule.')
        if (ok) {
          await supabase.from('tasks').update({ deadline_overdue_notified: true }).eq('id', task.id)
          setTasks(prev => prev.map(t => t.id === task.id ? { ...t, deadline_overdue_notified: true } : t))
          markHourlyOverdueNotified(task.id)
        }
      }
      // Recurring reminders — query recurring_history to know what's done today
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
      const { data: histData } = await supabase
        .from('recurring_history')
        .select('task_id')
        .eq('user_id', session.user.id)
        .eq('was_completed', true)
        .gte('completed_at', todayStart.toISOString())
      const doneTodayIds = new Set((histData || []).map(h => h.task_id))
      const now = new Date()
      const nowMins = now.getHours() * 60 + now.getMinutes()
      for (const task of getRecurringNotifyTasks(tasksRef.current, doneTodayIds)) {
        const r = task.recurring_reminder_minutes
        const isOverdue = nowMins >= r
        let title, body
        if (isOverdue) {
          const overdueH = Math.floor((nowMins - r) / 60)
          title = overdueH < 1 ? `Overdue: ${task.title}` : `Still overdue (${overdueH}h): ${task.title}`
          body  = 'Mark this recurring task as done for today.'
        } else {
          const hoursUntil = Math.round((r - nowMins) / 60)
          const dueAt = `${String(Math.floor(r / 60)).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}`
          title = hoursUntil <= 1 ? `Due in ~1h: ${task.title}` : `Reminder in ${hoursUntil}h: ${task.title}`
          body  = `Scheduled for ${dueAt}`
        }
        const ok = await sendNtfyNotification(ntfyTopic, title, body)
        if (ok) markRecurringHourlyNotified(task.id, isOverdue)
      }
      pruneOverdueTimestamps(tasksRef.current)
      for (const task of getHourlyOverdueTasks(tasksRef.current)) {
        const overdueMs = Date.now() - new Date(task.deadline).getTime()
        const h = Math.floor(overdueMs / 3_600_000)
        const label = h >= 1 ? `${h}h overdue` : 'Just went overdue'
        const ok = await sendNtfyNotification(ntfyTopic, `Still overdue: ${task.title}`, `${label} — mark it done or reschedule.`)
        if (ok) markHourlyOverdueNotified(task.id)
      }
    }
    checkDeadlines()
    const id = setInterval(checkDeadlines, 60_000)
    return () => clearInterval(id)
  }, [ntfyTopic])

  async function fetchNtfyTopic() {
    const { data } = await supabase.from('user_settings').select('ntfy_topic').eq('user_id', session.user.id).maybeSingle()
    if (data?.ntfy_topic) setNtfyTopic(data.ntfy_topic)
  }

  async function fetchTasks() {
    const { data } = await supabase
      .from('tasks')
      .select('*, task_tags(tags(id, name, color)), subtasks(id, is_done)')
      .eq('user_id', session.user.id)
      .order('position', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
    setTasks(normalizeTasks((data ?? []).filter(t => t.archived !== true)))
    setLoading(false)
  }

  async function fetchTags() {
    const { data } = await supabase.from('tags').select('*')
      .order('position', { ascending: true, nullsFirst: false })
      .order('name')
    const tags = data || []
    setAllTags(tags)
    const saved = localStorage.getItem('tracku_board_default')
    if (saved && saved !== 'all' && !tags.find(t => t.id === saved)) {
      setActiveFilter('all')
      localStorage.setItem('tracku_board_default', 'all')
    }
  }

  async function handleTagsReorder(reordered) {
    setAllTags(reordered)
    await Promise.all(reordered.map((tag, i) =>
      supabase.from('tags').update({ position: (i + 1) * 100 }).eq('id', tag.id)
    ))
  }

  async function handleCreateTag() {
    const name = newTag?.name?.trim()
    if (!name) { setNewTag(null); return }
    const color = newTag.color || '#7C3AED'
    const { data } = await supabase.from('tags').insert({ name, color, user_id: session.user.id }).select().single()
    if (data) setAllTags(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    setNewTag(null)
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
    const { data } = await supabase.from('tasks').select('*, task_tags(tags(id, name, color)), subtasks(id, is_done)').eq('id', taskId).single()
    if (data) {
      const [normalized] = normalizeTasks([data])
      setTasks(prev => prev.map(t => t.id === normalized.id ? normalized : t))
    }
  }

  async function handleAddTask(status, title, tagIds = []) {
    // Include on_hold tasks when computing min position for the in_progress column
    const colTasks = status === 'in_progress'
      ? tasks.filter(t => t.status === 'in_progress' || t.status === 'on_hold')
      : tasks.filter(t => t.status === status)
    const minPos   = colTasks.length ? Math.min(...colTasks.map(t => t.position ?? 0)) : 0
    const position = minPos - 1000
    const timerUpdate = status === 'in_progress' ? { timer_started_at: new Date().toISOString() } : {}
    const { data } = await supabase
      .from('tasks')
      .insert({ user_id: session.user.id, title, status, position, ...timerUpdate })
      .select('*, task_tags(tags(id, name, color)), subtasks(id, is_done)')
      .single()
    if (!data) return
    if (tagIds.length > 0) {
      await supabase.from('task_tags').insert(tagIds.map(tag_id => ({ task_id: data.id, tag_id })))
      const { data: fresh } = await supabase.from('tasks').select('*, task_tags(tags(id, name, color)), subtasks(id, is_done)').eq('id', data.id).single()
      if (fresh) { setTasks(prev => [normalizeTasks([fresh])[0], ...prev]); return }
    }
    setTasks(prev => [normalizeTasks([data])[0], ...prev])
  }

  function handleFilterChange(id) {
    if (id === activeFilter) return
    setActiveFilter(id)
    setFilterKey(k => k + 1)
  }

  function handleSortChange(sort) {
    setSortBy(sort)
    localStorage.setItem('tracku_board_sort', sort)
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

  function sortTaskList(list) {
    if (sortBy === 'position') return [...list].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'priority':        return (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4)
        case 'deadline':
          if (!a.deadline && !b.deadline) return 0
          if (!a.deadline) return 1
          if (!b.deadline) return -1
          return new Date(a.deadline) - new Date(b.deadline)
        case 'created_at_asc':  return new Date(a.created_at) - new Date(b.created_at)
        case 'created_at_desc': return new Date(b.created_at) - new Date(a.created_at)
        default:                return 0
      }
    })
  }

  const filteredTasks = tasks.filter(t => {
    if (activeFilter !== 'all' && !t.tags?.some(tag => tag.id === activeFilter)) return false
    if (priorityFilter === 'recurring') { if (!t.is_recurring) return false }
    else if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return t.title.toLowerCase().includes(q) ||
        t.tags?.some(tag => tag.name.toLowerCase().includes(q)) ||
        t.notes?.toLowerCase().includes(q)
    }
    return true
  })

  const doneCutoff = new Date(Date.now() - 168 * 60 * 60 * 1000)

  const tasksByStatus = {
    not_started: sortTaskList(filteredTasks.filter(t => t.status === 'not_started')),
    in_progress: sortTaskList(filteredTasks.filter(t => t.status === 'in_progress' || t.status === 'on_hold')),
    done:        sortTaskList(filteredTasks.filter(t =>
      t.status === 'done' && t.updated_at && new Date(t.updated_at) >= doneCutoff
    )),
  }

  const visibleCount = tasksByStatus.not_started.length + tasksByStatus.in_progress.length + tasksByStatus.done.length

  function handleDragStart({ active }) {
    setActiveTask(tasks.find(t => t.id === active.id) ?? null)
  }

  function setIndicator(val) {
    setDropIndicator(val)
    indicatorRef.current = val
  }

  function handleDragOver({ active, over }) {
    if (!over) { setIndicator(null); return }

    const activeRect = active.rect.current.translated
    const overRect   = over.rect
    const activeMidY = activeRect ? activeRect.top + activeRect.height / 2 : null

    if (COLUMN_IDS.has(over.id)) {
      const colId = over.id
      const colTasks = tasks
        .filter(t => (colId === 'in_progress'
          ? (t.status === 'in_progress' || t.status === 'on_hold')
          : t.status === colId) && t.id !== active.id)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

      if (colTasks.length > 0 && activeMidY !== null && overRect) {
        const colMidY = overRect.top + overRect.height / 2
        if (activeMidY < colMidY) {
          setIndicator({ colId, beforeId: colTasks[0].id })
          return
        }
      }
      setIndicator({ colId, atEnd: true })
      return
    }

    const overTask = tasks.find(t => t.id === over.id)
    if (!overTask) return

    const colId = overTask.status === 'on_hold' ? 'in_progress' : overTask.status
    if (!activeRect || !overRect) return

    const before = activeMidY < (overRect.top + overRect.height / 2)
    if (before) {
      setIndicator({ colId, beforeId: over.id })
    } else {
      const col = tasks
        .filter(t => colId === 'in_progress'
          ? (t.status === 'in_progress' || t.status === 'on_hold')
          : t.status === colId)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      const next = col[col.findIndex(t => t.id === over.id) + 1]
      if (next && next.id !== active.id) {
        setIndicator({ colId, beforeId: next.id })
      } else {
        setIndicator({ colId, atEnd: true })
      }
    }
  }

  async function handleDragEnd({ active, over }) {
    const indicator = indicatorRef.current   // ref always has latest value
    setActiveTask(null)
    setIndicator(null)
    if (!over || active.id === over.id) return

    const dragged = tasks.find(t => t.id === active.id)
    if (!dragged) return

    const overIsColumn  = COLUMN_IDS.has(over.id)
    const normStatus    = s => s === 'on_hold' ? 'in_progress' : s
    const draggedColId  = normStatus(dragged.status)
    const targetColId   = indicator?.colId ?? (overIsColumn
      ? over.id
      : normStatus(tasks.find(t => t.id === over.id)?.status ?? dragged.status))
    const isCrossColumn = draggedColId !== targetColId

    // Tasks in a column sorted by position, excluding the dragged task
    const colTasksExcl = colId => tasks
      .filter(t => (colId === 'in_progress'
        ? (t.status === 'in_progress' || t.status === 'on_hold')
        : t.status === colId) && t.id !== active.id)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

    // Derive new position from indicator
    const computePos = colTasks => {
      if (indicator?.beforeId) {
        const idx = colTasks.findIndex(t => t.id === indicator.beforeId)
        if (idx === 0) return (colTasks[0].position ?? 0) - 1000
        if (idx > 0) {
          const a = colTasks[idx - 1].position ?? (idx * 1000)
          const b = colTasks[idx].position     ?? ((idx + 1) * 1000)
          return Math.round((a + b) / 2)
        }
      }
      return (colTasks[colTasks.length - 1]?.position ?? 0) + 1000
    }

    if (isCrossColumn) {
      const now           = new Date()
      const targetColTasks = colTasksExcl(targetColId)
      const newPosition    = computePos(targetColTasks)

      let optimistic = {
        status: targetColId, position: newPosition,
        timer_started_at: dragged.timer_started_at,
        time_spent_seconds: dragged.time_spent_seconds || 0,
      }
      if (targetColId === 'in_progress') {
        optimistic.timer_started_at = now.toISOString()
        optimistic.isTimerActive    = true
        optimistic.timeLoggedMs     = (dragged.time_spent_seconds || 0) * 1000
      } else if (dragged.status === 'in_progress' && dragged.timer_started_at) {
        const secs = Math.max(0, Math.floor((now - new Date(dragged.timer_started_at)) / 1000))
        optimistic.time_spent_seconds = (dragged.time_spent_seconds || 0) + secs
        optimistic.timer_started_at   = null
        optimistic.isTimerActive      = false
        optimistic.timeLoggedMs       = optimistic.time_spent_seconds * 1000
      }

      const updated = { ...dragged, ...optimistic }
      setTasks(prev => {
        const rest = prev.filter(t => t.id !== active.id)
        if (indicator?.beforeId) {
          const idx = rest.findIndex(t => t.id === indicator.beforeId)
          if (idx >= 0) return [...rest.slice(0, idx), updated, ...rest.slice(idx)]
        }
        return [...rest, updated]
      })

      const dbUpdates = { status: targetColId, position: newPosition }
      if (targetColId === 'in_progress') {
        dbUpdates.timer_started_at = optimistic.timer_started_at
      } else if (dragged.status === 'in_progress' && dragged.timer_started_at) {
        dbUpdates.timer_started_at   = null
        dbUpdates.time_spent_seconds = optimistic.time_spent_seconds
        supabase.from('time_logs').insert({
          task_id: dragged.id, user_id: dragged.user_id,
          started_at: dragged.timer_started_at, ended_at: now.toISOString(),
          duration_seconds: optimistic.time_spent_seconds - (dragged.time_spent_seconds || 0),
        })
      }
      await supabase.from('tasks').update(dbUpdates).eq('id', active.id)
      return
    }

    // Same-column reorder — runs whether over is a task or the column droppable area
    if (!isCrossColumn) {
      const fullCol = [...(targetColId === 'in_progress'
        ? tasks.filter(t => t.status === 'in_progress' || t.status === 'on_hold')
        : tasks.filter(t => t.status === targetColId))
      ].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

      const oldIdx = fullCol.findIndex(t => t.id === active.id)
      let newIdx   = fullCol.length - 1
      if (indicator?.beforeId) {
        const rawIdx = fullCol.findIndex(t => t.id === indicator.beforeId)
        if (rawIdx !== -1) newIdx = oldIdx < rawIdx ? rawIdx - 1 : rawIdx
      }

      if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
        const reordered    = arrayMove(fullCol, oldIdx, newIdx)
        const posUpdates   = reordered.map((t, i) => ({ id: t.id, position: (i + 1) * 1000 }))
        const withNewPos   = reordered.map((t, i) => ({ ...t, position: (i + 1) * 1000 }))

        // Apply positions immediately — no second setState needed
        setTasks(prev => [
          ...(targetColId === 'in_progress'
            ? prev.filter(t => t.status !== 'in_progress' && t.status !== 'on_hold')
            : prev.filter(t => t.status !== targetColId)),
          ...withNewPos,
        ])

        await Promise.all(posUpdates.map(({ id, position }) =>
          supabase.from('tasks').update({ position }).eq('id', id)
        ))
      }
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full text-sm text-gray-400">Loading…</div>
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <div className="flex items-center gap-2.5">
          <h1 className="text-sm font-semibold text-gray-900 dark:text-white">Board</h1>
          <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full font-medium">
            {visibleCount} {visibleCount === 1 ? 'task' : 'tasks'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">⌕</span>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search…"
              className="pl-7 pr-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:border-purple-400 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 w-36 transition-all focus:w-48"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">✕</button>
            )}
          </div>
          <button
            onClick={() => setAddingToColumn('not_started')}
            className="text-xs px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-medium transition-all active:scale-95 shadow-sm hover:shadow-md whitespace-nowrap"
          >+ New task</button>
        </div>
      </div>

      {/* Tag strip + Sort/Filter buttons */}
      <div className="flex items-center border-b border-gray-100 dark:border-gray-800 shrink-0">
        {/* Tags — scrollable */}
        <div className="flex items-center flex-1 overflow-x-auto min-w-0" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <div className="flex items-center px-6 min-w-max">
            {/* All button — not sortable */}
            <button
              onClick={() => handleFilterChange('all')}
              className={clsx(
                'px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 -mb-px transition-all duration-200',
                activeFilter === 'all'
                  ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
              )}
            >All</button>

            {/* Sortable tags */}
            <SortableTagStrip
              tags={allTags}
              activeFilter={activeFilter}
              onFilterChange={handleFilterChange}
              onTagsReorder={handleTagsReorder}
              newTag={newTag}
              setNewTag={setNewTag}
              onCreateTag={handleCreateTag}
              newTagInputRef={newTagInputRef}
            />
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
                sortBy !== 'position'
                  ? 'border-purple-200 text-purple-600 bg-purple-50 dark:border-purple-800 dark:text-purple-400 dark:bg-purple-900/20'
                  : 'border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400 hover:border-gray-300 hover:text-gray-600 dark:hover:border-gray-600 dark:hover:text-gray-300',
              )}
            >
              <svg className="shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="3" x2="8" y2="21" />
                <polyline points="3 8 8 3 13 8" />
                <line x1="16" y1="21" x2="16" y2="3" />
                <polyline points="21 16 16 21 11 16" />
              </svg>
              <span className="hidden md:inline">Sort{sortBy !== 'position' ? ` · ${SORT_OPTS.find(o => o.id === sortBy)?.label}` : ''}</span>
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
                priorityFilter !== 'all'
                  ? 'border-purple-200 text-purple-600 bg-purple-50 dark:border-purple-800 dark:text-purple-400 dark:bg-purple-900/20'
                  : 'border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400 hover:border-gray-300 hover:text-gray-600 dark:hover:border-gray-600 dark:hover:text-gray-300',
              )}
            >
              <svg className="shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 4h18l-7 8.5V20l-4-2v-5.5L3 4z" />
              </svg>
              <span className="hidden md:inline">Filter{priorityFilter !== 'all' ? ` · ${FILTER_OPTS.find(o => o.id === priorityFilter)?.label}` : ''}</span>
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

      {/* Kanban columns */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => { setActiveTask(null); setIndicator(null) }}
      >
        <div
          key={filterKey}
          className="flex flex-1 overflow-x-auto animate-fade-up snap-x snap-mandatory md:snap-none md:gap-5 md:px-6 md:py-5"
          style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
        >
          {COLUMNS.map(col => (
            <div
              key={col.id}
              className="w-screen shrink-0 snap-start overflow-y-auto px-4 py-4 h-full md:w-auto md:h-auto md:shrink md:snap-align-none md:overflow-visible md:p-0"
            >
              <KanbanColumn
                id={col.id}
                label={col.label}
                tasks={tasksByStatus[col.id]}
                onAddTask={handleAddTask}
                onCardClick={setEditingTask}
                onHold={handleToggleHold}
                isAdding={addingToColumn === col.id}
                onStartAdding={() => setAddingToColumn(col.id)}
                onStopAdding={() => setAddingToColumn(null)}
                allTags={allTags}
                activeFilterTagId={activeFilter}
                dropIndicator={dropIndicator?.colId === col.id ? dropIndicator : null}
              />
            </div>
          ))}
        </div>
        <DragOverlay dropAnimation={dropAnimation}>
          {activeTask ? <TaskCardDisplay task={activeTask} isOverlay /> : null}
        </DragOverlay>
      </DndContext>

      {editingTask && (
        <TaskModal
          task={editingTask}
          allTags={allTags}
          onClose={handleModalClose}
          onTaskUpdate={handleTaskUpdate}
          onArchive={(taskId) => { setTasks(prev => prev.filter(t => t.id !== taskId)); setEditingTask(null) }}
        />
      )}
    </div>
  )
}
