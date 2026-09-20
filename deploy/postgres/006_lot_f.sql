-- GawJaay V2 — migration 006_lot_f (portage PostgreSQL 1:1 de 006_lot_f.ts)
-- Contenu : assistant IA/actions contrôlées

CREATE TABLE IF NOT EXISTS ai_conversations (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        storeId TEXT NOT NULL,
        createdAt TEXT DEFAULT (now()::text),
        updatedAt TEXT DEFAULT (now()::text),
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (storeId) REFERENCES stores(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_ai_conv_user ON ai_conversations(userId, storeId, updatedAt);

      CREATE TABLE IF NOT EXISTS ai_messages (
        id TEXT PRIMARY KEY,
        conversationId TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('USER','ASSISTANT')),
        content TEXT NOT NULL,
        intent TEXT,
        dataJson TEXT,
        createdAt TEXT DEFAULT (now()::text),
        FOREIGN KEY (conversationId) REFERENCES ai_conversations(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_ai_msg_conv ON ai_messages(conversationId, createdAt);

      CREATE TABLE IF NOT EXISTS ai_action_requests (
        id TEXT PRIMARY KEY,
        storeId TEXT NOT NULL,
        userId TEXT NOT NULL,
        actionType TEXT NOT NULL,
        paramsJson TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','CONFIRMED','REJECTED','EXECUTED','FAILED','EXPIRED')),
        resultJson TEXT,
        expiresAt TEXT,
        confirmedAt TEXT,
        executedAt TEXT,
        createdAt TEXT DEFAULT (now()::text),
        FOREIGN KEY (storeId) REFERENCES stores(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_ai_action_store ON ai_action_requests(storeId, status, createdAt);
