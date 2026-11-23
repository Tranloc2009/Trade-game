# TRADING EMPIRE — Database Migration Handoff (PostgreSQL)

> **Current Phase:** In-Memory Authoritative Server (`DEMO — TEMPORARY SERVER`).  
> **Target Production Stack:** PostgreSQL 16+ (primary OLTP + Double-Entry Ledger) + Redis 7+ (presence, pub/sub, rate limiting, order-book read cache).

This document defines all **24 relational tables**, keys, check constraints, and indexes required to migrate `WORLD-01` from in-memory repositories (`shared/contracts/interfaces.ts`) to PostgreSQL without altering business logic.

---

## 1. Schema Conventions

- **Primary Keys:** `UUID` (or prefixed text IDs for compatibility with existing domain IDs).
- **Money Columns:** `BIGINT` storing integer centi-CR minor units (`1 CR = 100`). Never use `FLOAT` or `DOUBLE PRECISION` for balances or prices.
- **Quantities:** `NUMERIC(20, 4)` or `BIGINT` scaled integer.
- **Timestamps:** `TIMESTAMPTZ NOT NULL DEFAULT NOW()`.
- **Concurrency:** Use `SELECT ... FOR UPDATE` inside `SERIALIZABLE` or `READ COMMITTED` transactions with consistent lock ordering (`wallet_id ASC`, then `holding_id ASC`) to prevent deadlocks during order matching and atomic transfers.

---

## 2. Complete 24-Table PostgreSQL Schema

```sql
-- 1. users
CREATE TABLE users (
  id                TEXT PRIMARY KEY,
  email             TEXT UNIQUE,
  password_hash     TEXT,
  auth_provider     TEXT NOT NULL DEFAULT 'guest',
  role              TEXT NOT NULL DEFAULT 'player', -- player | moderator | admin
  is_banned         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. worlds
CREATE TABLE worlds (
  id                TEXT PRIMARY KEY,               -- e.g. WORLD-01
  name              TEXT NOT NULL,
  currency_code     TEXT NOT NULL DEFAULT 'CR',
  game_day          INTEGER NOT NULL DEFAULT 1,
  game_minute       INTEGER NOT NULL DEFAULT 600,   -- 0..1439
  macro_phase       TEXT NOT NULL DEFAULT 'EXPANSION',
  policy_rate_bps   INTEGER NOT NULL DEFAULT 450,
  savings_rate_bps  INTEGER NOT NULL DEFAULT 350,
  loan_rate_bps     INTEGER NOT NULL DEFAULT 850,
  central_bank_reserve_minor BIGINT NOT NULL DEFAULT 50000000000,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. players
CREATE TABLE players (
  id                TEXT PRIMARY KEY,
  user_id           TEXT REFERENCES users(id) ON DELETE SET NULL,
  world_id          TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  display_name      TEXT NOT NULL,
  player_type       TEXT NOT NULL DEFAULT 'HUMAN',  -- HUMAN | MARKET_MAKER | INVESTOR_BOT
  avatar_color      TEXT,
  entertainment_chips INTEGER NOT NULL DEFAULT 1000 CHECK (entertainment_chips >= 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (world_id, display_name)
);
CREATE INDEX idx_players_world_type ON players(world_id, player_type);

-- 4. wallets
CREATE TABLE wallets (
  id                TEXT PRIMARY KEY,
  world_id          TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  player_id         TEXT NOT NULL UNIQUE REFERENCES players(id) ON DELETE CASCADE,
  currency_code     TEXT NOT NULL DEFAULT 'CR',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. wallet_balances
CREATE TABLE wallet_balances (
  wallet_id         TEXT PRIMARY KEY REFERENCES wallets(id) ON DELETE CASCADE,
  available_minor   BIGINT NOT NULL DEFAULT 0 CHECK (available_minor >= 0),
  locked_minor      BIGINT NOT NULL DEFAULT 0 CHECK (locked_minor >= 0),
  version           BIGINT NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. assets
CREATE TABLE assets (
  id                TEXT PRIMARY KEY,
  world_id          TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  symbol            TEXT NOT NULL,
  name              TEXT NOT NULL,
  exchange          TEXT NOT NULL,                  -- ECX | ESE
  asset_class       TEXT NOT NULL,                  -- CRYPTO | STOCK
  sector            TEXT NOT NULL,
  tick_size_minor   BIGINT NOT NULL DEFAULT 1,
  lot_size          NUMERIC(20, 4) NOT NULL DEFAULT 1,
  reference_price_minor BIGINT NOT NULL CHECK (reference_price_minor > 0),
  last_price_minor  BIGINT NOT NULL CHECK (last_price_minor > 0),
  open_24h_minor    BIGINT NOT NULL CHECK (open_24h_minor > 0),
  high_24h_minor    BIGINT NOT NULL CHECK (high_24h_minor > 0),
  low_24h_minor     BIGINT NOT NULL CHECK (low_24h_minor > 0),
  volume_24h        NUMERIC(24, 4) NOT NULL DEFAULT 0,
  total_supply      NUMERIC(24, 4) NOT NULL,
  fundamentals_json JSONB,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (world_id, symbol)
);
CREATE INDEX idx_assets_exchange ON assets(world_id, exchange);

-- 7. asset_holdings
CREATE TABLE asset_holdings (
  id                TEXT PRIMARY KEY,
  world_id          TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  player_id         TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  asset_id          TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  available_qty     NUMERIC(24, 4) NOT NULL DEFAULT 0 CHECK (available_qty >= 0),
  locked_qty        NUMERIC(24, 4) NOT NULL DEFAULT 0 CHECK (locked_qty >= 0),
  avg_cost_minor    BIGINT NOT NULL DEFAULT 0 CHECK (avg_cost_minor >= 0),
  version           BIGINT NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, asset_id)
);
CREATE INDEX idx_holdings_player ON asset_holdings(player_id);

-- 8. orders
CREATE TABLE orders (
  id                TEXT PRIMARY KEY,
  world_id          TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  player_id         TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  asset_id          TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  symbol            TEXT NOT NULL,
  side              TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  order_type        TEXT NOT NULL CHECK (order_type IN ('LIMIT', 'MARKET')),
  time_in_force     TEXT NOT NULL CHECK (time_in_force IN ('GTC', 'IOC')),
  price_minor       BIGINT CHECK (price_minor IS NULL OR price_minor > 0),
  quantity          NUMERIC(24, 4) NOT NULL CHECK (quantity > 0),
  filled_quantity   NUMERIC(24, 4) NOT NULL DEFAULT 0 CHECK (filled_quantity >= 0),
  remaining_quantity NUMERIC(24, 4) NOT NULL CHECK (remaining_quantity >= 0),
  locked_minor      BIGINT NOT NULL DEFAULT 0 CHECK (locked_minor >= 0),
  status            TEXT NOT NULL CHECK (status IN ('OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELED', 'REJECTED')),
  idempotency_key   TEXT,
  sequence_no       BIGSERIAL NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, idempotency_key)
);
CREATE INDEX idx_orders_book ON orders(symbol, side, status, price_minor, sequence_no);
CREATE INDEX idx_orders_player ON orders(player_id, created_at DESC);

-- 9. trades
CREATE TABLE trades (
  id                TEXT PRIMARY KEY,
  world_id          TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  asset_id          TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  symbol            TEXT NOT NULL,
  buy_order_id      TEXT NOT NULL REFERENCES orders(id),
  sell_order_id     TEXT NOT NULL REFERENCES orders(id),
  buyer_id          TEXT NOT NULL REFERENCES players(id),
  seller_id         TEXT NOT NULL REFERENCES players(id),
  maker_order_id    TEXT NOT NULL REFERENCES orders(id),
  taker_order_id    TEXT NOT NULL REFERENCES orders(id),
  price_minor       BIGINT NOT NULL CHECK (price_minor > 0),
  quantity          NUMERIC(24, 4) NOT NULL CHECK (quantity > 0),
  notional_minor    BIGINT NOT NULL CHECK (notional_minor >= 0),
  maker_fee_minor   BIGINT NOT NULL CHECK (maker_fee_minor >= 0),
  taker_fee_minor   BIGINT NOT NULL CHECK (taker_fee_minor >= 0),
  executed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_trades_symbol_time ON trades(symbol, executed_at DESC);
CREATE INDEX idx_trades_buyer ON trades(buyer_id, executed_at DESC);
CREATE INDEX idx_trades_seller ON trades(seller_id, executed_at DESC);

-- 10. ledger_accounts
CREATE TABLE ledger_accounts (
  id                TEXT PRIMARY KEY,
  world_id          TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  account_type      TEXT NOT NULL, -- PLAYER_CASH | PLAYER_LOCKED | COMPANY_CASH | EXCHANGE_TREASURY | GOVERNMENT_TREASURY | CENTRAL_BANK_RESERVE | AUCTION_ESCROW | CORPORATE_DIVIDEND_POOL
  owner_id          TEXT,
  currency_code     TEXT NOT NULL DEFAULT 'CR',
  balance_minor     BIGINT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ledger_accounts_owner ON ledger_accounts(world_id, account_type, owner_id);

-- 11. ledger_entries (Immutable Append-Only Double-Entry Journal)
CREATE TABLE ledger_entries (
  id                TEXT PRIMARY KEY,
  transaction_id    TEXT NOT NULL,
  world_id          TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  account_id        TEXT NOT NULL REFERENCES ledger_accounts(id),
  entry_type        TEXT NOT NULL CHECK (entry_type IN ('DEBIT', 'CREDIT')),
  amount_minor      BIGINT NOT NULL CHECK (amount_minor > 0),
  reference_type    TEXT NOT NULL, -- TRADE | FEE | ORDER_LOCK | ORDER_REFUND | PROPERTY | AUCTION | COMPANY | BANK | DIVIDEND
  reference_id      TEXT NOT NULL,
  description       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ledger_tx ON ledger_entries(transaction_id);
CREATE INDEX idx_ledger_account_time ON ledger_entries(account_id, created_at DESC);

-- 12. market_candles
CREATE TABLE market_candles (
  id                BIGSERIAL PRIMARY KEY,
  world_id          TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  symbol            TEXT NOT NULL,
  timeframe         TEXT NOT NULL CHECK (timeframe IN ('1m', '5m', '15m', '1h', '4h', '1D')),
  bucket_time_sec   BIGINT NOT NULL,
  open_minor        BIGINT NOT NULL,
  high_minor        BIGINT NOT NULL,
  low_minor         BIGINT NOT NULL,
  close_minor       BIGINT NOT NULL,
  volume            NUMERIC(24, 4) NOT NULL DEFAULT 0,
  is_simulated_seed BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (world_id, symbol, timeframe, bucket_time_sec)
);
CREATE INDEX idx_candles_lookup ON market_candles(symbol, timeframe, bucket_time_sec DESC);

-- 13. properties
CREATE TABLE properties (
  id                TEXT PRIMARY KEY,
  world_id          TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  district          TEXT NOT NULL,
  property_type     TEXT NOT NULL,
  owner_player_id   TEXT REFERENCES players(id) ON DELETE SET NULL,
  valuation_minor   BIGINT NOT NULL CHECK (valuation_minor > 0),
  base_rent_minor   BIGINT NOT NULL CHECK (base_rent_minor >= 0),
  maintenance_minor BIGINT NOT NULL CHECK (maintenance_minor >= 0),
  tax_bps           INTEGER NOT NULL DEFAULT 100,
  occupancy_rate    NUMERIC(5, 4) NOT NULL DEFAULT 0.9000,
  image_key         TEXT NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_properties_owner ON properties(owner_player_id);

-- 14. property_listings
CREATE TABLE property_listings (
  id                TEXT PRIMARY KEY,
  property_id       TEXT NOT NULL UNIQUE REFERENCES properties(id) ON DELETE CASCADE,
  seller_player_id  TEXT REFERENCES players(id) ON DELETE SET NULL,
  asking_price_minor BIGINT NOT NULL CHECK (asking_price_minor > 0),
  status            TEXT NOT NULL CHECK (status IN ('ACTIVE', 'SOLD', 'CANCELED')),
  listed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. property_auctions
CREATE TABLE property_auctions (
  id                TEXT PRIMARY KEY,
  world_id          TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  property_id       TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  starting_bid_minor BIGINT NOT NULL CHECK (starting_bid_minor > 0),
  current_bid_minor BIGINT NOT NULL CHECK (current_bid_minor >= 0),
  min_increment_minor BIGINT NOT NULL CHECK (min_increment_minor > 0),
  highest_bidder_id TEXT REFERENCES players(id) ON DELETE SET NULL,
  status            TEXT NOT NULL CHECK (status IN ('ACTIVE', 'SETTLED', 'UNSOLD')),
  ends_at           TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_auctions_status_end ON property_auctions(status, ends_at);

-- 16. companies
CREATE TABLE companies (
  id                TEXT PRIMARY KEY,
  world_id          TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  founder_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  sector            TEXT NOT NULL,
  cash_minor        BIGINT NOT NULL DEFAULT 0 CHECK (cash_minor >= 0),
  asset_value_minor BIGINT NOT NULL DEFAULT 0 CHECK (asset_value_minor >= 0),
  capacity_level    INTEGER NOT NULL DEFAULT 1 CHECK (capacity_level >= 1),
  last_revenue_minor BIGINT NOT NULL DEFAULT 0,
  last_expense_minor BIGINT NOT NULL DEFAULT 0,
  last_profit_minor BIGINT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (world_id, name)
);
CREATE INDEX idx_companies_founder ON companies(founder_player_id);

-- 17. company_shareholders
CREATE TABLE company_shareholders (
  id                TEXT PRIMARY KEY,
  company_id        TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  player_id         TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  ownership_bps     INTEGER NOT NULL CHECK (ownership_bps > 0 AND ownership_bps <= 10000),
  invested_minor    BIGINT NOT NULL DEFAULT 0 CHECK (invested_minor >= 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, player_id)
);

-- 18. loans
CREATE TABLE loans (
  id                TEXT PRIMARY KEY,
  world_id          TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  player_id         TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  principal_minor   BIGINT NOT NULL CHECK (principal_minor > 0),
  remaining_principal_minor BIGINT NOT NULL CHECK (remaining_principal_minor >= 0),
  accrued_interest_minor BIGINT NOT NULL DEFAULT 0 CHECK (accrued_interest_minor >= 0),
  interest_rate_bps INTEGER NOT NULL CHECK (interest_rate_bps >= 0),
  status            TEXT NOT NULL CHECK (status IN ('ACTIVE', 'PAID_OFF', 'DEFAULTED')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_loans_player_status ON loans(player_id, status);

-- 19. bank_accounts
CREATE TABLE bank_accounts (
  id                TEXT PRIMARY KEY,
  world_id          TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  player_id         TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  account_kind      TEXT NOT NULL CHECK (account_kind IN ('SAVINGS', 'TERM_DEPOSIT')),
  balance_minor     BIGINT NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
  interest_rate_bps INTEGER NOT NULL CHECK (interest_rate_bps >= 0),
  matures_at_game_day INTEGER,
  status            TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'MATURED', 'CLOSED')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_bank_accounts_player ON bank_accounts(player_id, account_kind, status);

-- 20. economy_events
CREATE TABLE economy_events (
  id                TEXT PRIMARY KEY,
  world_id          TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  event_type        TEXT NOT NULL, -- MACRO_SHIFT | RATE_DECISION | DIVIDEND | AUCTION_END | MARKET_ALERT
  title             TEXT NOT NULL,
  payload_json      JSONB NOT NULL DEFAULT '{}'::jsonb,
  scheduled_game_day INTEGER,
  executed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 21. news
CREATE TABLE news (
  id                TEXT PRIMARY KEY,
  world_id          TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  category          TEXT NOT NULL, -- MACRO | CRYPTO | STOCK | PROPERTY | BANKING
  headline          TEXT NOT NULL,
  summary           TEXT NOT NULL,
  related_symbol    TEXT,
  impact_direction  TEXT CHECK (impact_direction IN ('POSITIVE', 'NEGATIVE', 'NEUTRAL')),
  published_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_news_published ON news(world_id, published_at DESC);

-- 22. notifications
CREATE TABLE notifications (
  id                TEXT PRIMARY KEY,
  world_id          TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  player_id         TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL, -- TRADE_FILL | ORDER_CANCELED | AUCTION_OUTBID | AUCTION_WON | RENT_PAID | DIVIDEND | SYSTEM
  title             TEXT NOT NULL,
  body              TEXT NOT NULL,
  is_read           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifications_player ON notifications(player_id, is_read, created_at DESC);

-- 23. sessions
CREATE TABLE sessions (
  id                TEXT PRIMARY KEY,
  user_id           TEXT REFERENCES users(id) ON DELETE CASCADE,
  player_id         TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  token_hash        TEXT NOT NULL UNIQUE,
  ip_address        INET,
  user_agent        TEXT,
  expires_at        TIMESTAMPTZ NOT NULL,
  revoked_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sessions_player ON sessions(player_id, expires_at);

-- 24. audit_logs
CREATE TABLE audit_logs (
  id                TEXT PRIMARY KEY,
  world_id          TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  actor_player_id   TEXT REFERENCES players(id) ON DELETE SET NULL,
  action            TEXT NOT NULL,
  target_type       TEXT,
  target_id         TEXT,
  metadata_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_logs_time ON audit_logs(world_id, created_at DESC);
```

---

## 3. Double-Entry Integrity Verification Query

Run periodically in CI / monitoring:

```sql
SELECT transaction_id,
       SUM(CASE WHEN entry_type = 'DEBIT' THEN amount_minor ELSE 0 END) AS total_debits,
       SUM(CASE WHEN entry_type = 'CREDIT' THEN amount_minor ELSE 0 END) AS total_credits
FROM ledger_entries
GROUP BY transaction_id
HAVING SUM(CASE WHEN entry_type = 'DEBIT' THEN amount_minor ELSE 0 END)
    <> SUM(CASE WHEN entry_type = 'CREDIT' THEN amount_minor ELSE 0 END);
-- Must ALWAYS return 0 rows.
```
