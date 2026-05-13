import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { format, formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'

const PRIORITY_STYLES = {
  urgent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  high:   'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  medium: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
  low:    'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
}

function getUrgency(task) {
  if (task.status === 'done' || task.status === 'on_hold' || !task.deadline) return null
  const diff = new Date(task.deadline) - Date.now()
  if (diff < 0) return 'overdue'
  if (diff < 2 * 60 * 60 * 1000) return 'urgent'
  return null
}

function formatDeadline(deadline, urgency) {
  const due = new Date(deadline)
  if (urgency === 'overdue') return { text: `Overdue · ${format(due, 'MMM d')}`, cls: 'text-red-500 dark:text-red-400' }
  if (urgency === 'urgent')  return { text: `Due in ${formatDistanceToNow(due)}`, cls: 'text-amber-500 dark:text-amber-400' }
  return { text: `Due ${format(due, 'MMM d')}`, cls: 'text-gray-400 dark:text-gray-500' }
}

function formatDuration(ms, isActive) {
  const totalSec = Math.floor((ms || 0) / 1000)
  if (isActive && totalSec < 60)   return `${totalSec}s`
  if (isActive && totalSec < 3600) return `${Math.floor(totalSec / 60)}m`
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  return `${h}h ${m}m`
}

export function TaskCardDisplay({ task, isDragging, isOverlay, onHold }) {
  const urgency  = getUrgency(task)
  const isDone   = task.status === 'done'
  const isOnHold = task.status === 'on_hold'
  const tags     = task.tags || []
  const hasSubtasks = (task.subtaskCount ?? 0) > 0
  const subtaskPct  = hasSubtasks ? (task.subtaskDoneCount / task.subtaskCount) * 100 : 0

  const leftBorderStyle = isOnHold
    ? { borderLeftColor: '#f97316', borderLeftWidth: 3 }
    : !isDone && (urgency === 'overdue')
      ? { borderLeftColor: '#ef4444', borderLeftWidth: 3 }
      : !isDone && (urgency === 'urgent')
        ? { borderLeftColor: '#f59e0b', borderLeftWidth: 3 }
        : !isDone && task.color
          ? { borderLeftColor: task.color, borderLeftWidth: 3 }
          : undefined

  return (
    <div
      className={clsx(
        // Base
        'group bg-white dark:bg-gray-800 rounded-lg px-3 py-2.5 border border-gray-100 dark:border-gray-700 select-none',
        // Smooth hover lift (on the visual card, not the sortable wrapper)
        'transition-all duration-200 ease-out',
        !isOverlay && !isDragging && 'hover:-translate-y-0.5 hover:shadow-md hover:border-gray-200 dark:hover:border-gray-600',
        // States
        (isDone || isOnHold) && 'opacity-70',
        isDragging && 'opacity-30 cursor-grabbing',
        !isDragging && !isOverlay && 'cursor-grab',
        // Overlay: elevated, rotated, full opacity
        isOverlay && 'shadow-2xl !opacity-100 rotate-[1.5deg] scale-[1.02] cursor-grabbing ring-1 ring-black/10 dark:ring-white/10',
      )}
      style={leftBorderStyle}
    >
      {/* Title */}
      <div className="flex items-start gap-2">
        <span
          className="mt-1 w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: isOnHold ? '#f97316' : (task.color || (urgency === 'overdue' ? '#ef4444' : urgency === 'urgent' ? '#f59e0b' : '#9ca3af')) }}
        />
        <span className="text-sm text-gray-900 dark:text-white leading-snug font-[450] min-w-0 break-words flex-1">
          {task.title}
        </span>
        {(task.status === 'in_progress' || task.status === 'on_hold') && onHold && !isOverlay && (
          <button
            onClick={e => { e.stopPropagation(); onHold() }}
            title={isOnHold ? 'Resume task' : 'Put on hold'}
            className="shrink-0 mt-0.5 w-6 h-6 flex items-center justify-center rounded text-gray-300 dark:text-gray-600 hover:text-orange-500 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-all duration-150 text-sm md:opacity-0 md:group-hover:opacity-100"
          >{isOnHold ? '▶' : '⏸'}</button>
        )}
      </div>

      {/* On Hold badge */}
      {isOnHold && (
        <div className="mt-1.5 pl-4">
          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400">
            ⏸ On Hold
          </span>
        </div>
      )}

      {/* Tags + priority + recurring */}
      {(tags.length > 0 || task.priority) && (
        <div className="flex items-center gap-1.5 mt-2 flex-wrap pl-4">
          {tags.slice(0, 3).map(tag => (
            <span key={tag.id}
              className="text-xs px-1.5 py-0.5 rounded font-medium"
              style={{ backgroundColor: `${tag.color}15`, color: '#6B7280' }}
            >{tag.name}</span>
          ))}
          {task.priority && (
            <span className={clsx('text-xs px-1.5 py-0.5 rounded font-medium', PRIORITY_STYLES[task.priority])}>
              {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
            </span>
          )}
          {task.is_recurring && (
            <span className="text-xs text-gray-400 dark:text-gray-500">↻ {task.recurrence_type}</span>
          )}
        </div>
      )}

      {/* Subtask progress bar */}
      {hasSubtasks && (
        <div className="mt-2 pl-4">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 rounded-full transition-all duration-300"
                style={{ width: `${subtaskPct}%` }}
              />
            </div>
            <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 tabular-nums">
              {task.subtaskDoneCount}/{task.subtaskCount}
            </span>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-2 pl-4">
        <div className="text-xs">
          {isDone && task.updated_at ? (
            <span className="text-gray-400 dark:text-gray-500">
              Done {format(new Date(task.updated_at), 'MMM d')}
            </span>
          ) : task.deadline ? (
            <span className={formatDeadline(task.deadline, urgency).cls}>
              {urgency && '⚠ '}{formatDeadline(task.deadline, urgency).text}
            </span>
          ) : null}
        </div>

        {task.isTimerActive ? (
          <div className="flex items-center gap-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs px-2 py-0.5 rounded-full font-medium tabular-nums">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
            {formatDuration(task.timeLoggedMs, true)}
          </div>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
            {formatDuration(task.timeLoggedMs, false)}
          </span>
        )}
      </div>
    </div>
  )
}

export default function TaskCard({ task, onCardClick, onHold }) {
  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({
    id: task.id,
    transition: {
      duration: 200,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
    },
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={() => !isDragging && onCardClick?.(task)}
    >
      <TaskCardDisplay task={task} isDragging={isDragging} onHold={onHold ? () => onHold(task) : undefined} />
    </div>
  )
}
