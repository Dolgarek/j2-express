-- ─────────────────────────────────────────────────────────────────────────────
-- GG League · schéma de la base (le même qu'au J1, plus les comptes utilisateurs).
-- Rejoué par « make db-reset » : les tables sont supprimées puis recréées.
-- Les colonnes sont en snake_case (convention SQL) ; l'API renvoie du camelCase.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE game (
  id        SERIAL PRIMARY KEY,
  name      VARCHAR(100) NOT NULL UNIQUE,
  genre     VARCHAR(20)  NOT NULL CHECK (genre IN ('moba', 'fps', 'fighting', 'sports', 'racing', 'strategy')),
  team_size INTEGER      NOT NULL CHECK (team_size BETWEEN 1 AND 10)
);

CREATE TABLE team (
  id      SERIAL PRIMARY KEY,
  name    VARCHAR(50) NOT NULL UNIQUE,
  tag     VARCHAR(5)  NOT NULL UNIQUE,
  country CHAR(2)     NOT NULL
);

CREATE TABLE player (
  id         SERIAL PRIMARY KEY,
  nickname   VARCHAR(30) NOT NULL UNIQUE,
  country    CHAR(2)     NOT NULL,
  role       VARCHAR(30),
  rating     INTEGER     NOT NULL DEFAULT 1000 CHECK (rating BETWEEN 0 AND 3000),
  birth_date DATE,
  -- une équipe supprimée rend ses joueurs « agents libres »
  team_id    INTEGER REFERENCES team (id) ON DELETE SET NULL
);

-- TP partie 1 : un match entre deux équipes ; joué quand played_at est renseigné.
CREATE TABLE match (
  id        SERIAL PRIMARY KEY,
  team_a_id INTEGER NOT NULL REFERENCES team (id) ON DELETE CASCADE,
  team_b_id INTEGER NOT NULL REFERENCES team (id) ON DELETE CASCADE,
  score_a   INTEGER,
  score_b   INTEGER,
  winner_id INTEGER REFERENCES team (id) ON DELETE SET NULL,
  played_at TIMESTAMPTZ,
  CHECK (team_a_id <> team_b_id)
);

-- J2 : les comptes. « user » est un mot réservé en SQL, d'où les guillemets (partout, y compris dans le code).
-- password contient le HACHAGE bcrypt du mot de passe (60 caractères), jamais le mot de passe lui-même.
CREATE TABLE "user" (
  id         SERIAL PRIMARY KEY,
  email      VARCHAR(255) NOT NULL UNIQUE,
  password   VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Bonus 13 (refresh token). On stocke le sha256 du jeton, pas le jeton : une fuite de la base ne donne pas de sessions.
CREATE TABLE refresh_token (
  token_hash CHAR(64)    PRIMARY KEY,
  user_id    INTEGER     NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
