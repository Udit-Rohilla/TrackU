import { useState, useEffect, useRef } from 'react'
import clsx from 'clsx'
import { supabase } from '../../lib/supabase'
import {
  DndContext, PointerSensor, TouchSensor,
  useSensor, useSensors, closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable,
  verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const PRIORITIES = ['urgent', 'high', 'medium', 'low']
const PRIORITY_CONFIG = {
  urgent: { label: 'Urgent', cls: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-800' },
  high:   { label: 'High',   cls: 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400 border-orange-200 dark:border-orange-800' },
  medium: { label: 'Medium',   cls: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 border-blue-200 dark:border-blue-800' },
  low:    { label: 'Low',      cls: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 border-gray-200 dark:border-gray-600' },
}
const STATUSES = [
  { id: 'not_started', label: 'Not Started', dot: 'bg-gray-400' },
  { id: 'in_progress', label: 'In Progress', dot: 'bg-amber-400' },
  { id: 'on_hold',     label: 'On Hold',     dot: 'bg-orange-400' },
  { id: 'done',        label: 'Done',        dot: 'bg-green-500' },
]
const COLORS = ['#7C3AED','#059669','#2563EB','#D97706','#DC2626','#DB2777','#0891B2','#65A30D','#9CA3AF']
const RECURRENCE_TYPES = ['daily', 'weekly', 'monthly', 'yearly']
const WEEKDAYS = [
  { id: 0, label: 'Su' }, { id: 1, label: 'Mo' }, { id: 2, label: 'Tu' },
  { id: 3, label: 'We' }, { id: 4, label: 'Th' }, { id: 5, label: 'Fr' }, { id: 6, label: 'Sa' },
]
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function TaskModal({ task, allTags, onClose, onTaskUpdate, onArchive }) {
  const [form, setForm] = useState({
    title:                      task.title || '',
    status:                     task.status || 'not_started',
    priority:                   task.priority || 'medium',
    deadline:                   toLocalInput(task.deadline),
    color:                      task.color || '',
    notes:                      task.notes || '',
    is_recurring:               task.is_recurring || false,
    recurrence_type:            task.recurrence_type || 'weekly',
    recurrence_config:          task.recurrence_config || {},
    recurring_reminder_minutes: task.recurring_reminder_minutes ?? null,
  })
  const [subtasks, setSubtasks]             = useState([])
  const [newSubtask, setNewSubtask]         = useState('')
  const [editingSubtaskId, setEditingSubtaskId] = useState(null)
  const [editSubtaskTitle, setEditSubtaskTitle] = useState('')
const [selectedTagIds, setSelectedTagIds] = useState(
  new Set((task.task_tags || []).map(tt => tt.tags?.id).filter(Boolean))
)
  const [saving, setSaving]                 = useState(false)
  const [archiving, setArchiving]           = useState(false)
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [showTagPicker, setShowTagPicker]   = useState(false)
  const titleRef   = useRef(null)
  const scrollRef  = useRef(null)
  const panelRef   = useRef(null)
  const onCloseRef    = useRef(onClose)
  const backdropRef   = useRef(null)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  function closeWithAnimation() {
    const panel = panelRef.current
    if (!panel) { onClose(); return }
    panel.style.animation = 'none'
    panel.getBoundingClientRect()  // force reflow so browser commits translateY(0) before transition starts
    panel.style.transition = 'transform 0.26s cubic-bezier(0.4, 0, 1, 1)'
    panel.style.transform  = 'translateY(110%)'
    if (backdropRef.current) {
      backdropRef.current.style.transition = 'opacity 0.26s ease'
      backdropRef.current.style.opacity    = '0'
    }
    setTimeout(onClose, 240)
  }

  useEffect(() => {
    fetchSubtasks()
    const onKey = e => { if (e.key === 'Escape') closeWithAnimation() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Lock body scroll while modal is open.
  // This is the correct iOS fix — without it, Safari scrolls the page behind the
  // modal when the keyboard opens or when any element inside receives focus,
  // which makes the fixed overlay visually jitter.
  useEffect(() => {
    const scrollY = window.scrollY
    document.body.style.overflow  = 'hidden'
    document.body.style.position  = 'fixed'
    document.body.style.top       = `-${scrollY}px`
    document.body.style.width     = '100%'
    return () => {
      document.body.style.overflow  = ''
      document.body.style.position  = ''
      document.body.style.top       = ''
      document.body.style.width     = ''
      window.scrollTo(0, scrollY)
    }
  }, [])

  // Swipe-to-close: native listeners so we can call preventDefault on touchmove
  useEffect(() => {
    const panel  = panelRef.current
    const scroll = scrollRef.current
    if (!panel || !scroll) return

    let startY = 0, deltaY = 0, active = false
    let lastY = 0, lastTime = 0, velocity = 0  // px/ms, positive = downward

    function startDrag(y) {
      panel.style.animation  = 'none'
      panel.style.willChange = 'transform'
      startY = y; deltaY = 0; active = true
      lastY = y; lastTime = Date.now(); velocity = 0
    }

    const onPanelStart  = e => { if (!scroll.contains(e.target)) startDrag(e.touches[0].clientY) }
    const onScrollStart = e => { if (scroll.scrollTop <= 0) startDrag(e.touches[0].clientY) }

    const onMove = e => {
      if (!active) return
      const now = Date.now(), currentY = e.touches[0].clientY
      const dt = now - lastTime
      if (dt > 0) velocity = (currentY - lastY) / dt
      lastY = currentY; lastTime = now

      const dy = currentY - startY
      if (dy <= 0) { active = false; panel.style.willChange = ''; return }
      e.preventDefault()
      deltaY = dy
      panel.style.transform = `translateY(${dy}px)`

      // Dim backdrop proportionally as panel moves down
      const backdrop = backdropRef.current
      if (backdrop) {
        const progress = Math.min(1, dy / (panel.offsetHeight * 0.25))
        backdrop.style.opacity = String(1 - progress * 0.5)
      }
    }

    const onEnd = () => {
      if (!active) return
      active = false
      panel.style.willChange = ''
      const backdrop = backdropRef.current
      // Close if dragged past 25% OR flicked fast (> 0.5 px/ms)
      if (deltaY > panel.offsetHeight * 0.25 || velocity > 0.5) {
        panel.style.transition = 'transform 0.26s cubic-bezier(0.4, 0, 1, 1)'
        panel.style.transform  = 'translateY(110%)'
        if (backdrop) {
          backdrop.style.transition = 'opacity 0.26s ease'
          backdrop.style.opacity    = '0'
        }
        setTimeout(() => onCloseRef.current(), 240)
      } else {
        // Spring snap-back — overshoot easing feels alive
        panel.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
        panel.style.transform  = 'translateY(0)'
        if (backdrop) {
          backdrop.style.transition = 'opacity 0.3s ease'
          backdrop.style.opacity    = '1'
        }
        setTimeout(() => {
          panel.style.transition = ''
          panel.style.animation  = ''
          if (backdrop) backdrop.style.transition = ''
        }, 420)
      }
    }

    panel.addEventListener ('touchstart',  onPanelStart,  { passive: true  })
    scroll.addEventListener('touchstart',  onScrollStart, { passive: true  })
    panel.addEventListener ('touchmove',   onMove,        { passive: false })
    panel.addEventListener ('touchend',    onEnd)
    panel.addEventListener ('touchcancel', onEnd)

    return () => {
      panel.removeEventListener ('touchstart',  onPanelStart)
      scroll.removeEventListener('touchstart',  onScrollStart)
      panel.removeEventListener ('touchmove',   onMove)
      panel.removeEventListener ('touchend',    onEnd)
      panel.removeEventListener ('touchcancel', onEnd)
    }
  }, [])

  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [form.title])

  useEffect(() => {
    const handler = e => {
      if (!e.target.closest('[data-status-menu]')) setShowStatusMenu(false)
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
    if (error) console.error('persist failed:', error.message, updates)
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
    if (field === 'is_recurring') {
      if (value) {
        persist({ is_recurring: true })
      } else {
        // Clear reminder time when turning recurring off
        setForm(prev => ({ ...prev, is_recurring: false, recurring_reminder_minutes: null }))
        persist({ is_recurring: false, recurring_reminder_minutes: null })
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

  // Converts integer minutes-since-midnight to "HH:MM" for the time input
  function minutesToTimeStr(mins) {
    if (mins == null) return ''
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
  }

  function handleReminderTimeChange(timeStr) {
    if (!timeStr) {
      setForm(p => ({ ...p, recurring_reminder_minutes: null }))
      persist({ recurring_reminder_minutes: null })
      return
    }
    const [h, m] = timeStr.split(':').map(Number)
    const mins = h * 60 + m
    setForm(p => ({ ...p, recurring_reminder_minutes: mins }))
    persist({ recurring_reminder_minutes: mins })
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

  async function handleSubtaskDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = subtasks.findIndex(s => s.id === active.id)
    const newIdx = subtasks.findIndex(s => s.id === over.id)
    const reordered = arrayMove(subtasks, oldIdx, newIdx)
    setSubtasks(reordered)
    await Promise.all(
      reordered.map((s, i) => supabase.from('subtasks').update({ position: i }).eq('id', s.id))
    )
  }

  async function commitEditSubtask(id) {
    const title = editSubtaskTitle.trim()
    setEditingSubtaskId(null)
    if (!title) return
    await supabase.from('subtasks').update({ title }).eq('id', id)
    setSubtasks(p => p.map(s => s.id === id ? { ...s, title } : s))
  }

  const subSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 150, tolerance: 5 } }),
  )

  const selectedStatus  = STATUSES.find(s => s.id === form.status) || STATUSES[0]
  const doneSubs        = subtasks.filter(s => s.is_done).length
  const unselectedTags  = allTags.filter(t => !selectedTagIds.has(t.id))

  return (
    <>
      <div ref={backdropRef} className="fixed inset-0 bg-black/40 dark:bg-black/60 z-40 animate-fade-in" onClick={closeWithAnimation} />

      <div className="fixed inset-0 z-50 flex flex-col justify-end md:items-center md:justify-center pointer-events-none">
        <div
          ref={panelRef}
          className={clsx(
            'pointer-events-auto bg-white dark:bg-gray-900 shadow-2xl w-full flex flex-col overflow-hidden',
            'rounded-t-2xl max-h-[92svh]',
            'md:rounded-2xl md:w-[800px] md:max-h-[88vh]',
            'animate-slide-up md:animate-scale-in',
          )}
        >
          {/* Mobile drag handle */}
          <div className="md:hidden flex justify-center pt-3 pb-2 shrink-0">
            <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
          </div>

          {/* Scrollable content — min-h-0 required for iOS flex scroll */}
          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-y-scroll overscroll-contain"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
          <div className="px-6 pt-5 pb-6">

            {/* Title row */}
            <div className="flex items-start gap-3 mb-6">
              <textarea
                ref={titleRef}
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                onBlur={handleTitleBlur}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                rows={1}
                className="flex-1 text-xl font-semibold text-gray-900 dark:text-white bg-transparent outline-none border-b-2 border-transparent focus:border-purple-400 pb-0.5 transition-colors resize-none overflow-hidden leading-snug w-full"
                placeholder="Task title"
              />
              <div className="flex items-center gap-2 shrink-0 mt-1">
                {saving && <span className="text-xs text-gray-400 animate-fade-in">Saving…</span>}
                <button
                  onClick={closeWithAnimation}
                  className="w-11 h-11 md:w-7 md:h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all active:scale-90 text-xl md:text-sm"
                >✕</button>
              </div>
            </div>

            {/* Two-column body */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">

              {/* ── LEFT ── */}
              <div className="space-y-5">

                {/* Status */}
                <div>
                  <Label>Status</Label>
                  <div className="relative" data-status-menu>
                    <button
                      onClick={() => setShowStatusMenu(p => !p)}
                      className="w-full flex items-center gap-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-900 dark:text-white hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                    >
                      <span className={clsx('w-2 h-2 rounded-full shrink-0', selectedStatus.dot)} />
                      <span className="flex-1 text-left">{selectedStatus.label}</span>
                      <span className="text-gray-400 text-xs">▾</span>
                    </button>
                    {showStatusMenu && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-20 overflow-hidden animate-fade-up">
                        {STATUSES.map(s => (
                          <button key={s.id}
                            onClick={() => { handleFieldChange('status', s.id); setShowStatusMenu(false) }}
                            className={clsx(
                              'flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-left transition-colors',
                              form.status === s.id
                                ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300',
                            )}
                          >
                            <span className={clsx('w-2 h-2 rounded-full shrink-0', s.dot)} />
                            {s.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Priority */}
                <div>
                  <Label>Priority</Label>
                  <div className="flex gap-2 flex-wrap">
                    {PRIORITIES.map(p => (
                      <button key={p}
                        onClick={() => handleFieldChange('priority', p)}
                        className={clsx(
                          'text-xs px-3 py-1.5 rounded-lg font-medium transition-all border active:scale-95',
                          form.priority === p
                            ? PRIORITY_CONFIG[p].cls
                            : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
                        )}
                      >{PRIORITY_CONFIG[p].label}</button>
                    ))}
                  </div>
                </div>

                {/* Deadline / Reminder Time */}
                <div>
                  {form.is_recurring ? (
                    <>
                      <Label>Reminder Time</Label>
                      <div className="flex items-stretch gap-2">
                        <input
                          type="time"
                          value={minutesToTimeStr(form.recurring_reminder_minutes)}
                          onChange={e => handleReminderTimeChange(e.target.value)}
                          className={clsx(
                            'flex-1 text-base md:text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 outline-none focus:border-purple-400 transition-colors',
                            form.recurring_reminder_minutes != null ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500',
                          )}
                        />
                        {form.recurring_reminder_minutes != null && (
                          <button
                            onClick={() => handleReminderTimeChange('')}
                            className="shrink-0 text-xs px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-400 hover:text-red-500 hover:border-red-200 dark:hover:border-red-800 transition-colors font-medium"
                          >Clear</button>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">Notified at this time on each recurrence day.</p>
                    </>
                  ) : (
                    <>
                      <Label>Deadline</Label>
                      <div className="flex items-stretch gap-2">
                        <input
                          type="datetime-local"
                          value={form.deadline}
                          onChange={e => handleDeadlineChange(e.target.value)}
                          className={clsx(
                            'flex-1 text-base md:text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 outline-none focus:border-purple-400 transition-colors',
                            form.deadline ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500',
                          )}
                        />
                        {form.deadline && (
                          <button
                            onClick={() => handleDeadlineChange('')}
                            className="shrink-0 text-xs px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-400 hover:text-red-500 hover:border-red-200 dark:hover:border-red-800 transition-colors font-medium"
                          >Clear</button>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Tags */}
                <div>
                  <Label>Tags</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    {allTags.filter(t => selectedTagIds.has(t.id)).map(tag => (
                      <span key={tag.id}
                        className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium"
                        style={{ backgroundColor: '#F3F4F6', color: '#6B7280' }}
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
                        className="text-xs px-2.5 py-1 rounded-full border border-dashed border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-purple-400 dark:hover:border-purple-500 hover:text-purple-500 transition-colors"
                      >+ Add Tag</button>

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

              </div>

              {/* ── RIGHT ── */}
              <div className="space-y-5">

                {/* Color */}
                <div>
                  <Label>Color</Label>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {COLORS.map(c => (
                      <button key={c}
                        onClick={() => handleFieldChange('color', form.color === c ? null : c)}
                        className="w-7 h-7 rounded-full transition-transform hover:scale-110 active:scale-95 shrink-0"
                        style={{
                          backgroundColor: c,
                          outline: form.color === c ? `3px solid ${c}` : 'none',
                          outlineOffset: 2,
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Subtasks */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>
                      Subtasks{subtasks.length > 0 ? ` (${doneSubs}/${subtasks.length})` : ''}
                    </Label>
                    {subtasks.length > 0 && (
                      <div className="w-20 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-500 rounded-full transition-all duration-300"
                          style={{ width: `${(doneSubs / subtasks.length) * 100}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <DndContext sensors={subSensors} collisionDetection={closestCenter} onDragEnd={handleSubtaskDragEnd}>
                    <SortableContext items={subtasks.map(s => s.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {subtasks.map(sub => (
                          <SortableSubtaskRow
                            key={sub.id}
                            sub={sub}
                            isEditing={editingSubtaskId === sub.id}
                            editTitle={editSubtaskTitle}
                            onEditTitleChange={setEditSubtaskTitle}
                            onToggle={() => toggleSubtask(sub)}
                            onStartEdit={() => startEditSubtask(sub)}
                            onCommitEdit={() => commitEditSubtask(sub.id)}
                            onCancelEdit={() => setEditingSubtaskId(null)}
                            onDelete={() => deleteSubtask(sub.id)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>

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
                        className="flex-1 text-base md:text-sm bg-transparent outline-none text-purple-600 dark:text-purple-400 placeholder-purple-400 dark:placeholder-purple-600 font-medium"
                      />
                    </div>
                </div>

                {/* Notes */}
                <div>
                  <Label>Description</Label>
                  <textarea
                    value={form.notes}
                    onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                    onBlur={() => { if (form.notes !== task.notes) persist({ notes: form.notes || null }) }}
                    rows={4}
                    placeholder="Add additional details or links here…"
                    className="w-full text-base md:text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-900 dark:text-white outline-none focus:border-purple-400 resize-none placeholder-gray-300 dark:placeholder-gray-600 transition-colors"
                  />
                </div>

                {/* Recurring */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label>Recurring</Label>
                    <button
                      onClick={() => handleFieldChange('is_recurring', !form.is_recurring)}
                      className={clsx(
                        'relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0',
                        form.is_recurring ? 'bg-purple-600' : 'bg-gray-200 dark:bg-gray-700',
                      )}
                    >
                      <span className={clsx(
                        'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200',
                        form.is_recurring ? 'translate-x-4' : 'translate-x-0.5',
                      )} />
                    </button>
                  </div>
                  {form.is_recurring && (
                    <div className="space-y-3 animate-fade-up">
                      <div className="flex gap-2 flex-wrap">
                        {RECURRENCE_TYPES.map(type => (
                          <button key={type}
                            onClick={() => {
                              setForm(p => ({ ...p, recurrence_type: type, recurrence_config: {} }))
                              persist({ recurrence_type: type, recurrence_config: {} })
                            }}
                            className={clsx(
                              'text-xs px-3 py-1.5 rounded-lg font-medium capitalize transition-all active:scale-95',
                              form.recurrence_type === type
                                ? 'bg-purple-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700',
                            )}
                          >{type}</button>
                        ))}
                      </div>
                      {form.recurrence_type === 'weekly' && (
                        <div className="flex gap-1.5 flex-wrap">
                          {WEEKDAYS.map(d => {
                            const sel = (form.recurrence_config.days || []).includes(d.id)
                            return (
                              <button key={d.id}
                                onClick={() => {
                                  const days = form.recurrence_config.days || []
                                  const next = sel ? days.filter(x => x !== d.id) : [...days, d.id]
                                  const cfg = { ...form.recurrence_config, days: next }
                                  setForm(p => ({ ...p, recurrence_config: cfg }))
                                  persist({ recurrence_config: cfg })
                                }}
                                className={clsx(
                                  'w-8 h-8 rounded-full text-xs font-medium transition-all active:scale-90',
                                  sel ? 'bg-purple-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700',
                                )}
                              >{d.label}</button>
                            )
                          })}
                        </div>
                      )}
                      {form.recurrence_type === 'monthly' && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 dark:text-gray-400">On day</span>
                          <input
                            type="number" min={1} max={31}
                            value={form.recurrence_config.day ?? ''}
                            onChange={e => setForm(p => ({ ...p, recurrence_config: { ...p.recurrence_config, day: parseInt(e.target.value) || null } }))}
                            onBlur={e => persist({ recurrence_config: { ...form.recurrence_config, day: parseInt(e.target.value) || null } })}
                            placeholder="1–31"
                            className="w-16 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-gray-900 dark:text-white outline-none focus:border-purple-400 text-center"
                          />
                          <span className="text-xs text-gray-400">of every month</span>
                        </div>
                      )}
                      {form.recurrence_type === 'yearly' && (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-1.5">
                            {MONTHS.map((m, i) => {
                              const sel = form.recurrence_config.month === i + 1
                              return (
                                <button key={m}
                                  onClick={() => {
                                    const cfg = { ...form.recurrence_config, month: i + 1 }
                                    setForm(p => ({ ...p, recurrence_config: cfg }))
                                    persist({ recurrence_config: cfg })
                                  }}
                                  className={clsx(
                                    'text-xs px-2 py-1 rounded-lg font-medium transition-all active:scale-95',
                                    sel ? 'bg-purple-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
                                  )}
                                >{m}</button>
                              )
                            })}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 dark:text-gray-400">On day</span>
                            <input
                              type="number" min={1} max={31}
                              value={form.recurrence_config.day ?? ''}
                              onChange={e => setForm(p => ({ ...p, recurrence_config: { ...p.recurrence_config, day: parseInt(e.target.value) || null } }))}
                              onBlur={e => persist({ recurrence_config: { ...form.recurrence_config, day: parseInt(e.target.value) || null } })}
                              placeholder="1–31"
                              className="w-16 text-base md:text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-gray-900 dark:text-white outline-none focus:border-purple-400 text-center"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>

              {/* Delete Task */}
              <div className="pt-2 pb-24">
                <button
                  onClick={async () => {
                    setArchiving(true)
                    await supabase.from('tasks').update({ archived: true }).eq('id', task.id)
                    onArchive(task.id)
                  }}
                  disabled={archiving}
                  className="flex items-center gap-1.5 text-sm text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 font-medium transition-colors disabled:opacity-40"
                >
                  <span>🗑</span>
                  {archiving ? 'Archiving…' : 'Delete Task'}
                </button>
              </div>

            </div>
          </div>
          </div>{/* end scrollable area */}
        </div>
      </div>
    </>
  )
}

function Label({ children }) {
  return (
    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
      {children}
    </p>
  )
}

function SortableSubtaskRow({ sub, isEditing, editTitle, onEditTitleChange, onToggle, onStartEdit, onCommitEdit, onCancelEdit, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sub.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx('flex items-center gap-2.5 group', isDragging && 'opacity-40')}
    >
      {/* Drag handle */}
      <span
        {...attributes}
        {...listeners}
        className="shrink-0 text-gray-300 dark:text-gray-600 cursor-grab active:cursor-grabbing touch-none text-xs leading-none select-none"
        title="Drag to reorder"
      >⠿</span>
      <button
        onClick={onToggle}
        className={clsx(
          'w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-all active:scale-90',
          sub.is_done ? 'bg-purple-600 border-purple-600 text-white' : 'border-gray-300 dark:border-gray-600 hover:border-purple-400',
        )}
      >
        {sub.is_done && <span className="text-[10px] leading-none font-bold">✓</span>}
      </button>
      {isEditing ? (
        <input
          autoFocus
          value={editTitle}
          onChange={e => onEditTitleChange(e.target.value)}
          onBlur={onCommitEdit}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); onCommitEdit() }
            if (e.key === 'Escape') onCancelEdit()
          }}
          className="flex-1 text-base md:text-sm bg-transparent outline-none border-b border-purple-400 text-gray-900 dark:text-white"
        />
      ) : (
        <span className={clsx('flex-1 text-sm text-gray-700 dark:text-gray-300', sub.is_done && 'opacity-40')}>
          {sub.title}
        </span>
      )}
      {!isEditing && (
        <button
          onClick={onStartEdit}
          className="shrink-0 px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40 active:scale-95 transition-all md:opacity-0 md:group-hover:opacity-100"
        >Rename</button>
      )}
      <button
        onClick={onDelete}
        className="shrink-0 px-2 py-0.5 rounded-md text-xs font-medium bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40 active:scale-95 transition-all md:opacity-0 md:group-hover:opacity-100"
      >Delete</button>
    </div>
  )
}
