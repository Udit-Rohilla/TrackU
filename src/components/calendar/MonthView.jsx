import { format, startOfDay, isSameDay } from 'date-fns'
import clsx from 'clsx'
import { getDayData } from '../../hooks/useCalendarData'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const TYPE_PILL = {
  overdue:   'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  deadline:  'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400',
  recurring: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  completed: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
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
    <div className="flex-1 flex flex-col min-w-0">

      {/* ── Desktop card ── */}
      <div className="hidden md:block px-6 py-5 h-full">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden h-full flex flex-col">

          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 shrink-0">
            {DAY_LABELS.map(d => (
              <div key={d} className="py-3 text-center text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div className="flex-1 grid grid-cols-7 overflow-hidden" style={{ gridAutoRows: 'minmax(100px, 1fr)' }}>
            {cells.map((cell, i) => {
              const { completed, deadlines, overdue, recurring } = getDayData(cell.date, tasks)
              const isToday    = isSameDay(cell.date, today)
              const isSelected = selectedDate && isSameDay(cell.date, selectedDate)
              const allEntries = [
                ...overdue.map(t => ({ task: t, type: 'overdue' })),
                ...deadlines.map(t => ({ task: t, type: 'deadline' })),
                ...recurring.map(t => ({ task: t, type: 'recurring' })),
                ...completed.map(t => ({ task: t, type: 'completed' })),
              ]
              const visible   = allEntries.slice(0, 3)
              const remaining = allEntries.length - visible.length
              const clickable = allEntries.length > 0 || isToday

              return (
                <div
                  key={i}
                  onClick={() => clickable && onDateClick(cell.date)}
                  className={clsx(
                    'border-b border-r border-gray-100 dark:border-gray-800 p-2 flex flex-col transition-colors overflow-hidden',
                    cell.isCurrentMonth
                      ? 'bg-white dark:bg-gray-950'
                      : 'bg-gray-50/50 dark:bg-gray-900/30',
                    clickable && 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900/60',
                    isSelected && '!bg-violet-50 dark:!bg-violet-950/20',
                  )}
                >
                  {/* Date row */}
                  <div className="flex items-center gap-1.5 mb-1.5 shrink-0">
                    <span className={clsx(
                      'text-sm font-bold leading-none',
                      isToday
                        ? 'text-violet-600 dark:text-violet-400'
                        : cell.isCurrentMonth
                          ? 'text-gray-800 dark:text-gray-200'
                          : 'text-gray-300 dark:text-gray-600',
                    )}>
                      {cell.date.getDate()}
                    </span>
                    {isToday && (
                      <>
                        <span className="text-[10px] font-semibold text-violet-500 dark:text-violet-400">Today</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 ml-auto shrink-0" />
                      </>
                    )}
                    {!isToday && remaining > 0 && (
                      <span className="ml-auto text-[9px] text-gray-400 dark:text-gray-600 font-medium">+{remaining}</span>
                    )}
                    {isToday && remaining > 0 && (
                      <span className="text-[9px] text-gray-400 dark:text-gray-600 font-medium">+{remaining}</span>
                    )}
                  </div>

                  {/* Task pills */}
                  {visible.length > 0 && (
                    <div className="flex flex-col gap-0.5 flex-1 overflow-hidden">
                      {visible.map(({ task, type }) => (
                        <div
                          key={task.id}
                          className={clsx(
                            'text-[10px] font-medium truncate rounded-md px-1.5 py-0.5 leading-[1.5]',
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
      </div>

      {/* ── Mobile monthly card ── */}
      <div
        className="md:hidden flex-1 flex flex-col"
        style={{ paddingBottom: 'calc(88px + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Month title */}
        <div className="px-4 pt-5 pb-3 shrink-0">
          <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight leading-none">
            {format(currentDate, 'MMMM yyyy')}
          </h2>
        </div>

        {/* Calendar card — grows to fill remaining height */}
        <div className="mx-3 flex-1 min-h-0 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">

          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 shrink-0">
            {DAY_LABELS.map(d => (
              <div key={d} className="py-2.5 text-center text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>

          {/* Grid — 6 equal rows filling the remaining card height */}
          <div className="flex-1 min-h-0 grid grid-cols-7" style={{ gridTemplateRows: 'repeat(6, 1fr)' }}>
            {cells.map((cell, i) => {
              const { completed, deadlines, overdue, recurring } = getDayData(cell.date, tasks)
              const isToday    = isSameDay(cell.date, today)
              const isSelected = selectedDate && isSameDay(cell.date, selectedDate)
              const allEntries = [
                ...overdue.map(t => ({ task: t, type: 'overdue' })),
                ...deadlines.map(t => ({ task: t, type: 'deadline' })),
                ...recurring.map(t => ({ task: t, type: 'recurring' })),
                ...completed.map(t => ({ task: t, type: 'completed' })),
              ]
              const visible   = allEntries.slice(0, 2)
              const remaining = allEntries.length - visible.length
              const clickable = allEntries.length > 0 || isToday

              return (
                <div
                  key={i}
                  onClick={() => clickable && onDateClick(cell.date)}
                  className={clsx(
                    'border-b border-r border-gray-100 dark:border-gray-800 p-1.5 flex flex-col transition-colors overflow-hidden',
                    cell.isCurrentMonth
                      ? 'bg-white dark:bg-gray-950'
                      : 'bg-gray-50/50 dark:bg-gray-900/30',
                    clickable && 'cursor-pointer active:bg-gray-50 dark:active:bg-gray-900/60',
                    isSelected && '!bg-violet-50 dark:!bg-violet-950/20',
                  )}
                >
                  {/* Date row — mirrors desktop */}
                  <div className="flex items-center gap-1 mb-1 shrink-0">
                    <span className={clsx(
                      'text-xs font-bold leading-none',
                      isToday
                        ? 'text-violet-600 dark:text-violet-400'
                        : cell.isCurrentMonth
                          ? 'text-gray-800 dark:text-gray-200'
                          : 'text-gray-300 dark:text-gray-600',
                    )}>
                      {cell.date.getDate()}
                    </span>
                    {isToday && (
                      <>
                        <span className="text-[9px] font-semibold text-violet-500 dark:text-violet-400">Today</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 ml-auto shrink-0" />
                      </>
                    )}
                    {!isToday && remaining > 0 && (
                      <span className="ml-auto text-[9px] text-gray-400 dark:text-gray-600 font-medium">+{remaining}</span>
                    )}
                    {isToday && remaining > 0 && (
                      <span className="text-[9px] text-gray-400 dark:text-gray-600 font-medium">+{remaining}</span>
                    )}
                  </div>

                  {/* Task pills */}
                  {visible.length > 0 && (
                    <div className="flex flex-col gap-0.5 flex-1 overflow-hidden">
                      {visible.map(({ task, type }) => (
                        <div
                          key={task.id}
                          className={clsx(
                            'text-[9px] font-medium truncate rounded px-1 leading-[1.5] py-px',
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
      </div>

    </div>
  )
}
