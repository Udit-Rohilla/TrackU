import { useState, useEffect, useRef } from 'react'
import clsx from 'clsx'
import { supabase } from '../../lib/supabase'

const PRIORITIES = ['urgent', 'high', 'medium', 'low']
const PRIORITY_CONFIG = {
  urgent: { label: 'Urgent', cls: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-800' },
  high:   { label: 'High',   cls: 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400 border-orange-200 dark:border-orange-800' },
  medium: { label: 'Medium', cls: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 border-blue-200 dark:border-blue-800' },
  low:    { label: 'Low',    cls: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 border-gray-200 dark:border-gray-600' },
}
const STATUSES = [
  { id: 'not_started', label: 'Not Started', short: 'Not Started', dot: 'bg-gray-400' },
  { id: 'in_progress', label: 'In Progress', short: 'In Progress', dot: 'bg-amber-400' },
  { id: 'on_hold',     label: 'On Hold',     short: 'On Hold',     dot: 'bg-orange-400' },
  { id: 'done',        label: 'Done',        short: 'Done',        dot: 'bg-green-500' },
]
const COLORS = ['#7C3AED','#059669','#2563EB','#D97706','#DC2626','#DB2777','#0891B2','#65A30D','#9CA3AF']

function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function SectionLabel({ children }) {
  return (
    <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">
      {children}
    </p>
  )
}

export default function InspectorPanel({ task, allTags, onClose, onTaskUpdate, onArchive }) {
  const [form, setForm] = useState({
    title:    task.title || '',
    status:   task.status || 'not_started',
    priority: task.priority || 'medium',
    deadline: toLocalInput(task.deadline),
    color:    task.color || '',
    notes:    task.notes || '',
  })
  const [subtasks, setSubtasks]         = useState([])
  const [newSubtask, setNewSubtask]     = useState('')
  const [editingSubtaskId, setEditingSubtaskId] = useState(null)
  const [editSubtaskTitle, setEditSubtaskTitle] = useState('')
  const [selectedTagIds, setSelectedTagIds] = useState(
    new Set(
      task.tags?.map(t => t.id) ||
      (task.task_tags || []).map(tt => tt.tags?.id).filter(Boolean)
    )
  )
  const [saving, setSaving]         = useState(false)
  const [archiving, setArchiving]   = useState(false)
  const [completing, setCompleting] = useState(false)
  const [showTagPicker, setShowTagPicker] = useState(false)
  const titleRef = useRef(null)

  useEffect(() => { fetchSubtasks() }, [task.id])

  // Auto-resize title textarea
  useEffect(() => {
    if (titleRef.current) {
      titleRef.current.style.height = 'auto'
      titleRef.current.style.height = titleRef.current.scrollHeight + 'px'
    }
  }, [form.title])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const handler = e => {
      if (!e.target.closest('[data-tag-picker]')) setShowTagPicker(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function fetchSubtasks() {
    const { data } = await supabase.from('subtasks').select('*').eq('task_id', task.id).order('position')
    setSubtasks(data || [])
  }

  async function persist(updates) {
    setSaving(true)
    const { data, error } = await supabase
      .from('tasks').update(updates).eq('id', task.id)
      .select('*, task_tags(tags(id, name, color)), subtasks(id, is_done)').single()
    setSaving(false)
    if (error) console.error(error.message)
    if (data) onTaskUpdate(data)
  }

  function handleFieldChange(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
    if (field === 'status') {
      const wasInProgress = task.status === 'in_progress'
      const nowInProgress = value === 'in_progress'
      const now = new Date()
      if (!wasInProgress && nowInProgress) {
        persist({ status: value, timer_started_at: now.toISOString() })
      } else if (wasInProgress && !nowInProgress && task.timer_started_at) {
        const secs = Math.max(0, Math.floor((now - new Date(task.timer_started_at)) / 1000))
        persist({ status: value, timer_started_at: null, time_spent_seconds: (task.time_spent_seconds || 0) + secs })
        supabase.from('time_logs').insert({
          task_id: task.id, user_id: task.user_id,
          started_at: task.timer_started_at, ended_at: now.toISOString(), duration_seconds: secs,
        })
      } else {
        persist({ status: value })
      }
      return
    }
    persist({ [field]: value ?? null })
  }

  function handleTitleBlur() {
    const trimmed = form.title.trim()
    if (!trimmed) { setForm(p => ({ ...p, title: task.title })); return }
    if (trimmed !== task.title) persist({ title: trimmed })
  }

  function handleDeadlineChange(val) {
    setForm(p => ({ ...p, deadline: val }))
    persist({ deadline: val ? new Date(val).toISOString() : null, deadline_notified: false })
  }

  async function toggleTag(tagId) {
    const next = new Set(selectedTagIds)
    if (next.has(tagId)) {
      next.delete(tagId)
      await supabase.from('task_tags').delete().eq('task_id', task.id).eq('tag_id', tagId)
    } else {
      next.add(tagId)
      await supabase.from('task_tags').insert({ task_id: task.id, tag_id: tagId })
    }
    setSelectedTagIds(next)
    onTaskUpdate({ ...task, tags: allTags.filter(t => next.has(t.id)) })
  }

  async function addSubtask() {
    const title = newSubtask.trim()
    if (!title) return
    const { data } = await supabase
      .from('subtasks')
      .insert({ task_id: task.id, user_id: task.user_id, title, position: subtasks.length })
      .select().single()
    if (data) { setSubtasks(p => [...p, data]); setNewSubtask('') }
  }

  async function toggleSubtask(sub) {
    const is_done = !sub.is_done
    await supabase.from('subtasks').update({ is_done }).eq('id', sub.id)
    setSubtasks(p => p.map(s => s.id === sub.id ? { ...s, is_done } : s))
  }

  async function deleteSubtask(id) {
    await supabase.from('subtasks').delete().eq('id', id)
    setSubtasks(p => p.filter(s => s.id !== id))
  }

  function startEditSubtask(sub) {
    setEditingSubtaskId(sub.id)
    setEditSubtaskTitle(sub.title)
  }

  async function commitEditSubtask(id) {
    const title = editSubtaskTitle.trim()
    setEditingSubtaskId(null)
    if (!title) return
    await supabase.from('subtasks').update({ title }).eq('id', id)
    setSubtasks(p => p.map(s => s.id === id ? { ...s, title } : s))
  }

  async function markComplete() {
    setCompleting(true)
    await persist({ status: 'done' })
    setForm(p => ({ ...p, status: 'done' }))
    setCompleting(false)
  }

  const isDone         = form.status === 'done'
  const doneSubs       = subtasks.filter(s => s.is_done).length
  const taskTags       = allTags.filter(t => selectedTagIds.has(t.id))
  const unselectedTags = allTags.filter(t => !selectedTagIds.has(t.id))

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-white dark:bg-gray-950 md:static md:inset-auto md:z-auto md:w-80 md:min-w-80 md:border-l md:border-gray-100 md:dark:border-gray-800 md:animate-slide-right overflow-hidden">

      {/* Header */}
      <div className="flex items-start gap-3 px-4 py-3.5 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <div className="flex-1 min-w-0">
          <textarea
            ref={titleRef}
            value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            onBlur={handleTitleBlur}
            rows={1}
            className="w-full text-sm font-semibold text-gray-900 dark:text-white bg-transparent outline-none border-b border-transparent focus:border-purple-400 transition-colors pb-0.5 resize-none overflow-hidden leading-snug"
            placeholder="Task title"
          />
          {saving && (
            <span className="text-[10px] text-gray-400 animate-fade-in mt-0.5 block">Saving…</span>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 md:w-6 md:h-6 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all text-base md:text-xs shrink-0 mt-0.5"
        >✕</button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

        {/* Tags */}
        <div>
          <SectionLabel>Tags</SectionLabel>
          <div className="flex flex-wrap items-center gap-1.5">
            {taskTags.map(tag => (
              <span
                key={tag.id}
                className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
              >
                {tag.name}
                <button
                  onClick={() => toggleTag(tag.id)}
                  className="hover:opacity-60 transition-opacity leading-none ml-0.5"
                >×</button>
              </span>
            ))}
            <div className="relative" data-tag-picker>
              <button
                onClick={() => setShowTagPicker(p => !p)}
                className="text-[11px] px-2 py-0.5 rounded-full border border-dashed border-gray-300 dark:border-gray-600 text-gray-400 hover:border-purple-400 hover:text-purple-500 transition-colors"
              >+ Tag</button>
              {showTagPicker && (
                <div className="absolute top-full left-0 mt-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-20 p-2 min-w-[150px] animate-fade-up">
                  {unselectedTags.length === 0 ? (
                    <p className="text-xs text-gray-400 px-2 py-1.5">All tags added</p>
                  ) : unselectedTags.map(tag => (
                    <button key={tag.id}
                      onClick={() => { toggleTag(tag.id); setShowTagPicker(false) }}
                      className="flex items-center gap-2 w-full text-left text-xs px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                      <span className="text-gray-700 dark:text-gray-300">{tag.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Status */}
        <div>
          <SectionLabel>Status</SectionLabel>
          <div className="flex gap-1.5 flex-wrap">
            {STATUSES.map(s => (
              <button key={s.id}
                onClick={() => handleFieldChange('status', s.id)}
                className={clsx(
                  'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-all active:scale-95',
                  form.status === s.id
                    ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                    : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
                )}
              >
                <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', s.dot)} />
                {s.short}
              </button>
            ))}
          </div>
        </div>

        {/* Priority */}
        <div>
          <SectionLabel>Priority</SectionLabel>
          <div className="flex gap-1.5 flex-wrap">
            {PRIORITIES.map(p => (
              <button key={p}
                onClick={() => handleFieldChange('priority', p)}
                className={clsx(
                  'text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all border active:scale-95',
                  form.priority === p
                    ? PRIORITY_CONFIG[p].cls
                    : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
                )}
              >{PRIORITY_CONFIG[p].label}</button>
            ))}
          </div>
        </div>

        {/* Deadline */}
        <div>
          <SectionLabel>Deadline</SectionLabel>
          <div className="flex items-stretch gap-2">
            <input
              type="datetime-local"
              value={form.deadline}
              onChange={e => handleDeadlineChange(e.target.value)}
              className={clsx(
                'flex-1 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 outline-none focus:border-purple-400 transition-colors',
                form.deadline ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500',
              )}
            />
            {form.deadline && (
              <button
                onClick={() => handleDeadlineChange('')}
                className="shrink-0 text-xs px-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-400 hover:text-red-500 hover:border-red-200 dark:hover:border-red-800 transition-colors font-medium"
              >Clear</button>
            )}
          </div>
        </div>

        {/* Subtasks */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <SectionLabel>
              Subtasks{subtasks.length > 0 ? ` (${doneSubs}/${subtasks.length})` : ''}
            </SectionLabel>
            {subtasks.length > 0 && (
              <div className="w-16 h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full transition-all duration-300"
                  style={{ width: `${(doneSubs / subtasks.length) * 100}%` }}
                />
              </div>
            )}
          </div>
          <div className="space-y-2">
            {subtasks.map(sub => (
              <div key={sub.id} className="flex items-center gap-2 group">
                <button
                  onClick={() => toggleSubtask(sub)}
                  className={clsx(
                    'w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-all active:scale-90',
                    sub.is_done
                      ? 'bg-purple-600 border-purple-600 text-white'
                      : 'border-gray-300 dark:border-gray-600 hover:border-purple-400',
                  )}
                >
                  {sub.is_done && <span className="text-[9px] leading-none font-bold">✓</span>}
                </button>
                {editingSubtaskId === sub.id ? (
                  <input
                    autoFocus
                    value={editSubtaskTitle}
                    onChange={e => setEditSubtaskTitle(e.target.value)}
                    onBlur={() => commitEditSubtask(sub.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); commitEditSubtask(sub.id) }
                      if (e.key === 'Escape') setEditingSubtaskId(null)
                    }}
                    className="flex-1 text-xs bg-transparent outline-none border-b border-purple-400 text-gray-900 dark:text-white"
                  />
                ) : (
                  <span className={clsx(
                    'flex-1 text-xs text-gray-700 dark:text-gray-300',
                    sub.is_done && 'opacity-40',
                  )}>{sub.title}</span>
                )}
                {editingSubtaskId !== sub.id && (
                  <button
                    onClick={() => startEditSubtask(sub)}
                    className="shrink-0 px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40 active:scale-95 transition-all md:opacity-0 md:group-hover:opacity-100"
                  >Rename</button>
                )}
                <button
                  onClick={() => deleteSubtask(sub.id)}
                  className="shrink-0 px-2 py-0.5 rounded-md text-xs font-medium bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40 active:scale-95 transition-all md:opacity-0 md:group-hover:opacity-100"
                >Delete</button>
              </div>
            ))}
            <div className="flex items-center gap-2 mt-1">
              <div className="w-4 h-4 rounded border-2 border-dashed border-gray-200 dark:border-gray-700 shrink-0" />
              <input
                value={newSubtask}
                onChange={e => setNewSubtask(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') addSubtask()
                  if (e.key === 'Escape') setNewSubtask('')
                }}
                placeholder="+ Add Subtask"
                className="flex-1 text-xs bg-transparent outline-none text-purple-600 dark:text-purple-400 placeholder-purple-400 dark:placeholder-purple-600 font-medium"
              />
            </div>
          </div>
        </div>

        {/* Description */}
        <div>
          <SectionLabel>Description</SectionLabel>
          <textarea
            value={form.notes}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            onBlur={() => { if (form.notes !== task.notes) persist({ notes: form.notes || null }) }}
            rows={3}
            placeholder="Add notes or links…"
            className="w-full text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-gray-900 dark:text-white outline-none focus:border-purple-400 resize-none placeholder-gray-300 dark:placeholder-gray-600 transition-colors"
          />
        </div>

        {/* Color */}
        <div>
          <SectionLabel>Color</SectionLabel>
          <div className="flex items-center gap-2 flex-wrap">
            {COLORS.map(c => (
              <button key={c}
                onClick={() => handleFieldChange('color', form.color === c ? null : c)}
                className="w-5 h-5 rounded-full transition-transform hover:scale-110 active:scale-95 shrink-0"
                style={{
                  backgroundColor: c,
                  outline: form.color === c ? `3px solid ${c}` : 'none',
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>
        </div>

        {/* Time logged */}
        {task.timeLoggedMs > 0 && (
          <div>
            <SectionLabel>Time Logged</SectionLabel>
            <p className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
              {Math.floor(task.timeLoggedMs / 3_600_000)}h {Math.floor((task.timeLoggedMs % 3_600_000) / 60_000)}m
            </p>
          </div>
        )}

        {/* Delete */}
        <div className="pt-1 pb-2">
          <button
            onClick={async () => {
              setArchiving(true)
              await supabase.from('tasks').update({ archived: true }).eq('id', task.id)
              onArchive(task.id)
            }}
            disabled={archiving}
            className="flex items-center gap-1.5 text-xs text-red-400 dark:text-red-500 hover:text-red-600 dark:hover:text-red-400 font-medium transition-colors disabled:opacity-40"
          >
            🗑 {archiving ? 'Deleting…' : 'Delete Task'}
          </button>
        </div>

      </div>

      {/* Footer CTA */}
      <div className="px-4 pt-3 pb-24 md:pb-3 border-t border-gray-100 dark:border-gray-800 shrink-0">
        {isDone ? (
          <div className="flex items-center justify-center gap-2 py-2.5 text-sm text-green-600 dark:text-green-400 font-semibold">
            <span>✓</span> Task Completed
          </div>
        ) : (
          <button
            onClick={markComplete}
            disabled={completing}
            className="w-full bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {completing ? (
              <span className="text-xs opacity-80 animate-pulse">Saving…</span>
            ) : (
              <>
                <span className="text-base leading-none">✓</span>
                Mark as Complete
              </>
            )}
          </button>
        )}
      </div>

    </div>
  )
}
