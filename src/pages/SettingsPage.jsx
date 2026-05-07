import { useState, useEffect } from 'react'
import clsx from 'clsx'
import { Sun, Monitor, Moon, LogOut, Bell, Tag, Palette, LayoutGrid, User, AlertTriangle, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { sendNtfyNotification } from '../lib/notifications'

const COLORS = ['#7C3AED','#2563EB','#0891B2','#059669','#D97706','#DC2626','#DB2777','#9CA3AF']

function applyTheme(t) {
  const root = document.documentElement
  if (t === 'dark') root.classList.add('dark')
  else if (t === 'light') root.classList.remove('dark')
  else root.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches)
  localStorage.setItem('theme', t)
}

function Card({ children, className }) {
  return (
    <div className={clsx('bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden', className)}>
      {children}
    </div>
  )
}

function CardHeader({ icon: Icon, title, color = 'text-purple-600 dark:text-purple-400' }) {
  return (
    <div className="flex items-center gap-2 px-5 pt-5 pb-1">
      <Icon size={16} strokeWidth={2} className={clsx('shrink-0', color)} />
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h2>
    </div>
  )
}

function ThemePreview({ id, label, active, onClick }) {
  const isDark = id === 'dark'
  const isSystem = id === 'system'
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex-1 rounded-xl overflow-hidden border-2 transition-all',
        active
          ? 'border-purple-500 shadow-sm shadow-purple-100 dark:shadow-purple-900/30'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
      )}
    >
      {/* Mini UI mockup */}
      <div className={clsx('p-2.5 space-y-1.5', isDark ? 'bg-gray-900' : isSystem ? 'bg-gradient-to-br from-white to-gray-800' : 'bg-gray-50')}>
        <div className="flex gap-1.5 h-10">
          <div className={clsx('w-6 rounded-md shrink-0', isDark ? 'bg-gray-800' : isSystem ? 'bg-gray-700' : 'bg-white border border-gray-200')} />
          <div className="flex-1 space-y-1.5 pt-0.5">
            <div className={clsx('h-2 rounded-sm w-3/4', isDark ? 'bg-gray-700' : isSystem ? 'bg-gray-600' : 'bg-gray-200')} />
            <div className={clsx('h-2 rounded-sm w-1/2', isDark ? 'bg-gray-700' : isSystem ? 'bg-gray-600' : 'bg-gray-200')} />
            <div className={clsx('h-2 rounded-sm w-2/3', isDark ? 'bg-gray-800' : isSystem ? 'bg-gray-700' : 'bg-gray-100')} />
          </div>
        </div>
      </div>
      <div className={clsx(
        'text-xs font-medium py-1.5 text-center border-t',
        isDark
          ? 'bg-gray-900 text-gray-400 border-gray-800'
          : isSystem
            ? 'bg-gray-100 text-gray-500 border-gray-200'
            : 'bg-white text-gray-500 border-gray-100',
        active && '!text-purple-600 dark:!text-purple-400',
      )}>
        {label}
      </div>
    </button>
  )
}

function ColorDots({ selected, onChange }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {COLORS.map(c => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className="w-4 h-4 rounded-full transition-transform hover:scale-110 shrink-0"
          style={{ backgroundColor: c, outline: selected === c ? `2px solid ${c}` : 'none', outlineOffset: 2 }}
        />
      ))}
    </div>
  )
}

export default function SettingsPage({ session }) {
  const [loading, setLoading]             = useState(true)
  const [theme, setThemeState]            = useState(localStorage.getItem('theme') || 'system')
  const [defaultFilter, setDefaultFilter] = useState(localStorage.getItem('tracku_board_filter') || 'all')
  const [tags, setTags]                   = useState([])
  const [editingTagId, setEditingTagId]   = useState(null)
  const [editForm, setEditForm]           = useState({ name: '', color: '' })
  const [deletingTagId, setDeletingTagId] = useState(null)
  const [newTag, setNewTag]               = useState(null)
  const [ntfyTopic, setNtfyTopic]         = useState('')
  const [ntfySaved, setNtfySaved]         = useState(false)
  const [testing, setTesting]             = useState(false)
  const [signingOut, setSigningOut]       = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('user_settings').select('ntfy_topic, theme').eq('user_id', session.user.id).maybeSingle(),
      supabase.from('tags').select('*').order('position', { ascending: true, nullsFirst: false }).order('name'),
    ]).then(([{ data: settings }, { data: tagData }]) => {
      if (settings?.ntfy_topic) setNtfyTopic(settings.ntfy_topic)
      if (settings?.theme) {
        // localStorage is authoritative for this device — only use DB on a fresh device
        if (!localStorage.getItem('theme')) {
          setThemeState(settings.theme)
          applyTheme(settings.theme)
        }
        // else: useState already initialized from localStorage, don't override
      }
      setTags(tagData || [])
      setLoading(false)
    })
  }, [session.user.id])

  async function handleThemeChange(t) {
    setThemeState(t)
    applyTheme(t)
    supabase.from('user_settings').upsert(
      { user_id: session.user.id, theme: t, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
  }

  function handleDefaultFilterChange(id) {
    setDefaultFilter(id)
    localStorage.setItem('tracku_board_filter', id)
  }

  function startEdit(tag) {
    setEditingTagId(tag.id)
    setEditForm({ name: tag.name, color: tag.color })
    setDeletingTagId(null)
    setNewTag(null)
  }

  async function saveEdit(tagId) {
    const name = editForm.name.trim()
    if (!name) return
    await supabase.from('tags').update({ name, color: editForm.color }).eq('id', tagId)
    setTags(prev => prev.map(t => t.id === tagId ? { ...t, name, color: editForm.color } : t))
    setEditingTagId(null)
  }

  async function deleteTag(tagId) {
    await supabase.from('task_tags').delete().eq('tag_id', tagId)
    await supabase.from('tags').delete().eq('id', tagId)
    setTags(prev => prev.filter(t => t.id !== tagId))
    setDeletingTagId(null)
  }

  async function createTag() {
    const name = newTag?.name?.trim()
    if (!name) { setNewTag(null); return }
    const color = newTag.color || '#7C3AED'
    const { data } = await supabase.from('tags').insert({ name, color, user_id: session.user.id }).select().single()
    if (data) setTags(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    setNewTag(null)
  }

  async function saveNtfy() {
    await supabase.from('user_settings').upsert(
      { user_id: session.user.id, ntfy_topic: ntfyTopic.trim() || null, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
    setNtfySaved(true)
    setTimeout(() => setNtfySaved(false), 2000)
  }

  async function testNotification() {
    const topic = ntfyTopic.trim()
    if (!topic) return
    setTesting(true)
    const ok = await sendNtfyNotification(topic, 'TrackU Test', 'Your deadline notifications are working!')
    setTesting(false)
    if (!ok) alert('Failed — check the topic name and try again.')
  }

  async function handleSignOut() {
    setSigningOut(true)
    await supabase.auth.signOut()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full text-sm text-gray-400">Loading…</div>
  )

  const allFilterOpts = [{ id: 'all', name: 'All Tasks', color: '#9CA3AF' }, ...tags]

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50 dark:bg-gray-950">

      {/* Page header */}
      <div className="px-8 pt-6 pb-4 shrink-0">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Manage your workspace preferences and account</p>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-8">
        <div className="space-y-3 max-w-5xl">

          {/* ── Row 1: Appearance + Default View ── */}
          <div className="grid grid-cols-2 gap-3">

            {/* Appearance */}
            <Card>
              <CardHeader icon={Palette} title="Appearance" />
              <div className="px-5 pt-3 pb-5">
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Interface theme</p>
                <div className="flex gap-3">
                  <ThemePreview id="light"  label="Light"  active={theme === 'light'}  onClick={() => handleThemeChange('light')}  />
                  <ThemePreview id="dark"   label="Dark"   active={theme === 'dark'}   onClick={() => handleThemeChange('dark')}   />
                  <ThemePreview id="system" label="System" active={theme === 'system'} onClick={() => handleThemeChange('system')} />
                </div>
              </div>
            </Card>

            {/* Default View */}
            <Card>
              <CardHeader icon={LayoutGrid} title="Default Tag View" />
              <div className="px-5 pt-3 pb-5">
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Board opens to this tag filter on every visit</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {allFilterOpts.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => handleDefaultFilterChange(opt.id)}
                      className={clsx(
                        'flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs transition-all text-left',
                        defaultFilter === opt.id
                          ? 'bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 font-medium'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800',
                      )}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />
                      <span className="truncate">{opt.name}</span>
                      {defaultFilter === opt.id && (
                        <span className="ml-auto w-3.5 h-3.5 rounded-full bg-purple-600 flex items-center justify-center text-white text-[9px] shrink-0">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          {/* ── Row 2: Labels + Notifications ── */}
          <div className="grid grid-cols-2 gap-3">

            {/* Labels */}
            <Card>
              <CardHeader icon={Tag} title=" Manage Tags" />
              <div className="px-5 pt-3 pb-4">
                <div className="space-y-0.5">
                  {tags.map(tag => (
                    <div key={tag.id}>
                      {editingTagId === tag.id ? (
                        /* Edit inline */
                        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 space-y-2.5 border border-purple-200 dark:border-purple-800">
                          <input
                            autoFocus
                            value={editForm.name}
                            onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(tag.id); if (e.key === 'Escape') setEditingTagId(null) }}
                            className="w-full text-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-gray-900 dark:text-white outline-none focus:border-purple-400"
                          />
                          <div className="flex items-center gap-2">
                            <ColorDots selected={editForm.color} onChange={c => setEditForm(p => ({ ...p, color: c }))} />
                            <div className="flex gap-1.5 ml-auto shrink-0">
                              <button onClick={() => saveEdit(tag.id)} className="text-xs px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium transition-all">Save</button>
                              <button onClick={() => setEditingTagId(null)} className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all">Cancel</button>
                            </div>
                          </div>
                        </div>
                      ) : deletingTagId === tag.id ? (
                        /* Delete confirm */
                        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                          <span className="flex-1 text-xs text-red-600 dark:text-red-400">Delete "{tag.name}"?</span>
                          <button onClick={() => deleteTag(tag.id)} className="text-xs px-2.5 py-1 rounded-lg bg-red-500 hover:bg-red-600 text-white font-medium transition-all">Yes</button>
                          <button onClick={() => setDeletingTagId(null)} className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-white dark:hover:bg-gray-800 transition-all">No</button>
                        </div>
                      ) : (
                        /* Normal row */
                        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/60 group transition-colors">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                          <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{tag.name}</span>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => startEdit(tag)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
                              title="Edit"
                            >
                              <Pencil size={12} strokeWidth={2} />
                            </button>
                            <button
                              onClick={() => { setDeletingTagId(tag.id); setEditingTagId(null) }}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                              title="Delete"
                            >
                              <Trash2 size={12} strokeWidth={2} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {tags.length === 0 && !newTag && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 px-3 py-2">No labels yet.</p>
                  )}

                  {/* New tag form */}
                  {newTag ? (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 space-y-2.5 mt-1 border border-purple-200 dark:border-purple-800">
                      <input
                        autoFocus
                        value={newTag.name}
                        onChange={e => setNewTag(p => ({ ...p, name: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') createTag(); if (e.key === 'Escape') setNewTag(null) }}
                        placeholder="Label name…"
                        className="w-full text-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-gray-900 dark:text-white outline-none focus:border-purple-400 placeholder-gray-300"
                      />
                      <div className="flex items-center gap-2">
                        <ColorDots selected={newTag.color} onChange={c => setNewTag(p => ({ ...p, color: c }))} />
                        <div className="flex gap-1.5 ml-auto shrink-0">
                          <button onClick={createTag} className="text-xs px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium transition-all">Add</button>
                          <button onClick={() => setNewTag(null)} className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all">Cancel</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setNewTag({ name: '', color: '#7C3AED' }); setEditingTagId(null); setDeletingTagId(null) }}
                      className="mt-1 w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-purple-600 dark:text-purple-400 border border-dashed border-purple-200 dark:border-purple-800 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/20 transition-all"
                    >
                      <span className="text-base leading-none">+</span> New Label
                    </button>
                  )}
                </div>
              </div>
            </Card>

            {/* Notifications */}
            <Card>
              <CardHeader icon={Bell} title="Notifications" />
              <div className="px-5 pt-3 pb-5 space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1.5">ntfy.sh Endpoint</label>
                  <input
                    value={ntfyTopic}
                    onChange={e => setNtfyTopic(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveNtfy()}
                    placeholder="your-private-topic"
                    className="w-full text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-gray-900 dark:text-white outline-none focus:border-purple-400 transition-colors placeholder-gray-300 dark:placeholder-gray-600"
                  />
                </div>

                <div className="flex items-center justify-between py-3 border-t border-gray-100 dark:border-gray-800">
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Push Notifications</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Real-time deadline alerts on your phone</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={saveNtfy} className="text-xs px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium transition-all active:scale-95">
                      {ntfySaved ? '✓ Saved' : 'Save'}
                    </button>
                    {ntfyTopic.trim() && (
                      <button onClick={testNotification} disabled={testing} className="text-xs px-3.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all active:scale-95 disabled:opacity-50">
                        {testing ? '…' : 'Test'}
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Install the <a href="https://ntfy.sh" target="_blank" rel="noopener noreferrer" className="text-purple-500 hover:underline">ntfy app</a> and subscribe to your topic. Treat it like a password.
                </p>
              </div>
            </Card>
          </div>

          {/* ── Row 3: Account + Danger Zone ── */}
          <div className="grid grid-cols-2 gap-3">

            <Card>
              <CardHeader icon={User} title="Account Details" />
              <div className="px-5 pt-3 pb-5">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-sm font-bold text-white shrink-0">
                    {session.user.email?.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">Email Address</p>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{session.user.email}</p>
                  </div>
                  <button
                    onClick={handleSignOut}
                    disabled={signingOut}
                    className="flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all active:scale-95 disabled:opacity-50 shrink-0"
                  >
                    <LogOut size={13} strokeWidth={2} />
                    {signingOut ? 'Signing out…' : 'Sign out'}
                  </button>
                </div>
              </div>
            </Card>

            <Card className="border-red-200 dark:border-red-900/40">
              <CardHeader icon={AlertTriangle} title="Danger Zone" color="text-red-500" />
              <div className="px-5 pt-3 pb-5">
                <div className="flex items-center gap-4">
                  <p className="flex-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    Permanently delete your account and all workspace data. This cannot be undone.
                  </p>
                  <button
                    onClick={() => {
                      if (window.confirm('This will permanently delete your account and all data. Are you sure?')) {
                        supabase.rpc('delete_user').then(() => supabase.auth.signOut())
                      }
                    }}
                    className="text-xs font-medium px-3.5 py-2 rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all active:scale-95 whitespace-nowrap shrink-0"
                  >
                    Delete Account
                  </button>
                </div>
              </div>
            </Card>

          </div>
        </div>
      </div>
    </div>
  )
}
