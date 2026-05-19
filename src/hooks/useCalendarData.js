import { useState, useEffect } from 'react'
import { format, startOfDay } from 'date-fns'
import { supabase } from '../lib/supabase'
import { computeTimeLogged } from '../lib/time'

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

export function isRecurringOnDate(task, date) {
  const { recurrence_type, recurrence_config } = task
  switch (recurrence_type) {
    case 'daily':   return true
    case 'weekly':  return (recurrence_config?.days || []).includes(date.getDay())
    case 'monthly': return recurrence_config?.day === date.getDate()
    case 'yearly': {
      return recurrence_config?.month === date.getMonth() + 1 &&
             recurrence_config?.day   === date.getDate()
    }
    default: return false
  }
}

export function getDayData(date, tasks) {
  const dateStr = format(date, 'yyyy-MM-dd')
  const today   = startOfDay(new Date())
  const isPast  = startOfDay(date) < today

  // Regular done tasks (non-recurring, or recurring manually set to done)
  const recentDone = tasks.filter(t =>
    !t._isHistory &&
    t.status === 'done' &&
    t.updated_at &&
    format(new Date(t.updated_at), 'yyyy-MM-dd') === dateStr
  )

  // Virtual history entries synthesized from recurring_history table
  const historyDone = tasks.filter(t =>
    t._isHistory &&
    t.updated_at &&
    format(new Date(t.updated_at), 'yyyy-MM-dd') === dateStr
  )

  const completed = [...recentDone, ...historyDone]

  // Track real task IDs that already have a history completion on this date
  // so they don't also show up in the recurring (scheduled) slot
  const historyTaskIds = new Set(historyDone.map(t => t._sourceTaskId).filter(Boolean))

  const deadlines = tasks.filter(t =>
    !t._isHistory && !t.archived && t.status !== 'done' &&
    t.deadline &&
    format(new Date(t.deadline), 'yyyy-MM-dd') === dateStr &&
    !isPast
  )

  const overdue = tasks.filter(t =>
    !t._isHistory && !t.archived && t.status !== 'done' &&
    t.deadline &&
    format(new Date(t.deadline), 'yyyy-MM-dd') === dateStr &&
    isPast
  )

  const excludeIds = new Set([
    ...completed.map(t => t.id),
    ...deadlines.map(t => t.id),
    ...overdue.map(t => t.id),
  ])

  const recurring = tasks.filter(t =>
    !t._isHistory &&
    t.is_recurring && !t.archived &&
    !excludeIds.has(t.id) &&
    !historyTaskIds.has(t.id) &&
    isRecurringOnDate(t, date)
  )

  return { completed, deadlines, overdue, recurring }
}

export function useCalendarData(session) {
  const [tasks, setTasks]     = useState([])
  const [allTags, setAllTags] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const [{ data: taskData }, { data: tagData }, { data: histData }] = await Promise.all([
      supabase
        .from('tasks')
        .select('*, task_tags(tags(id, name, color)), subtasks(id, is_done)')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: true }),
      supabase.from('tags').select('*').order('name'),
      supabase
        .from('recurring_history')
        .select('*, tasks(id, title, is_recurring, recurrence_type, recurrence_config, archived)')
        .eq('user_id', session.user.id)
        .eq('was_completed', true)
        .order('completed_at', { ascending: false }),
    ])

    const normalizedTasks = normalizeTasks(taskData || [])

    // Synthesize a virtual "done" task for every recurring_history completion.
    // These carry _isHistory=true so getDayData can distinguish them from real tasks,
    // and _sourceTaskId so the parent task isn't also shown as "scheduled" on the same day.
    const historyVirtual = (histData || []).map(h => ({
      id:            `hist_${h.id}`,
      title:         h.tasks?.title || 'Recurring task',
      status:        'done',
      updated_at:    h.completed_at,
      is_recurring:  true,
      archived:      false,
      tags:          [],
      deadline:      null,
      _isHistory:    true,
      _sourceTaskId: h.task_id,
    }))

    setTasks([...normalizedTasks, ...historyVirtual])
    setAllTags(tagData || [])
    setLoading(false)
  }

  function handleTaskUpdate(updatedRaw) {
    const [normalized] = normalizeTasks([updatedRaw])
    // Only update real tasks; leave virtual history entries untouched
    setTasks(prev => prev.map(t =>
      !t._isHistory && t.id === normalized.id ? { ...t, ...normalized } : t
    ))
  }

  return { tasks, allTags, loading, handleTaskUpdate }
}
