import { useRef } from 'react'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors, DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext, horizontalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import clsx from 'clsx'

function SortableTagButton({ tag, isActive, onClick }) {
  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: tag.id })

  return (
    <button
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition ?? 'transform 200ms cubic-bezier(0.16,1,0.3,1)',
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 10 : undefined,
        cursor: isDragging ? 'grabbing' : 'pointer',
      }}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={clsx(
        'px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 -mb-px transition-all duration-200 select-none',
        isActive
          ? 'border-purple-600 text-purple-600 dark:text-purple-400'
          : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
      )}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle"
        style={{ backgroundColor: tag.color }}
      />
      {tag.name}
    </button>
  )
}

export default function SortableTagStrip({
  tags, activeFilter, onFilterChange, onTagsReorder,
  newTag, setNewTag, onCreateTag, newTagInputRef,
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 6 } }),
  )

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return
    const oldIdx = tags.findIndex(t => t.id === active.id)
    const newIdx = tags.findIndex(t => t.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    onTagsReorder(arrayMove(tags, oldIdx, newIdx))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={tags.map(t => t.id)} strategy={horizontalListSortingStrategy}>
        {tags.map(tag => (
          <SortableTagButton
            key={tag.id}
            tag={tag}
            isActive={activeFilter === tag.id}
            onClick={() => onFilterChange(tag.id)}
          />
        ))}
      </SortableContext>

      {/* New tag inline form */}
      {newTag ? (
        <div className="flex items-center gap-1.5 px-2 py-1.5 animate-fade-up">
          <input
            ref={newTagInputRef}
            autoFocus
            value={newTag.name}
            onChange={e => setNewTag(p => ({ ...p, name: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') onCreateTag(); if (e.key === 'Escape') setNewTag(null) }}
            placeholder="Tag name"
            className="text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 w-24 outline-none focus:border-purple-400 text-gray-900 dark:text-white"
          />
          <div className="flex gap-1">
            {['#7C3AED','#2563EB','#0891B2','#059669','#D97706','#DC2626','#DB2777','#9CA3AF'].map(c => (
              <button
                key={c}
                onClick={() => setNewTag(p => ({ ...p, color: c }))}
                className="w-4 h-4 rounded-full transition-transform hover:scale-125 active:scale-95 shrink-0"
                style={{ backgroundColor: c, outline: newTag.color === c ? `2px solid ${c}` : 'none', outlineOffset: 2 }}
              />
            ))}
          </div>
          <button onClick={onCreateTag} className="text-xs text-purple-600 dark:text-purple-400 font-medium hover:text-purple-700 transition-colors">Add</button>
        </div>
      ) : (
        <button
          onClick={() => setNewTag({ name: '', color: '#7C3AED' })}
          className="px-2 py-2.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors whitespace-nowrap"
        >+ Tag</button>
      )}
    </DndContext>
  )
}
