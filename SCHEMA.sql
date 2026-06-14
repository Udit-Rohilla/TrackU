-- ============================================================
--  TrackU — Full Database Schema
--  Run this in Supabase SQL Editor to set up from scratch.
--  Tables are listed in dependency order (no forward references).
-- ============================================================


-- ────────────────────────────────────────────────────────────
--  1. TAGS
--     User-defined labels that can be applied to tasks.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tags (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  color      TEXT,                          -- hex color, e.g. '#7C3AED'
  position   INTEGER,                       -- manual sort order
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tags: user owns rows"
  ON tags FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags (user_id);


-- ────────────────────────────────────────────────────────────
--  2. TASKS
--     Core task records. Recurring config stored as JSONB.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tasks (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Content
  title                     TEXT        NOT NULL,
  notes                     TEXT,
  color                     TEXT,                          -- hex color accent

  -- State
  status                    TEXT        NOT NULL DEFAULT 'not_started',
    -- values: not_started | in_progress | on_hold | done
  priority                  TEXT        NOT NULL DEFAULT 'medium',
    -- values: urgent | high | medium | low
  archived                  BOOLEAN     NOT NULL DEFAULT false,

  -- Deadline (one-time tasks)
  deadline                  TIMESTAMPTZ,
  deadline_notified         BOOLEAN     NOT NULL DEFAULT false,
  deadline_overdue_notified BOOLEAN     NOT NULL DEFAULT false,

  -- Recurring
  is_recurring              BOOLEAN     NOT NULL DEFAULT false,
  recurrence_type           TEXT,
    -- values: daily | weekly | monthly | yearly
  recurrence_config         JSONB,
    -- weekly:  { "days": [0,1,2,3,4,5,6] }   (0=Sun … 6=Sat)
    -- monthly: { "day": 15 }
    -- yearly:  { "month": 6, "day": 14 }
  recurring_reminder_minutes INTEGER,
    -- minutes since midnight, e.g. 570 = 09:30
    -- used by the notification system for hourly pre/post reminders

  -- Timer
  timer_started_at          TIMESTAMPTZ,
  time_spent_seconds        INTEGER     NOT NULL DEFAULT 0,

  -- Streak (recurring tasks)
  last_completed_at         TIMESTAMPTZ,
  last_completion_note      TEXT,
  streak_count              INTEGER     NOT NULL DEFAULT 0,

  -- Sort
  position                  INTEGER,

  -- Timestamps
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks: user owns rows"
  ON tasks FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_tasks_user_id   ON tasks (user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status    ON tasks (user_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline  ON tasks (user_id, deadline) WHERE deadline IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_recurring ON tasks (user_id, is_recurring) WHERE is_recurring = true;
CREATE INDEX IF NOT EXISTS idx_tasks_archived  ON tasks (user_id, archived);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER tasks_set_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ────────────────────────────────────────────────────────────
--  3. TASK_TAGS  (junction table)
--     Many-to-many between tasks and tags.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS task_tags (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id  UUID NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  UNIQUE (task_id, tag_id)
);

ALTER TABLE task_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_tags: user owns rows"
  ON task_tags FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM tasks
      WHERE tasks.id = task_tags.task_id
        AND tasks.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks
      WHERE tasks.id = task_tags.task_id
        AND tasks.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_task_tags_task_id ON task_tags (task_id);
CREATE INDEX IF NOT EXISTS idx_task_tags_tag_id  ON task_tags (tag_id);


-- ────────────────────────────────────────────────────────────
--  4. SUBTASKS
--     Checklist items nested inside a task.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subtasks (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL,
  is_done    BOOLEAN     NOT NULL DEFAULT false,
  position   INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subtasks: user owns rows"
  ON subtasks FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON subtasks (task_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_user_id ON subtasks (user_id);


-- ────────────────────────────────────────────────────────────
--  5. TIME_LOGS
--     One row per timer session (start → stop on in_progress).
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS time_logs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id          UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at       TIMESTAMPTZ NOT NULL,
  ended_at         TIMESTAMPTZ NOT NULL,
  duration_seconds INTEGER     NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE time_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "time_logs: user owns rows"
  ON time_logs FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_time_logs_task_id ON time_logs (task_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_user_id ON time_logs (user_id);


-- ────────────────────────────────────────────────────────────
--  6. RECURRING_HISTORY
--     One row per completed recurrence occurrence.
--     Used by the calendar to show "done" dots on past days,
--     and by the notification system to know if done today.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS recurring_history (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  due_at       TIMESTAMPTZ,               -- when the occurrence was scheduled
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  was_completed BOOLEAN    NOT NULL DEFAULT true,
  note         TEXT,                      -- optional completion note
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE recurring_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recurring_history: user owns rows"
  ON recurring_history FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_recurring_history_task_id      ON recurring_history (task_id);
CREATE INDEX IF NOT EXISTS idx_recurring_history_user_id      ON recurring_history (user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_history_completed_at ON recurring_history (user_id, completed_at DESC);


-- ────────────────────────────────────────────────────────────
--  7. USER_SETTINGS
--     One row per user. Upserted, never inserted directly.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_settings (
  user_id    UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ntfy_topic TEXT,                        -- ntfy.sh topic for push notifications
  theme      TEXT        NOT NULL DEFAULT 'system',
    -- values: light | dark | system
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_settings: user owns rows"
  ON user_settings FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ────────────────────────────────────────────────────────────
--  8. REALTIME
--     Enable Supabase Realtime on the tables used for
--     cross-device sync. Run in SQL Editor or enable via
--     Supabase Dashboard → Database → Replication.
-- ────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE subtasks;
ALTER PUBLICATION supabase_realtime ADD TABLE recurring_history;


-- ────────────────────────────────────────────────────────────
--  INDIVIDUAL ALTER STATEMENTS
--  Use these if you already have the schema and just need
--  to add a specific column that was added later.
-- ────────────────────────────────────────────────────────────

-- Added: recurring reminder time (minutes since midnight)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurring_reminder_minutes INTEGER;
