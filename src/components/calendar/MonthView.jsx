import { format, startOfDay, isSameDay } from 'date-fns'
import clsx from 'clsx'
import { getDayData } from '../../hooks/useCalendarData'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const TYPE_PILL = {
  overdue:   'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
  deadline:  'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
  recurring: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
  completed: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
}

function getMonthGrid(date) {
  const year     = date.getFullYear()
  const month    = date.getMonth()
  const firstDay = new Date(year, month, 1)
  const offset   = firstDay.getDay()
  const cells    = []

  for (let i = offset; i > 0; i--) {
    const d = new Date(firstDay)
    d.setDate(d.getDate() - i)
    cells.push({ date: d, isCurrentMonth: false })
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), isCurrentMonth: true })
  }

  let next = 1
  while (cells.length < 42) {
    cells.push({ date: new Date(year, month + 1, next++), isCurrentMonth: false })
  }

  return cells
}

export default function MonthView({ currentDate, tasks, selectedDate, onDateClick }) {
  const cells = getMonthGrid(currentDate)
  const today = startOfDay(new Date())

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-w-0">
      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-800 shrink-0">
        {DAY_LABELS.map(d => (
          <div key={d} className="py-2.5 text-center text-xs font-semibold text-gray-400 dark:text-gray-500 tracking-wide">
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div
        className="flex-1 grid grid-cols-7 overflow-hidden"
        style={{ gridAutoRows: 'minmax(80px, 1fr)' }}
      >
        {cells.map((cell, i) => {
          const { completed, deadlines, overdue, recurring } = getDayData(cell.date, tasks)
          const isToday    = isSameDay(cell.date, today)
          const isSelected = selectedDate && isSameDay(cell.date, selectedDate)
          const total      = completed.length + deadlines.length + overdue.length + recurring.length
          const clickable  = total > 0 || isToday

          // Merge into prioritised list for display
          const allEntries = [
            ...overdue.map(t => ({ task: t, type: 'overdue' })),
            ...deadlines.map(t => ({ task: t, type: 'deadline' })),
            ...recurring.map(t => ({ task: t, type: 'recurring' })),
            ...completed.map(t => ({ task: t, type: 'completed' })),
          ]
          const visible   = allEntries.slice(0, 2)
          const remaining = allEntries.length - visible.length

          return (
            <div
              key={i}
              onClick={() => clickable && onDateClick(cell.date)}
              className={clsx(
                'border-b border-r border-gray-100 dark:border-gray-800 p-1.5 flex flex-col transition-colors overflow-hidden',
                cell.isCurrentMonth
                  ? 'bg-white dark:bg-gray-950'
                  : 'bg-gray-50/60 dark:bg-gray-900/40',
                clickable && 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900/70 active:bg-purple-50/60 dark:active:bg-purple-950/20',
                isSelected && '!bg-purple-50 dark:!bg-purple-950/30',
              )}
            >
              {/* Date number row */}
              <div className="flex items-start justify-between mb-1 shrink-0">
                <div className={clsx(
                  'w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold',
                  isToday
                    ? 'bg-purple-600 text-white'
                    : cell.isCurrentMonth
                      ? 'text-gray-700 dark:text-gray-300'
                      : 'text-gray-300 dark:text-gray-600',
                )}>
                  {cell.date.getDate()}
                </div>
                {remaining > 0 && (
                  <span className="text-[9px] text-gray-400 dark:text-gray-500 font-medium leading-6 pr-0.5">
                    +{remaining}
                  </span>
                )}
              </div>

              {/* Task name pills */}
              {visible.length > 0 && (
                <div className="flex flex-col gap-0.5 flex-1 overflow-hidden">
                  {visible.map(({ task, type }) => (
                    <div
                      key={task.id}
                      className={clsx(
                        'text-[10px] font-medium truncate rounded px-1 leading-[1.4] py-px',
                        TYPE_PILL[type],
                      )}
                    >
                      {type === 'completed' ? '✓ ' : ''}{task.title}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
