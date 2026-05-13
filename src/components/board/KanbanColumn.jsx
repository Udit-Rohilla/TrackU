import { useRef, useEffect, useState, Fragment } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import clsx from 'clsx'
import TaskCard from './TaskCard'

const COLUMN_META = {
  not_started: { dot: 'bg-gray-400' },
  in_progress: { dot: 'bg-blue-500' },
  on_hold:     { dot: 'bg-orange-400' },
  done:        { dot: 'bg-green-500' },
}

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'

function DropLine() {
  return (
    <div className="flex items-center gap-0 pointer-events-none -my-0.5 relative z-10">
      <div className="w-3 h-3 rounded-full border-2 border-purple-500 bg-white dark:bg-gray-950 shrink-0 -mr-0.5" />
      <div className="flex-1 h-0.5 bg-purple-500 rounded-full" />
    </div>
  )
}

export default function KanbanColumn({
  id, label, tasks, onAddTask, onCardClick, onHold,
  isAdding, onStartAdding, onStopAdding, allTags, activeFilterTagId,
  dropIndicator,
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  const [newTitle, setNewTitle]             = useState('')
  const [selectedTagIds, setSelectedTagIds] = useState(new Set())
  const inputRef = useRef(null)
  const meta = COLUMN_META[id]

  useEffect(() => {
    if (isAdding) {
      inputRef.current?.focus()
      setSelectedTagIds(activeFilterTagId && activeFilterTagId !== 'all'
        ? new Set([activeFilterTagId])
        : new Set()
      )
    }
  }, [isAdding, activeFilterTagId])

  function save() {
    const title = newTitle.trim()
    if (title) {
      onAddTask(id, title, [...selectedTagIds])
    }
    setNewTitle('')
    setSelectedTagIds(new Set())
    onStopAdding()
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') save()
    if (e.key === 'Escape') { setNewTitle(''); setSelectedTagIds(new Set()); onStopAdding() }
  }

  function toggleTag(tagId) {
    setSelectedTagIds(prev => {
      const next = new Set(prev)
      next.has(tagId) ? next.delete(tagId) : next.add(tagId)
      return next
    })
  }

  const showAtEnd = dropIndicator?.atEnd && !isAdding

  return (
    <div className="flex flex-col w-full md:w-72 md:min-w-72 md:self-start">
      {/* Header — sticky on mobile so status label stays visible while scrolling */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-950 md:bg-transparent md:static flex items-center gap-2 py-2 md:py-0 mb-2 md:mb-3 px-1">
        <span className={clsx('w-2 h-2 rounded-full shrink-0', meta.dot)} />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
        <span className="text-xs text-gray-400 dark:text-gray-600 font-medium tabular-nums">{tasks.length}</span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={clsx(
          'rounded-xl p-2 space-y-2 transition-colors duration-150',
          isOver && !dropIndicator
            ? 'bg-purple-50/60 dark:bg-purple-950/20'
            : 'bg-gray-50/80 dark:bg-gray-900/40',
        )}
      >
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map(task => (
            <Fragment key={task.id}>
              {dropIndicator?.beforeId === task.id && <DropLine />}
              <TaskCard task={task} onCardClick={onCardClick} onHold={onHold} />
            </Fragment>
          ))}
        </SortableContext>

        {/* Drop line at end of column */}
        {showAtEnd && <DropLine />}

        {tasks.length === 0 && !isAdding && !showAtEnd && (
          <div className="flex items-center justify-center h-24 text-xs text-gray-300 dark:text-gray-700 select-none">
            Drop here
          </div>
        )}

        {/* Inline add input */}
        <div style={{
          display: 'grid',
          gridTemplateRows: isAdding ? '1fr' : '0fr',
          transition: `grid-template-rows 0.22s ${EASE}`,
        }}>
          <div className="overflow-hidden">
            <div className="pt-1">
              <div className="bg-white dark:bg-gray-800 rounded-lg border-2 border-purple-300 dark:border-purple-700 px-3 py-2.5 shadow-sm">
                <input
                  ref={inputRef}
                  type="text"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={e => {
                    if (e.currentTarget.parentElement?.parentElement?.parentElement?.contains(e.relatedTarget)) return
                    save()
                  }}
                  placeholder="Task title…"
                  className="w-full text-sm bg-transparent text-gray-900 dark:text-white outline-none placeholder-gray-300 dark:placeholder-gray-600"
                />
                {allTags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {allTags.map(tag => (
                      <button
                        key={tag.id}
                        tabIndex={0}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => toggleTag(tag.id)}
                        className={clsx(
                          'text-xs px-2 py-0.5 rounded-full font-medium transition-all duration-150 border active:scale-95',
                          selectedTagIds.has(tag.id) ? 'opacity-100' : 'opacity-40 hover:opacity-70',
                        )}
                        style={{
                          backgroundColor: `${tag.color}22`,
                          color: tag.color,
                          borderColor: selectedTagIds.has(tag.id) ? tag.color : 'transparent',
                        }}
                      >{tag.name}</button>
                    ))}
                  </div>
                )}
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
            'mt-2 flex items-center justify-center gap-1.5 px-3 py-2 w-full rounded-lg',
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
