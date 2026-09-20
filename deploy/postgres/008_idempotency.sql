-- GawJaay V2 — migration 008 : idempotence des opérations financières (§21)
-- Header Idempotency-Key sur POST /orders et POST /sales : rejoue la 1re réponse
-- (aucune double écriture). Sans header : comportement inchangé.

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  userid TEXT NOT NULL DEFAULT '',
  status INTEGER NOT NULL,
  responsejson TEXT NOT NULL,
  createdat TEXT DEFAULT now()::text,
  PRIMARY KEY (key, endpoint, userid)
);
