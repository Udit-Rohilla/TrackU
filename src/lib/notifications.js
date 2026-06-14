// Inline copy of isRecurringOnDate from useCalendarData.js
function isRecurringOnDate(task, date) {
  const { recurrence_type, recurrence_config } = task
  switch (recurrence_type) {
    case 'daily':   return true
    case 'weekly':  return (recurrence_config?.days || []).includes(date.getDay())
    case 'monthly': return recurrence_config?.day === date.getDate()
    case 'yearly':  return recurrence_config?.month === date.getMonth() + 1 && recurrence_config?.day === date.getDate()
    default: return false
  }
}

export async function sendNtfyNotification(topic, title, body) {
  if (!topic) return false
  try {
    const res = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: 'POST',
      headers: { Title: title, 'Content-Type': 'text/plain' },
      body,
    })
    return res.ok
  } catch {
    return false
  }
}

// Tasks needing a "due soon" warning (≤2h away, not yet warned)
// Recurring tasks are excluded — they use their own reminder system.
export function getDeadlinePendingTasks(tasks) {
  const now = Date.now()
  const twoHoursMs = 2 * 60 * 60 * 1000
  return tasks.filter(t =>
    !t.is_recurring &&
    t.status !== 'done' &&
    t.deadline &&
    !t.deadline_notified &&
    (new Date(t.deadline).getTime() - now) <= twoHoursMs
  )
}

// Tasks needing a "due now / overdue" alert (past deadline, not yet alerted)
// Recurring tasks are excluded — they use their own reminder system.
export function getOverduePendingTasks(tasks) {
  const now = Date.now()
  return tasks.filter(t =>
    !t.is_recurring &&
    t.status !== 'done' &&
    t.deadline &&
    !t.deadline_overdue_notified &&
    new Date(t.deadline).getTime() <= now
  )
}

const LS_KEY = 'tracku_overdue_notified'
const HOUR_MS = 60 * 60 * 1000

const MAX_HOURLY = 10

function loadOverdueTimestamps() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') } catch { return {} }
}

function saveOverdueTimestamps(map) {
  localStorage.setItem(LS_KEY, JSON.stringify(map))
}

// Tasks already first-notified that need an hourly follow-up (max 10 times)
export function getHourlyOverdueTasks(tasks) {
  const now = Date.now()
  const map = loadOverdueTimestamps()
  return tasks.filter(t => {
    if (t.is_recurring || t.status === 'done' || !t.deadline || !t.deadline_overdue_notified) return false
    if (new Date(t.deadline).getTime() > now) return false
    const entry = map[t.id]
    if (!entry) return false
    if (entry.count >= MAX_HOURLY) return false
    return now - entry.last >= HOUR_MS
  })
}

export function markHourlyOverdueNotified(taskId) {
  const map = loadOverdueTimestamps()
  const prev = map[taskId]
  map[taskId] = { last: Date.now(), count: prev ? prev.count + 1 : 1 }
  saveOverdueTimestamps(map)
}

// ── Recurring task reminders ─────────────────────────────────────────────────
// Reminder time stored as recurring_reminder_minutes (integer, minutes since midnight).
// Pre-reminders: every hour from (reminderMins - 180) until reminder time.
// Post-overdue: every hour after reminder time, max 10, until done today.
// Tracked per epoch-hour in localStorage — auto-resets each new day.

const REC_KEY = 'tracku_recurring_hourly'
const MAX_RECURRING_OVERDUE = 10

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function loadRecurringHourly() {
  try { return JSON.parse(localStorage.getItem(REC_KEY) || '{}') } catch { return {} }
}

function saveRecurringHourly(map) {
  localStorage.setItem(REC_KEY, JSON.stringify(map))
}

// doneTodayIds: Set of task_ids completed via recurring_history today.
export function getRecurringNotifyTasks(tasks, doneTodayIds = new Set()) {
  const now = new Date()
  const today = localDateStr(now)
  const nowMins = now.getHours() * 60 + now.getMinutes()
  const epochHour = Math.floor(Date.now() / 3_600_000)
  const map = loadRecurringHourly()

  return tasks.filter(t => {
    if (!t.is_recurring || t.recurring_reminder_minutes == null) return false
    if (!isRecurringOnDate(t, now)) return false

    const reminderMins = t.recurring_reminder_minutes

    // Not yet in the 3h pre-reminder window
    if (nowMins < reminderMins - 180) return false

    const entry    = map[t.id]
    const isToday  = entry?.date === today
    const notified = isToday ? (entry.notifiedHours || []) : []
    const overdueCt = isToday ? (entry.overdueCount || 0) : 0

    // Already sent something this epoch-hour for this task
    if (notified.includes(epochHour)) return false

    if (nowMins >= reminderMins) {
      if (doneTodayIds.has(t.id)) return false          // completed today
      if (overdueCt >= MAX_RECURRING_OVERDUE) return false
    }

    return true
  })
}

export function markRecurringHourlyNotified(taskId, isOverdue) {
  const today = localDateStr(new Date())
  const epochHour = Math.floor(Date.now() / 3_600_000)
  const map = loadRecurringHourly()

  const entry    = map[taskId]
  const isToday  = entry?.date === today
  const notified = [...(isToday ? entry.notifiedHours || [] : []), epochHour]
  const overdueCt = (isToday ? entry.overdueCount || 0 : 0) + (isOverdue ? 1 : 0)

  // Prune stale days while updating
  const pruned = {}
  for (const [id, e] of Object.entries(map)) {
    if (e.date === today) pruned[id] = e
  }
  pruned[taskId] = { date: today, notifiedHours: notified, overdueCount: overdueCt }
  saveRecurringHourly(pruned)
}

// ─────────────────────────────────────────────────────────────────────────────

// Clean up entries for tasks that are no longer overdue / are done
export function pruneOverdueTimestamps(tasks) {
  const map = loadOverdueTimestamps()
  const activeIds = new Set(
    tasks
      .filter(t => t.status !== 'done' && t.deadline && new Date(t.deadline).getTime() <= Date.now())
      .map(t => t.id)
  )
  let changed = false
  for (const id of Object.keys(map)) {
    if (!activeIds.has(id)) { delete map[id]; changed = true }
  }
  if (changed) saveOverdueTimestamps(map)
}
