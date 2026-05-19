import { useState } from 'react'
import { format, startOfDay, isSameDay } from 'date-fns'
import clsx from 'clsx'
import { getDayData } from '../../hooks/useCalendarData'

function getWeekDays(date) {
  const start = new Date(date)
  start.setDate(start.getDate() - start.getDay())
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return startOfDay(d)
  })
}

const DAY_SHADES = [
  'bg-[#EBEBEB] dark:bg-[#1A1A1A]',
  'bg-[#E3E3E3] dark:bg-[#1D1D1D]',
  'bg-[#DADADA] dark:bg-[#202020]',
  'bg-[#D2D2D2] dark:bg-[#232323]',
  'bg-[#C9C9C9] dark:bg-[#262626]',
  'bg-[#C0C0C0] dark:bg-[#292929]',
  'bg-[#B8B8B8] dark:bg-[#2C2C2C]',
]

const TYPE_DOT = {
  overdue:   'bg-red-400',
  deadline:  'bg-purple-500',
  recurring: 'bg-amber-400',
  completed: 'bg-green-400',
}

export default function MobileWeekView({ currentDate, tasks, onTaskClick }) {
  const days = getWeekDays(currentDate)
  const today = startOfDay(new Date())
  const now = new Date()

  // Today expanded by default, everything else collapsed
  const [expanded, setExpanded] = useState(() => {
    const set = new Set()
    days.forEach((d, i) => { if (isSameDay(d, today)) set.add(i) })
    return set
  })

  function toggle(i) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  return (
    <div className="flex-1 overflow-y-auto pb-28">
      {days.map((day, i) => {
        const { completed, deadlines, overdue, recurring } = getDayData(day, tasks)
        const isToday = isSameDay(day, today)
        const isOpen = expanded.has(i)
        const allEntries = [
          ...overdue.map(t => ({ task: t, type: 'overdue' })),
          ...deadlines.map(t => ({ task: t, type: 'deadline' })),
          ...recurring.map(t => ({ task: t, type: 'recurring' })),
          ...completed.map(t => ({ task: t, type: 'completed' })),
        ]

        return (
          <div key={day.toISOString()} className={clsx(DAY_SHADES[i], 'transition-all')}>

            {/* Header row — always visible, tap to toggle */}
            <button
              onClick={() => toggle(i)}
              className="w-full text-left px-5 pt-6 pb-5 flex items-end justify-between active:opacity-70 transition-opacity"
            >
              <div>
                <h2 className={clsx(
                  'text-[2.75rem] leading-none font-black uppercase',
                  isToday
                    ? 'text-gray-800 dark:text-gray-100'
                    : 'text-gray-500 dark:text-gray-500',
                )}>
                  {format(day, 'EEEE')}
                </h2>
                <p className={clsx(
                  'text-sm mt-1.5 font-normal',
                  isToday
                    ? 'text-gray-400 dark:text-gray-500'
                    : 'text-gray-400/70 dark:text-gray-600',
                )}>
                  {format(day, 'MMMM d, yyyy')}
                  {isToday && (
                    <span> — {format(now, 'h:mm')}<span className="lowercase">{format(now, 'a')}</span></span>
                  )}
                </p>
              </div>

              {/* Chevron + task count badge */}
              <div className="flex items-center gap-2 mb-1 shrink-0">
                {allEntries.length > 0 && (
                  <span className={clsx(
                    'text-xs font-semibold w-5 h-5 rounded-full flex items-center justify-center',
                    isToday
                      ? 'bg-gray-800/15 dark:bg-white/20 text-gray-700 dark:text-gray-200'
                      : 'bg-black/10 dark:bg-white/10 text-gray-600 dark:text-gray-400',
                  )}>
                    {allEntries.length}
                  </span>
                )}
                <svg
                  width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  className={clsx(
                    'transition-transform duration-200 text-gray-400 dark:text-gray-600',
                    isOpen ? 'rotate-180' : 'rotate-0',
                  )}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </button>

            {/* Expandable content */}
            {isOpen && (
              <div className="px-5 pb-6">
                {allEntries.length > 0 && (
                  <div className="space-y-3 mb-4">
                    {allEntries.map(({ task, type }) => (
                      <button
                        key={task.id}
                        onClick={() => onTaskClick(task)}
                        className="w-full text-left flex items-start gap-3 active:opacity-60 transition-opacity"
                      >
                        <span className={clsx('w-2 h-2 rounded-full shrink-0 mt-[5px]', TYPE_DOT[type])} />
                        <span className={clsx(
                          'text-sm font-medium leading-snug',
                          type === 'completed'
                            ? 'text-gray-400 dark:text-gray-500'
                            : 'text-gray-700 dark:text-gray-200',
                        )}>
                          {type === 'completed' && '✓ '}{task.title}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {!isToday && allEntries.length === 0 && (
                  <p className="text-sm text-gray-400/60 dark:text-gray-700">No tasks</p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
