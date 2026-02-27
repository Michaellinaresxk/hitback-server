-- =====================================================
-- HITBACK - Migración a Deezer + PostgreSQL
-- =====================================================
-- Esta migración crea las tablas necesarias para:
-- 1. Cachear tracks de Deezer
-- 2. Almacenar preguntas custom (lyrics, challenges)
-- 3. Evitar duplicados en sesiones
-- 4. Guardar historial de partidas

-- =====================================================
-- 1. TABLA DE TRACKS (Cache de Deezer)
-- =====================================================
CREATE TABLE IF NOT EXISTS tracks (
  id VARCHAR(50) PRIMARY KEY,              -- ID interno (formato: 'dz_{deezer_id}')
  deezer_id BIGINT UNIQUE,                 -- ID original de Deezer
  title VARCHAR(255) NOT NULL,
  artist VARCHAR(255) NOT NULL,
  album VARCHAR(255),
  year INTEGER,
  genre VARCHAR(50),                       -- ROCK, POP, LATIN, etc
  decade VARCHAR(10),                      -- 1970s, 1980s, 2010s, etc
  difficulty VARCHAR(20) DEFAULT 'MEDIUM', -- EASY, MEDIUM, HARD
  preview_url TEXT,                        -- URL de 30 segundos de Deezer
  preview_expires_at TIMESTAMP,            -- Cuando expira el preview
  cover_small TEXT,                        -- Album art pequeño
  cover_medium TEXT,                       -- Album art mediano
  cover_large TEXT,                        -- Album art grande
  explicit BOOLEAN DEFAULT FALSE,
  duration INTEGER,                        -- Duración en segundos
  rank INTEGER,                            -- Popularidad en Deezer
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE INDEX idx_tracks_genre ON tracks(genre);
CREATE INDEX idx_tracks_decade ON tracks(decade);
CREATE INDEX idx_tracks_difficulty ON tracks(difficulty);
CREATE INDEX idx_tracks_deezer_id ON tracks(deezer_id);
CREATE INDEX idx_tracks_year ON tracks(year);

-- =====================================================
-- 2. PREGUNTAS CUSTOM (Lyrics y Challenges)
-- =====================================================
CREATE TABLE IF NOT EXISTS custom_questions (
  id SERIAL PRIMARY KEY,
  track_id VARCHAR(50) REFERENCES tracks(id) ON DELETE CASCADE,
  question_type VARCHAR(20) NOT NULL,      -- 'lyrics' o 'challenge'
  question_text TEXT NOT NULL,
  answer TEXT NOT NULL,
  points INTEGER DEFAULT 1,
  hints JSONB DEFAULT '[]'::jsonb,         -- Array de hints
  challenge_type VARCHAR(50),              -- 'dance', 'sing', 'trivia', etc
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_custom_questions_track ON custom_questions(track_id);
CREATE INDEX idx_custom_questions_type ON custom_questions(question_type);

-- =====================================================
-- 3. SESIONES DE JUEGO (Persistencia)
-- =====================================================
CREATE TABLE IF NOT EXISTS game_sessions (
  id VARCHAR(50) PRIMARY KEY,
  status VARCHAR(20) DEFAULT 'created',    -- created, started, finished
  config JSONB NOT NULL,                   -- Géneros, décadas, dificultad, etc
  current_round INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  finished_at TIMESTAMP
);

-- =====================================================
-- 4. TRACKS USADOS POR SESIÓN (Evitar duplicados)
-- =====================================================
CREATE TABLE IF NOT EXISTS session_tracks (
  session_id VARCHAR(50) REFERENCES game_sessions(id) ON DELETE CASCADE,
  track_id VARCHAR(50) REFERENCES tracks(id),
  round_number INTEGER NOT NULL,
  used_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (session_id, track_id)
);

CREATE INDEX idx_session_tracks_session ON session_tracks(session_id);
CREATE INDEX idx_session_tracks_track ON session_tracks(track_id);

-- =====================================================
-- 5. JUGADORES Y PUNTUACIONES (Historial)
-- =====================================================
CREATE TABLE IF NOT EXISTS session_players (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(50) REFERENCES game_sessions(id) ON DELETE CASCADE,
  player_id VARCHAR(50) NOT NULL,
  player_name VARCHAR(100) NOT NULL,
  final_score INTEGER DEFAULT 0,
  correct_answers INTEGER DEFAULT 0,
  wrong_answers INTEGER DEFAULT 0,
  combos_achieved INTEGER DEFAULT 0,
  power_cards_used INTEGER DEFAULT 0,
  tokens_used JSONB DEFAULT '[]'::jsonb,   -- Array de tokens usados
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_session_players_session ON session_players(session_id);
CREATE INDEX idx_session_players_player ON session_players(player_id);

-- =====================================================
-- 6. HISTORIAL DE RONDAS (Analytics)
-- =====================================================
CREATE TABLE IF NOT EXISTS round_history (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(50) REFERENCES game_sessions(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  track_id VARCHAR(50) REFERENCES tracks(id),
  question_type VARCHAR(20),               -- song, artist, decade, etc
  winner_player_id VARCHAR(50),
  points_awarded INTEGER,
  bets_placed JSONB DEFAULT '[]'::jsonb,   -- Array de apuestas
  power_cards_used JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_round_history_session ON round_history(session_id);
CREATE INDEX idx_round_history_track ON round_history(track_id);

-- =====================================================
-- 7. POWER CARDS INVENTORY (Persistencia)
-- =====================================================
CREATE TABLE IF NOT EXISTS player_power_cards (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(50) REFERENCES game_sessions(id) ON DELETE CASCADE,
  player_id VARCHAR(50) NOT NULL,
  card_id VARCHAR(50) NOT NULL,            -- power_hit_steal_001, etc
  card_type VARCHAR(20) NOT NULL,          -- hit_steal, stop, replay, etc
  acquired_at TIMESTAMP DEFAULT NOW(),
  used_at TIMESTAMP,
  is_active BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_player_power_cards_session ON player_power_cards(session_id, player_id);

-- =====================================================
-- 8. FUNCIONES AUXILIARES
-- =====================================================

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para tracks
CREATE TRIGGER update_tracks_updated_at
  BEFORE UPDATE ON tracks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 9. VISTAS ÚTILES
-- =====================================================

-- Vista de tracks más populares
CREATE OR REPLACE VIEW popular_tracks AS
SELECT
  t.*,
  COUNT(st.track_id) as times_used
FROM tracks t
LEFT JOIN session_tracks st ON t.id = st.track_id
GROUP BY t.id
ORDER BY times_used DESC, t.rank DESC;

-- Vista de estadísticas de sesión
CREATE OR REPLACE VIEW session_stats AS
SELECT
  gs.id as session_id,
  gs.status,
  gs.current_round,
  COUNT(DISTINCT sp.player_id) as player_count,
  COUNT(DISTINCT st.track_id) as tracks_played,
  MAX(sp.final_score) as highest_score,
  gs.started_at,
  gs.finished_at,
  EXTRACT(EPOCH FROM (gs.finished_at - gs.started_at))/60 as duration_minutes
FROM game_sessions gs
LEFT JOIN session_players sp ON gs.id = sp.session_id
LEFT JOIN session_tracks st ON gs.id = st.session_id
GROUP BY gs.id;

-- =====================================================
-- 10. COMENTARIOS Y DOCUMENTACIÓN
-- =====================================================

COMMENT ON TABLE tracks IS 'Cache de tracks obtenidos de Deezer API';
COMMENT ON TABLE custom_questions IS 'Preguntas personalizadas (lyrics, challenges) creadas manualmente';
COMMENT ON TABLE game_sessions IS 'Sesiones de juego persistentes';
COMMENT ON TABLE session_tracks IS 'Tracks usados en cada sesión para evitar duplicados';
COMMENT ON TABLE session_players IS 'Jugadores participantes y sus estadísticas finales';
COMMENT ON TABLE round_history IS 'Historial detallado de cada ronda jugada';
COMMENT ON TABLE player_power_cards IS 'Inventario de PowerCards de cada jugador';

-- =====================================================
-- 11. DATOS SEED INICIALES (Opcional)
-- =====================================================

-- Géneros disponibles en Deezer
INSERT INTO tracks (id, title, artist, genre, decade, difficulty, deezer_id)
VALUES
  ('seed_001', 'Example Track 1', 'Example Artist', 'ROCK', '2000s', 'EASY', 1),
  ('seed_002', 'Example Track 2', 'Example Artist', 'POP', '2010s', 'MEDIUM', 2)
ON CONFLICT DO NOTHING;

-- =====================================================
-- FIN DE LA MIGRACIÓN
-- =====================================================
