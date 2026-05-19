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
export function getDeadlinePendingTasks(tasks) {
  const now = Date.now()
  const twoHoursMs = 2 * 60 * 60 * 1000
  return tasks.filter(t =>
    t.status !== 'done' &&
    t.deadline &&
    !t.deadline_notified &&
    (new Date(t.deadline).getTime() - now) <= twoHoursMs
  )
}

// Tasks needing a "due now / overdue" alert (past deadline, not yet alerted)
export function getOverduePendingTasks(tasks) {
  const now = Date.now()
  return tasks.filter(t =>
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
    if (t.status === 'done' || !t.deadline || !t.deadline_overdue_notified) return false
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
