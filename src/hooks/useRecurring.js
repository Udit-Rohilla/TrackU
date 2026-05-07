import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return s[(v - 20) % 10] || s[v] || s[0]
}

function normalizeRecurring(data = []) {
  const seen = new Set()
  return data
    .filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true })
    .map(task => ({
      ...task,
      tags: (task.task_tags || []).map(tt => tt.tags).filter(Boolean),
    }))
}

export function getNextDueDate(task) {
  const { recurrence_type, recurrence_config, last_completed_at, created_at } = task
  const base = new Date(last_completed_at || created_at)
  const toDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate())

  switch (recurrence_type) {
    case 'daily': {
      const next = new Date(base)
      next.setDate(next.getDate() + 1)
      return toDay(next)
    }
    case 'weekly': {
      const days = recurrence_config?.days || []
      if (!days.length) return toDay(base)
      const cursor = new Date(base)
      cursor.setDate(cursor.getDate() + 1)
      for (let i = 0; i < 7; i++) {
        if (days.includes(cursor.getDay())) return toDay(cursor)
        cursor.setDate(cursor.getDate() + 1)
      }
      return toDay(cursor)
    }
    case 'monthly': {
      const day = recurrence_config?.day || 1
      const next = new Date(base)
      next.setMonth(next.getMonth() + 1)
      next.setDate(day)
      return toDay(next)
    }
    case 'yearly': {
      const month = (recurrence_config?.month || 1) - 1
      const day = recurrence_config?.day || 1
      const next = new Date(base)
      next.setFullYear(next.getFullYear() + 1)
      next.setMonth(month)
      next.setDate(day)
      return toDay(next)
    }
    default:
      return toDay(base)
  }
}

export function getDueStatus(task) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  if (task.last_completed_at) {
    const d = new Date(task.last_completed_at)
    if (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() === today.getTime()) {
      return 'done_today'
    }
  }

  const nextDue = getNextDueDate(task)
  if (nextDue < today) return 'overdue'
  if (nextDue.getTime() === today.getTime()) return 'due_today'
  if (nextDue.getTime() === tomorrow.getTime()) return 'due_tomorrow'
  return 'upcoming'
}

export function getScheduleLabel(task) {
  switch (task.recurrence_type) {
    case 'daily': return 'Every day'
    case 'weekly': {
      const days = (task.recurrence_config?.days || []).sort((a, b) => a - b)
      if (!days.length) return 'Every week'
      return 'Every ' + days.map(d => WEEKDAY_NAMES[d]).join(', ')
    }
    case 'monthly': {
      const day = task.recurrence_config?.day
      if (!day) return 'Every month'
      return `${day}${ordinal(day)} each month`
    }
    case 'yearly': {
      const month = task.recurrence_config?.month
      const day = task.recurrence_config?.day
      if (!month || !day) return 'Every year'
      return `${MONTH_NAMES[month - 1]} ${day} each year`
    }
    default: return ''
  }
}

export function useRecurring(session) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchTasks() }, [])

  async function fetchTasks() {
    const { data } = await supabase
      .from('tasks')
      .select('*, task_tags(tags(id, name, color)), subtasks(id, is_done)')
      .eq('user_id', session.user.id)
      .eq('is_recurring', true)
      .order('created_at', { ascending: true })

    const normalized = normalizeRecurring((data || []).filter(t => t.archived !== true))
    setTasks(normalized)
    setLoading(false)
    resetOverdueStreaks(normalized)
  }

  async function resetOverdueStreaks(taskList) {
    const toReset = taskList.filter(t => t.streak_count > 0 && getDueStatus(t) === 'overdue')
    if (!toReset.length) return
    for (const task of toReset) {
      await supabase.from('tasks').update({ streak_count: 0 }).eq('id', task.id)
    }
    const ids = new Set(toReset.map(t => t.id))
    setTasks(prev => prev.map(t => ids.has(t.id) ? { ...t, streak_count: 0 } : t))
  }

  async function markDone(taskId, note = '') {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const nextDue = getNextDueDate(task)
    const onTime = !nextDue || today <= nextDue
    const newStreak = onTime ? (task.streak_count || 0) + 1 : 1

    supabase.from('recurring_history').insert({
      task_id: task.id,
      user_id: task.user_id,
      due_at: nextDue?.toISOString() || now.toISOString(),
      completed_at: now.toISOString(),
      was_completed: true,
      note: note || null,
    })

    const updates = {
      last_completed_at: now.toISOString(),
      last_completion_note: note || null,
      streak_count: newStreak,
      status: 'not_started',
    }
    await supabase.from('tasks').update(updates).eq('id', taskId)
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t))
  }

  function handleTaskUpdate(updatedRaw) {
    const [normalized] = normalizeRecurring([updatedRaw])
    if (!normalized.is_recurring) {
      setTasks(prev => prev.filter(t => t.id !== normalized.id))
    } else {
      setTasks(prev => prev.map(t => t.id === normalized.id ? { ...t, ...normalized } : t))
    }
  }

  async function addTask(recurrenceType, title) {
    const { data } = await supabase
      .from('tasks')
      .insert({
        user_id: session.user.id,
        title,
        status: 'not_started',
        is_recurring: true,
        recurrence_type: recurrenceType,
      })
      .select('*, task_tags(tags(id, name, color)), subtasks(id, is_done)')
      .single()
    if (data) {
      const [normalized] = normalizeRecurring([data])
      setTasks(prev => [...prev, normalized])
    }
  }

  function handleArchive(taskId) {
    setTasks(prev => prev.filter(t => t.id !== taskId))
  }

  return { tasks, loading, markDone, addTask, handleTaskUpdate, handleArchive }
}
