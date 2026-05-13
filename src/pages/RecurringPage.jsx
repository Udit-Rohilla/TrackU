import { useState, useEffect } from 'react'
import clsx from 'clsx'
import { supabase } from '../lib/supabase'
import { useRecurring, getDueStatus } from '../hooks/useRecurring'
import RecurringColumn from '../components/recurring/RecurringColumn'
import TaskModal from '../components/tasks/TaskModal'

const FREQUENCIES = [
  { type: 'daily',   label: 'Daily' },
  { type: 'weekly',  label: 'Weekly' },
  { type: 'monthly', label: 'Monthly' },
  { type: 'yearly',  label: 'Yearly' },
]

const TABS = [
  { id: 'all',       label: 'All' },
  { id: 'upcoming',  label: 'Upcoming' },
  { id: 'completed', label: 'Completed' },
]

const SORT_OPTS = [
  { id: 'default', label: 'Default' },
  { id: 'name',    label: 'Name' },
  { id: 'due',     label: 'Due status' },
]

const DUE_STATUS_RANK = { overdue: 0, due_today: 1, due_tomorrow: 2, upcoming: 3, done_today: 4 }

function sortRecurringList(list, sortBy) {
  if (sortBy === 'name') {
    return [...list].sort((a, b) => a.title.localeCompare(b.title))
  }
  if (sortBy === 'due') {
    return [...list].sort((a, b) => {
      const ra = DUE_STATUS_RANK[getDueStatus(a)] ?? 5
      const rb = DUE_STATUS_RANK[getDueStatus(b)] ?? 5
      return ra - rb
    })
  }
  return list
}

export default function RecurringPage({ session }) {
  const { tasks, loading, markDone, addTask, handleTaskUpdate, handleArchive } = useRecurring(session)
  const [editingTask, setEditingTask]       = useState(null)
  const [allTags, setAllTags]               = useState([])
  const [activeTab, setActiveTab]           = useState('all')
  const [tabKey, setTabKey]                 = useState(0)
  const [searchQuery, setSearchQuery]       = useState('')
  const [sortBy, setSortBy]                 = useState(() => localStorage.getItem('tracku_recurring_sort') || 'default')
  const [sortOpen, setSortOpen]             = useState(false)
  const [addingToColumn, setAddingToColumn] = useState(null)

  useEffect(() => {
    supabase.from('tags').select('*').order('position', { ascending: true, nullsFirst: false }).order('name').then(({ data }) => setAllTags(data || []))
  }, [])

  function handleTabChange(id) {
    if (id === activeTab) return
    setActiveTab(id)
    setTabKey(k => k + 1)
  }

  function handleSortChange(id) {
    setSortBy(id)
    localStorage.setItem('tracku_recurring_sort', id)
  }

  const displayTasks = tasks.filter(t => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const match = t.title.toLowerCase().includes(q) ||
        t.tags?.some(tag => tag.name.toLowerCase().includes(q)) ||
        t.notes?.toLowerCase().includes(q)
      if (!match) return false
    }
    if (activeTab === 'upcoming') {
      const s = getDueStatus(t)
      return s === 'upcoming' || s === 'due_tomorrow'
    }
    if (activeTab === 'completed') return getDueStatus(t) === 'done_today'
    return true
  })

  const tasksByType = Object.fromEntries(
    FREQUENCIES.map(f => [
      f.type,
      sortRecurringList(displayTasks.filter(t => t.recurrence_type === f.type), sortBy),
    ])
  )

  function handleCardClick(task) { setEditingTask(task) }

  function handleModalUpdate(updatedRaw) {
    handleTaskUpdate(updatedRaw)
    setEditingTask(prev => {
      if (!prev) return prev
      const tags = updatedRaw.tags?.length ? updatedRaw.tags : prev.tags
      return { ...prev, ...updatedRaw, tags }
    })
  }

  async function handleModalClose() {
    const taskId = editingTask?.id
    setEditingTask(null)
    if (!taskId) return
    const { data } = await supabase
      .from('tasks')
      .select('*, task_tags(tags(id, name, color)), subtasks(id, is_done)')
      .eq('id', taskId).single()
    if (data) handleTaskUpdate(data)
  }

  const sortActive = sortBy !== 'default'

  if (loading) return (
    <div className="flex items-center justify-center h-full text-sm text-gray-400">Loading…</div>
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <div className="flex items-center gap-2.5">
          <h1 className="text-sm font-semibold text-gray-900 dark:text-white">Recurring</h1>
          <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full font-medium">
            {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">⌕</span>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search…"
              className="pl-7 pr-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:border-purple-400 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 w-40 transition-all focus:w-52"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
              >✕</button>
            )}
          </div>
          <button
            onClick={() => setAddingToColumn('daily')}
            className="text-xs px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-medium transition-all active:scale-95 shadow-sm hover:shadow-md whitespace-nowrap"
          >+ New Task</button>
        </div>
      </div>

      {/* Tab strip + Sort button */}
      <div className="flex items-center border-b border-gray-100 dark:border-gray-800 shrink-0">
        {/* Tabs — scrollable */}
        <div className="flex items-center flex-1 overflow-x-auto min-w-0" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <div className="flex items-center px-6 min-w-max">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={clsx(
                  'px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 -mb-px transition-all duration-200',
                  activeTab === tab.id
                    ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
                )}
              >
                {tab.label}
                {tab.id !== 'all' && (
                  <span className="ml-1.5 text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 px-1.5 py-0.5 rounded-full tabular-nums">
                    {tab.id === 'upcoming'
                      ? tasks.filter(t => { const s = getDueStatus(t); return s === 'upcoming' || s === 'due_tomorrow' }).length
                      : tasks.filter(t => getDueStatus(t) === 'done_today').length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Sort button — fixed right */}
        <div className="flex items-center px-3 py-2 shrink-0 border-l border-gray-100 dark:border-gray-800">
          <div className="relative">
            <button
              onClick={() => setSortOpen(o => !o)}
              className={clsx(
                'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-all',
                sortActive
                  ? 'border-purple-200 text-purple-600 bg-purple-50 dark:border-purple-800 dark:text-purple-400 dark:bg-purple-900/20'
                  : 'border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400 hover:border-gray-300 hover:text-gray-600 dark:hover:border-gray-600 dark:hover:text-gray-300',
              )}
            >
              <span>↕</span>
              <span>Sort{sortActive ? ` · ${SORT_OPTS.find(o => o.id === sortBy)?.label}` : ''}</span>
            </button>
            {sortOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-lg py-1 min-w-[152px] animate-pop-in">
                  {SORT_OPTS.map(o => (
                    <button
                      key={o.id}
                      onClick={() => { handleSortChange(o.id); setSortOpen(false) }}
                      className={clsx(
                        'w-full text-left flex items-center gap-2 px-3 py-2 text-xs transition-colors',
                        sortBy === o.id
                          ? 'text-purple-600 dark:text-purple-400 font-medium'
                          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800',
                      )}
                    >
                      <span className={clsx('w-3 text-center', sortBy === o.id ? 'text-purple-600 dark:text-purple-400' : 'opacity-0')}>✓</span>
                      {o.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Columns — key triggers re-mount → re-animates on tab switch */}
      <div key={tabKey} className="flex flex-col md:flex-row gap-4 md:gap-5 px-4 md:px-6 py-5 overflow-y-auto md:overflow-x-auto flex-1 animate-fade-up">
        {FREQUENCIES.map(f => (
          <RecurringColumn
            key={f.type}
            type={f.type}
            label={f.label}
            tasks={tasksByType[f.type]}
            onMarkDone={markDone}
            onCardClick={handleCardClick}
            onAddTask={addTask}
            isAdding={addingToColumn === f.type}
            onStartAdding={() => setAddingToColumn(f.type)}
            onStopAdding={() => setAddingToColumn(null)}
          />
        ))}
      </div>

      {editingTask && (
        <TaskModal
          task={editingTask}
          allTags={allTags}
          onClose={handleModalClose}
          onTaskUpdate={handleModalUpdate}
          onArchive={id => { handleArchive(id); setEditingTask(null) }}
        />
      )}

    </div>
  )
}
