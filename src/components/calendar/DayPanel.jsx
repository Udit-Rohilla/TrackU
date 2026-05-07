import { format } from 'date-fns'
import clsx from 'clsx'
import { getDayData } from '../../hooks/useCalendarData'

const SECTION_CONFIG = {
  completed: { label: 'Completed', icon: '✓', color: 'text-green-600 dark:text-green-400', border: 'border-l-green-500' },
  overdue:   { label: 'Overdue',   icon: '!', color: 'text-red-600 dark:text-red-400',     border: 'border-l-red-500' },
  deadline:  { label: 'Due',       icon: '◷', color: 'text-purple-600 dark:text-purple-400', border: 'border-l-purple-500' },
  recurring: { label: 'Recurring', icon: '↺', color: 'text-amber-600 dark:text-amber-400', border: 'border-l-amber-400' },
}

const PRIORITY_STYLES = {
  urgent: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400',
  high:   'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400',
  medium: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
  low:    'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
}

function CompactCard({ task, type, onClick }) {
  const cfg = SECTION_CONFIG[type]
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full text-left bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700',
        'rounded-lg px-3 py-2.5 border-l-2 shadow-sm transition-all',
        'hover:shadow-md hover:-translate-y-px',
        cfg.border,
      )}
    >
      <p className={clsx(
        'text-sm font-medium leading-snug break-words',
        type === 'completed'
          ? 'text-gray-400 dark:text-gray-500 line-through'
          : 'text-gray-800 dark:text-gray-200',
      )}>
        {task.title}
      </p>

      {(task.tags?.length > 0 || task.priority) && (
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          {task.tags?.slice(0, 3).map(tag => (
            <span
              key={tag.id}
              className="text-[10px] px-1.5 py-0.5 rounded font-medium text-gray-500"
              style={{ backgroundColor: `${tag.color}18` }}
            >{tag.name}</span>
          ))}
          {task.priority && (
            <span className={clsx('text-[10px] px-1.5 py-0.5 rounded font-medium', PRIORITY_STYLES[task.priority])}>
              {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
            </span>
          )}
        </div>
      )}

      {task.timeLoggedMs > 0 && (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 tabular-nums">
          {Math.floor(task.timeLoggedMs / 3_600_000)}h {Math.floor((task.timeLoggedMs % 3_600_000) / 60_000)}m logged
        </p>
      )}
    </button>
  )
}

function Section({ type, tasks, onTaskClick }) {
  if (!tasks.length) return null
  const cfg = SECTION_CONFIG[type]
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <span className={clsx('text-xs font-semibold', cfg.color)}>{cfg.icon}</span>
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{cfg.label}</span>
        <span className="text-xs text-gray-300 dark:text-gray-600 tabular-nums">{tasks.length}</span>
      </div>
      <div className="space-y-2">
        {tasks.map(task => (
          <CompactCard
            key={task.id}
            task={task}
            type={type}
            onClick={() => onTaskClick(task)}
          />
        ))}
      </div>
    </div>
  )
}

export default function DayPanel({ date, tasks, onClose, onTaskClick }) {
  const { completed, deadlines, overdue, recurring } = getDayData(date, tasks)
  const total = completed.length + deadlines.length + overdue.length + recurring.length

  return (
    <div className="w-72 min-w-72 border-l border-gray-100 dark:border-gray-800 flex flex-col bg-white dark:bg-gray-950 animate-slide-right">

      {/* Panel header */}
      <div className="flex items-start justify-between px-4 py-3.5 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{format(date, 'EEEE')}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{format(date, 'MMMM d, yyyy')}</p>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all text-xs mt-0.5"
        >✕</button>
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-1">
            <p className="text-sm text-gray-400 dark:text-gray-500">No tasks on this day</p>
          </div>
        ) : (
          <>
            <Section type="completed" tasks={completed} onTaskClick={onTaskClick} />
            <Section type="overdue"   tasks={overdue}   onTaskClick={onTaskClick} />
            <Section type="deadline"  tasks={deadlines} onTaskClick={onTaskClick} />
            <Section type="recurring" tasks={recurring} onTaskClick={onTaskClick} />
          </>
        )}
      </div>
    </div>
  )
}
