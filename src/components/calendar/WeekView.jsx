import { format, startOfDay, isSameDay } from 'date-fns'
import clsx from 'clsx'
import { getDayData } from '../../hooks/useCalendarData'

const TYPE_CONFIG = {
  completed: { label: 'Done',      badgeCls: 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400' },
  overdue:   { label: 'Overdue',   badgeCls: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400' },
  deadline:  { label: 'Due',       badgeCls: 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' },
  recurring: { label: 'Recurring', badgeCls: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' },
}

const PRIORITY_BADGE = {
  urgent: 'bg-red-50 text-red-500 dark:bg-red-900/20 dark:text-red-400',
  high:   'bg-orange-50 text-orange-500 dark:bg-orange-900/20 dark:text-orange-400',
  medium: 'bg-blue-50 text-blue-500 dark:bg-blue-900/20 dark:text-blue-400',
  low:    'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500',
}

function WeekTaskCard({ task, type, onClick }) {
  const cfg    = TYPE_CONFIG[type]
  const isDone = type === 'completed'
  const isActive = task.status === 'in_progress'

  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full text-left rounded-lg px-2.5 py-2 transition-all border',
        isDone
          ? 'bg-gray-50/80 dark:bg-gray-800/30 border-gray-100 dark:border-gray-700/50 opacity-70'
          : isActive
            ? 'bg-purple-600 border-purple-500 shadow-sm'
            : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md hover:-translate-y-px',
      )}
    >
      {/* Type + priority badge row */}
      <div className="flex items-center gap-1 mb-1.5 flex-wrap">
        <span className={clsx(
          'text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded',
          isActive ? 'bg-white/20 text-white' : cfg.badgeCls,
        )}>
          {cfg.label}
        </span>
        {task.priority && !isDone && (
          <span className={clsx(
            'text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded',
            isActive ? 'bg-white/20 text-white' : PRIORITY_BADGE[task.priority],
          )}>
            {task.priority === 'urgent' ? 'Urgent' :
             task.priority === 'high'   ? 'High'   :
             task.priority === 'medium' ? 'Med'    : 'Low'}
          </span>
        )}
      </div>

      {/* Title */}
      <p className={clsx(
        'text-[11px] font-semibold leading-snug break-words',
        isDone
          ? 'line-through text-gray-400 dark:text-gray-500'
          : isActive
            ? 'text-white'
            : 'text-gray-800 dark:text-gray-200',
      )}>
        {task.title}
      </p>

      {/* Deadline time */}
      {task.deadline && !isDone && (
        <p className={clsx(
          'text-[10px] mt-1 tabular-nums font-medium',
          isActive ? 'text-purple-200' : 'text-gray-400 dark:text-gray-500',
        )}>
          {format(new Date(task.deadline), 'h:mm a')}
        </p>
      )}

      {/* Subtask progress */}
      {!isDone && task.subtaskCount > 0 && (
        <div className="flex items-center gap-1.5 mt-1.5">
          <div className={clsx(
            'flex-1 h-0.5 rounded-full overflow-hidden',
            isActive ? 'bg-white/20' : 'bg-gray-100 dark:bg-gray-700',
          )}>
            <div
              className={clsx('h-full rounded-full', isActive ? 'bg-white/70' : 'bg-purple-400')}
              style={{ width: `${(task.subtaskDoneCount / task.subtaskCount) * 100}%` }}
            />
          </div>
          <span className={clsx(
            'text-[9px] tabular-nums shrink-0',
            isActive ? 'text-purple-200' : 'text-gray-400 dark:text-gray-500',
          )}>
            {task.subtaskDoneCount}/{task.subtaskCount}
          </span>
        </div>
      )}

      {/* Recurring label if no deadline */}
      {type === 'recurring' && !task.deadline && (
        <p className={clsx('text-[10px] mt-1', isActive ? 'text-purple-200' : 'text-amber-500 dark:text-amber-400')}>
          ↺ recurring
        </p>
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
        const isToday = isSameDay(day, today)

        return (
          <div
            key={day.toISOString()}
            className="flex-1 border-r border-gray-100 dark:border-gray-800 flex flex-col min-w-0 last:border-r-0"
          >
            {/* Day header */}
            <div className={clsx(
              'text-center py-2.5 shrink-0',
              isToday
                ? 'border-b-2 border-purple-500 bg-purple-50 dark:bg-purple-950/30'
                : 'border-b border-gray-100 dark:border-gray-800',
            )}>
              <div className={clsx(
                'text-[10px] font-semibold uppercase tracking-wide',
                isToday ? 'text-purple-500 dark:text-purple-400' : 'text-gray-400 dark:text-gray-500',
              )}>
                {format(day, 'EEE')}
              </div>
              <div className={clsx(
                'inline-flex items-center justify-center w-7 h-7 rounded-full mt-0.5 text-sm font-bold',
                isToday ? 'bg-purple-600 text-white' : 'text-gray-700 dark:text-gray-300',
              )}>
                {format(day, 'd')}
              </div>
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
            </div>
          </div>
        )
      })}
    </div>
  )
}
