export function computeTimeLogged(task) {
  let ms = (task.time_spent_seconds || 0) * 1000
  if (task.timer_started_at) ms += Date.now() - new Date(task.timer_started_at).getTime()
  return ms
}
