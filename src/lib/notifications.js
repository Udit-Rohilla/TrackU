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
