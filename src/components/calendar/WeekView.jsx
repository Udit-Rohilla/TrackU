import { format, startOfDay, isSameDay } from 'date-fns'
import clsx from 'clsx'
import { getDayData } from '../../hooks/useCalendarData'

// Left-border accent + subtle background per task type
const TYPE_STYLE = {
  overdue:   { border: 'border-l-red-400',    bg: 'bg-red-50/70 dark:bg-red-900/10',       label: 'Overdue',   labelCls: 'text-red-500 dark:text-red-400' },
  deadline:  { border: 'border-l-purple-400', bg: 'bg-purple-50/60 dark:bg-purple-900/10', label: 'Due',       labelCls: 'text-purple-500 dark:text-purple-400' },
  recurring: { border: 'border-l-amber-400',  bg: 'bg-amber-50/60 dark:bg-amber-900/10',   label: 'Recurring', labelCls: 'text-amber-500 dark:text-amber-400' },
  completed: { border: 'border-l-green-400',  bg: 'bg-gray-50/80 dark:bg-gray-800/30',     label: 'Done',      labelCls: 'text-green-500 dark:text-green-400' },
}

const PRIORITY_LABEL = { urgent: 'Urgent', high: 'High', medium: 'Med', low: 'Low' }
const PRIORITY_CLS = {
  urgent: 'text-red-500 dark:text-red-400',
  high:   'text-orange-500 dark:text-orange-400',
  medium: 'text-blue-500 dark:text-blue-400',
  low:    'text-gray-400 dark:text-gray-500',
}

function WeekTaskCard({ task, type, onClick }) {
  const s      = TYPE_STYLE[type]
  const isDone = type === 'completed'
  const isInProgress = task.status === 'in_progress' || task.status === 'on_hold'

  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full text-left rounded-lg border-l-2 pl-2.5 pr-2 py-2 transition-all',
        'hover:brightness-95 active:scale-[0.98]',
        s.border, s.bg,
        isDone && 'opacity-80',
        !isDone && 'hover:shadow-sm',
      )}
    >
      {/* Title */}
      <p className={clsx(
        'text-xs font-semibold leading-snug break-words',
        isDone ? 'text-green-600 dark:text-green-400' : 'text-gray-800 dark:text-gray-100',
      )}>
        {isDone && <span className="mr-0.5">✓</span>}{task.title}
      </p>

      {/* Meta row */}
      <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-1">
        <span className={clsx('text-[10px] font-medium', s.labelCls)}>{s.label}</span>

        {task.priority && !isDone && (
          <span className={clsx('text-[10px] font-medium', PRIORITY_CLS[task.priority])}>
            · {PRIORITY_LABEL[task.priority]}
          </span>
        )}

        {isInProgress && !isDone && (
          <span className="text-[10px] font-medium text-amber-500 dark:text-amber-400">· Active</span>
        )}

        {task.deadline && !isDone && (
          <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
            · {format(new Date(task.deadline), 'h:mm a')}
          </span>
        )}

        {type === 'recurring' && !task.deadline && (
          <span className="text-[10px] text-gray-400 dark:text-gray-500">↺</span>
        )}
      </div>

      {/* Subtask progress */}
      {!isDone && task.subtaskCount > 0 && (
        <div className="flex items-center gap-1.5 mt-1.5">
          <div className="flex-1 h-0.5 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full rounded-full bg-purple-400"
              style={{ width: `${(task.subtaskDoneCount / task.subtaskCount) * 100}%` }}
            />
          </div>
          <span className="text-[9px] text-gray-400 dark:text-gray-500 tabular-nums shrink-0">
            {task.subtaskDoneCount}/{task.subtaskCount}
          </span>
        </div>
      )}
    </button>
  )
}

function getWeekDays(date) {
  const start = new Date(date)
  start.setDate(start.getDate() - start.getDay())
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return startOfDay(d)
  })
}

export default function WeekView({ currentDate, tasks, onTaskClick }) {
  const days  = getWeekDays(currentDate)
  const today = startOfDay(new Date())

  return (
    <div className="flex flex-1 overflow-hidden">
      {days.map(day => {
        const { completed, deadlines, overdue, recurring } = getDayData(day, tasks)
        const isToday   = isSameDay(day, today)
        const taskCount = overdue.length + deadlines.length + recurring.length + completed.length

        return (
          <div
            key={day.toISOString()}
            className="flex-1 border-r border-gray-100 dark:border-gray-800 flex flex-col min-w-0 last:border-r-0"
          >
            {/* Day header */}
            <div className={clsx(
              'shrink-0 text-center pt-3 pb-2.5 px-1 relative',
              isToday
                ? 'border-b-2 border-purple-500 bg-purple-50 dark:bg-purple-950/30'
                : 'border-b border-gray-100 dark:border-gray-800',
            )}>
              <div className={clsx(
                'text-[10px] font-semibold uppercase tracking-widest mb-0.5',
                isToday ? 'text-purple-500 dark:text-purple-400' : 'text-gray-400 dark:text-gray-500',
              )}>
                {format(day, 'EEE')}
              </div>
              <div className={clsx(
                'inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold',
                isToday ? 'bg-purple-600 text-white' : 'text-gray-700 dark:text-gray-300',
              )}>
                {format(day, 'd')}
              </div>
              {/* Task count badge */}
              {taskCount > 0 && (
                <span className={clsx(
                  'absolute top-2 right-1.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center tabular-nums',
                  isToday
                    ? 'bg-purple-200 dark:bg-purple-800/60 text-purple-700 dark:text-purple-300'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
                )}>
                  {taskCount}
                </span>
              )}
            </div>

            {/* Task cards */}
            <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5">
              {overdue.map(t => (
                <WeekTaskCard key={t.id} task={t} type="overdue" onClick={() => onTaskClick(t)} />
              ))}
              {deadlines.map(t => (
                <WeekTaskCard key={t.id} task={t} type="deadline" onClick={() => onTaskClick(t)} />
              ))}
              {recurring.map(t => (
                <WeekTaskCard key={t.id} task={t} type="recurring" onClick={() => onTaskClick(t)} />
              ))}
              {completed.map(t => (
                <WeekTaskCard key={t.id} task={t} type="completed" onClick={() => onTaskClick(t)} />
              ))}

              {taskCount === 0 && (
                <div className="flex items-center justify-center h-full min-h-[60px]">
                  <span className="text-gray-200 dark:text-gray-800 text-lg select-none">·</span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
