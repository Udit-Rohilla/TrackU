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

  const cutoff = new Date(Date.now() - 168 * 60 * 60 * 1000)
  const completed = tasks.filter(t =>
    t.status === 'done' &&
    t.updated_at &&
    format(new Date(t.updated_at), 'yyyy-MM-dd') === dateStr &&
    new Date(t.updated_at) >= cutoff
  )

  const deadlines = tasks.filter(t =>
    !t.archived && t.status !== 'done' &&
    t.deadline &&
    format(new Date(t.deadline), 'yyyy-MM-dd') === dateStr &&
    !isPast
  )

  const overdue = tasks.filter(t =>
    !t.archived && t.status !== 'done' &&
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
    t.is_recurring && !t.archived &&
    !excludeIds.has(t.id) &&
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
    const [{ data: taskData }, { data: tagData }] = await Promise.all([
      supabase
        .from('tasks')
        .select('*, task_tags(tags(id, name, color)), subtasks(id, is_done)')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: true }),
      supabase.from('tags').select('*').order('name'),
    ])
    setTasks(normalizeTasks(taskData || []))
    setAllTags(tagData || [])
    setLoading(false)
  }

  function handleTaskUpdate(updatedRaw) {
    const [normalized] = normalizeTasks([updatedRaw])
    setTasks(prev => prev.map(t => t.id === normalized.id ? { ...t, ...normalized } : t))
  }

  return { tasks, allTags, loading, handleTaskUpdate }
}
