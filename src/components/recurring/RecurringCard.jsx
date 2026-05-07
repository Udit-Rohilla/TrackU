import { useState } from 'react'
import { format } from 'date-fns'
import clsx from 'clsx'
import { getDueStatus, getNextDueDate, getScheduleLabel } from '../../hooks/useRecurring'

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'

export default function RecurringCard({ task, onMarkDone, onCardClick }) {
  const [showNote, setShowNote] = useState(false)
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState(false)

  const status = getDueStatus(task)
  const nextDue = getNextDueDate(task)
  const scheduleLabel = getScheduleLabel(task)
  const isDoneToday = status === 'done_today'
  const canMarkDone = !isDoneToday

  async function handleConfirm() {
    setConfirming(true)
    await onMarkDone(task.id, note)
    setConfirming(false)
    setShowNote(false)
    setNote('')
  }

  const badge = (() => {
    if (isDoneToday) return { label: '✓ Done today', cls: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400' }
    if (status === 'overdue') return { label: '! Overdue', cls: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' }
    if (status === 'due_today') return { label: 'Due Today', cls: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400' }
    if (status === 'due_tomorrow') return { label: 'Due Tomorrow', cls: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400' }
    if (task.streak_count > 0) return { label: `🔥 ${task.streak_count} Day Streak`, cls: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' }
    return null
  })()

  return (
    <div
      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm"
      style={task.color ? { borderLeftColor: task.color, borderLeftWidth: 3 } : undefined}
    >
      {/* Badge */}
      {badge && (
        <div className="mb-3">
          <span className={clsx('text-xs px-2.5 py-1 rounded-full font-medium', badge.cls)}>
            {badge.label}
          </span>
        </div>
      )}

      {/* Title */}
      <button onClick={() => onCardClick(task)} className="text-left w-full mb-1">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white leading-snug break-words hover:text-purple-600 dark:hover:text-purple-400 transition-colors duration-150">
          {task.title}
        </h3>
      </button>

      {/* Schedule label */}
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">{scheduleLabel}</p>

      {/* Last done · Next due */}
      <div className="flex items-center justify-between text-xs mb-3">
        <span className="text-gray-400 dark:text-gray-500">
          {task.last_completed_at
            ? `Last done ${format(new Date(task.last_completed_at), 'MMM d, h:mm a')}`
            : 'Never done'}
        </span>
        {nextDue && !isDoneToday && (
          <span className={clsx(
            'font-medium',
            status === 'overdue'   ? 'text-red-500 dark:text-red-400' :
            status === 'due_today' ? 'text-amber-500 dark:text-amber-400' :
            'text-gray-400 dark:text-gray-500',
          )}>
            {status === 'overdue'
              ? `Was due ${format(nextDue, 'MMM d')}`
              : `Due ${format(nextDue, 'MMM d')}`}
          </span>
        )}
      </div>

      {/* Last completion note */}
      {task.last_completion_note && (
        <p className="text-xs text-gray-400 dark:text-gray-500 italic mb-3 border-l-2 border-gray-200 dark:border-gray-700 pl-2">
          "{task.last_completion_note}"
        </p>
      )}

      {/* Note input — animates in/out via grid-rows */}
      <div style={{
        display: 'grid',
        gridTemplateRows: showNote ? '1fr' : '0fr',
        transition: `grid-template-rows 0.25s ${EASE}`,
      }}>
        <div className="overflow-hidden">
          <div className="pb-3 pt-0">
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Add a remark or note about this completion…"
              rows={2}
              onKeyDown={e => {
                if (e.key === 'Escape') { setShowNote(false); setNote('') }
                if (e.key === 'Enter' && e.metaKey) handleConfirm()
              }}
              className="w-full text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-purple-400 resize-none placeholder-gray-300 dark:placeholder-gray-600 transition-colors duration-150"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleConfirm}
                disabled={confirming}
                className="text-xs px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium transition-all duration-150 active:scale-95 disabled:opacity-50"
              >
                {confirming ? 'Saving…' : 'Confirm'}
              </button>
              <button
                onClick={() => { setShowNote(false); setNote('') }}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all duration-150"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Action button — animates out when note opens */}
      <div style={{
        display: 'grid',
        gridTemplateRows: showNote ? '0fr' : '1fr',
        transition: `grid-template-rows 0.25s ${EASE}`,
      }}>
        <div className="overflow-hidden">
          <button
            onClick={() => canMarkDone && setShowNote(true)}
            disabled={!canMarkDone}
            className={clsx(
              'w-full text-xs py-2 rounded-lg font-medium transition-all duration-150',
              canMarkDone
                ? 'bg-purple-600 hover:bg-purple-700 text-white active:scale-95'
                : 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-default',
            )}
          >
            {isDoneToday ? 'Already done ✓' : 'Mark done'}
          </button>
        </div>
      </div>
    </div>
  )
}
