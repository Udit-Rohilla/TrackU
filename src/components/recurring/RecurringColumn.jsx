import { useState, useRef, useEffect } from 'react'
import clsx from 'clsx'
import RecurringCard from './RecurringCard'

const COLUMN_META = {
  daily:   { dot: 'bg-blue-400' },
  weekly:  { dot: 'bg-purple-500' },
  monthly: { dot: 'bg-amber-400' },
  yearly:  { dot: 'bg-green-500' },
}

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'

export default function RecurringColumn({ type, label, tasks, onMarkDone, onCardClick, onAddTask, isAdding, onStartAdding, onStopAdding }) {
  const [newTitle, setNewTitle] = useState('')
  const inputRef = useRef(null)
  const meta = COLUMN_META[type]

  useEffect(() => {
    if (isAdding) inputRef.current?.focus()
  }, [isAdding])

  function save() {
    const title = newTitle.trim()
    if (title) { onAddTask(type, title); setNewTitle(''); onStopAdding() }
    else { setNewTitle(''); onStopAdding() }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') save()
    if (e.key === 'Escape') { setNewTitle(''); onStopAdding() }
  }

  return (
    <div className="flex flex-col w-full md:w-72 md:min-w-72 md:self-start">
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className={clsx('w-2 h-2 rounded-full shrink-0', meta.dot)} />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
        <span className="text-xs text-gray-400 dark:text-gray-600 font-medium tabular-nums">{tasks.length}</span>
      </div>

      <div className="space-y-3">
        {tasks.length === 0 && !isAdding && (
          <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-8 flex items-center justify-center">
            <p className="text-xs text-gray-300 dark:text-gray-600">No {label.toLowerCase()} tasks</p>
          </div>
        )}

        {tasks.map(task => (
          <RecurringCard
            key={task.id}
            task={task}
            onMarkDone={onMarkDone}
            onCardClick={onCardClick}
          />
        ))}

        {/* Inline add input — animates in/out via grid-rows */}
        <div style={{
          display: 'grid',
          gridTemplateRows: isAdding ? '1fr' : '0fr',
          transition: `grid-template-rows 0.22s ${EASE}`,
        }}>
          <div className="overflow-hidden">
            <div className="pb-1">
              <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-purple-300 dark:border-purple-700 px-3 py-2.5 shadow-sm">
                <input
                  ref={inputRef}
                  type="text"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={save}
                  placeholder="Task title…"
                  className="w-full text-sm bg-transparent text-gray-900 dark:text-white outline-none placeholder-gray-300 dark:placeholder-gray-600"
                />
                <p className="text-xs text-gray-300 dark:text-gray-600 mt-1.5">↵ Add · Esc Cancel</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add task button */}
      {!isAdding && (
        <button
          onClick={onStartAdding}
          className={clsx(
            'mt-3 flex items-center justify-center gap-1.5 px-3 py-2 w-full rounded-lg',
            'text-xs font-medium text-purple-600 dark:text-purple-400 border border-dashed border-purple-300 dark:border-purple-700',
            'hover:bg-purple-50 dark:hover:bg-purple-950/40 hover:border-purple-400 dark:hover:border-purple-500',
            'transition-all duration-200 active:scale-95',
          )}
        >
          <span className="text-sm leading-none">+</span>
          New Task
        </button>
      )}
    </div>
  )
}
