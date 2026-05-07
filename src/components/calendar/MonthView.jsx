import { format, startOfDay, isSameDay } from 'date-fns'
import clsx from 'clsx'
import { getDayData } from '../../hooks/useCalendarData'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getMonthGrid(date) {
  const year  = date.getFullYear()
  const month = date.getMonth()
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
  const cells  = getMonthGrid(currentDate)
  const today  = startOfDay(new Date())

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-w-0">
      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-800 shrink-0">
        {DAY_LABELS.map(d => (
          <div key={d} className="py-2 text-center text-xs font-medium text-gray-400 dark:text-gray-500">
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div
        className="flex-1 grid grid-cols-7"
        style={{ gridAutoRows: '1fr' }}
      >
        {cells.map((cell, i) => {
          const { completed, deadlines, overdue, recurring } = getDayData(cell.date, tasks)
          const isToday    = isSameDay(cell.date, today)
          const isSelected = selectedDate && isSameDay(cell.date, selectedDate)
          const total      = completed.length + deadlines.length + overdue.length + recurring.length
          const clickable  = total > 0 || isToday

          return (
            <div
              key={i}
              onClick={() => clickable && onDateClick(cell.date)}
              className={clsx(
                'border-b border-r border-gray-100 dark:border-gray-800 p-1.5 flex flex-col transition-colors',
                cell.isCurrentMonth
                  ? 'bg-white dark:bg-gray-950'
                  : 'bg-gray-50/60 dark:bg-gray-900/40',
                clickable && 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900/70',
                isSelected && '!bg-purple-50 dark:!bg-purple-950/30',
              )}
            >
              {/* Date number */}
              <div className={clsx(
                'w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium self-start mb-1',
                isToday
                  ? 'bg-purple-600 text-white'
                  : cell.isCurrentMonth
                    ? 'text-gray-700 dark:text-gray-300'
                    : 'text-gray-300 dark:text-gray-600',
              )}>
                {cell.date.getDate()}
              </div>

              {/* Indicator dots */}
              {total > 0 && (
                <div className="flex items-center gap-0.5 flex-wrap mt-auto">
                  {completed.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />}
                  {overdue.length   > 0 && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
                  {deadlines.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />}
                  {recurring.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
                  {total > 1 && (
                    <span className="text-[9px] leading-none text-gray-400 dark:text-gray-500 ml-0.5 tabular-nums">{total}</span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
