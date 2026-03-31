-- ═══════════════════════════════════════════════════════════════
-- Quiz Elimination Game — Supabase Schema
-- Run this entire file in: Supabase Dashboard → SQL Editor → New query
-- ═══════════════════════════════════════════════════════════════

-- ── Tables ──────────────────────────────────────────────────────

CREATE TABLE games (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status             TEXT NOT NULL DEFAULT 'LOBBY'
                       CHECK (status IN ('LOBBY','IN_PROGRESS','FINAL_QUESTION','COMPLETE')),
  current_question_index INTEGER NOT NULL DEFAULT 0,
  question_started_at    TIMESTAMPTZ,
  winner_player_id       UUID,          -- filled when status = COMPLETE
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE questions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id        UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  question_index INTEGER NOT NULL,
  question_text  TEXT NOT NULL,
  option_a       TEXT NOT NULL,
  option_b       TEXT NOT NULL,
  option_c       TEXT NOT NULL,
  option_d       TEXT NOT NULL,
  correct_answer CHAR(1) NOT NULL CHECK (correct_answer IN ('A','B','C','D')),
  UNIQUE (game_id, question_index)
);

CREATE TABLE players (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id      UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  is_eliminated BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE answers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  question_id   UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer_given  CHAR(1) NOT NULL CHECK (answer_given IN ('A','B','C','D')),
  is_correct    BOOLEAN NOT NULL,
  answered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, question_id)   -- prevent double-submission
);

-- Forward-reference FK (games.winner_player_id → players.id)
ALTER TABLE games
  ADD CONSTRAINT fk_winner_player
  FOREIGN KEY (winner_player_id) REFERENCES players(id);

-- ── Row-Level Security ───────────────────────────────────────────

ALTER TABLE games     ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE players   ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers   ENABLE ROW LEVEL SECURITY;

-- Everyone (including anonymous players on their phones) can read all tables.
-- All writes go through API routes that use the service-role key (bypasses RLS).

CREATE POLICY "public_read_games"
  ON games FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "public_read_questions"
  ON questions FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "public_read_players"
  ON players FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "public_read_answers"
  ON answers FOR SELECT TO anon, authenticated USING (true);

-- ── Realtime ────────────────────────────────────────────────────
-- Enables live updates on player phones and the master screen.

ALTER PUBLICATION supabase_realtime ADD TABLE games;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
ALTER PUBLICATION supabase_realtime ADD TABLE answers;

-- (questions don't change during gameplay so no Realtime needed)


-- ═══════════════════════════════════════════════════════════════
-- MIGRATION — Higher/Lower bonus round (run AFTER initial schema)
-- Supabase Dashboard → SQL Editor → New query
-- ═══════════════════════════════════════════════════════════════

-- 1. Drop the old status CHECK constraint and re-add with new values
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_status_check;
ALTER TABLE games
  ADD CONSTRAINT games_status_check
  CHECK (status IN ('LOBBY','IN_PROGRESS','FINAL_QUESTION','COMPLETE','HIGHER_LOWER','APRIL_FOOL'));

-- 2. Add bonus columns
ALTER TABLE games ADD COLUMN IF NOT EXISTS bonus_egg_count    INTEGER;
ALTER TABLE games ADD COLUMN IF NOT EXISTS bonus_shown_number INTEGER;
