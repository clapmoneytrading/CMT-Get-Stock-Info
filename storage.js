const path = require("path");
const Database = require("better-sqlite3");

const dbPath = path.join(__dirname, "stocks.db");
const db = new Database(dbPath);

const COLUMN_MAP = {
  id: "id",
  query: "query",
  stock_name: "stock_name",
  current_price: "current_price",
  eps_strength: "eps_strength",
  price_strength: "price_strength",
  master_rank: "master_rank",
  master_score: "master_score",
  pe_ratio: "pe_ratio",
  return_on_equity: "return_on_equity",
  rs_rating: "rs_rating",
  eps_rating: "eps_rating",
  last_4_quarterly_earnings_percent: "last_4_quarterly_earnings_percent",
  eps_percent: "eps_percent",
  change: "change",
  sales_cr: "sales_cr",
  sales_change_percent: "sales_change_percent",
  no_of_funds: "no_of_funds",
  no_of_funds_percent: "no_of_funds_percent",
  shares_held_by_funds: "shares_held_by_funds",
  shares_held_by_funds_percent: "shares_held_by_funds_percent",
  queried_at: "queried_at"
};

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stock_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      stock_name TEXT,
      current_price TEXT,
      eps_strength TEXT,
      price_strength TEXT,
      master_rank TEXT,
      master_score TEXT,
      pe_ratio TEXT,
      return_on_equity TEXT,
      rs_rating TEXT,
      eps_rating TEXT,
      last_4_quarterly_earnings_percent TEXT,
      eps_percent TEXT,
      change TEXT,
      sales_cr TEXT,
      sales_change_percent TEXT,
      no_of_funds TEXT,
      no_of_funds_percent TEXT,
      shares_held_by_funds TEXT,
      shares_held_by_funds_percent TEXT,
      queried_at TEXT NOT NULL,
      raw_json TEXT
    )
  `);

  ensureColumn("no_of_funds", "TEXT");
  ensureColumn("no_of_funds_percent", "TEXT");
  ensureColumn("shares_held_by_funds", "TEXT");
  ensureColumn("shares_held_by_funds_percent", "TEXT");
  ensureColumn("master_rank", "TEXT");
}

function ensureColumn(columnName, columnType) {
  const columns = db.prepare("PRAGMA table_info(stock_records)").all();
  const exists = columns.some((column) => column.name === columnName);
  if (!exists) {
    db.exec(`ALTER TABLE stock_records ADD COLUMN ${columnName} ${columnType}`);
  }
}

function insertStockRecord(data) {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO stock_records (
      query,
      stock_name,
      current_price,
      eps_strength,
      price_strength,
      master_rank,
      master_score,
      pe_ratio,
      return_on_equity,
      rs_rating,
      eps_rating,
      last_4_quarterly_earnings_percent,
      eps_percent,
      change,
      sales_cr,
      sales_change_percent,
      no_of_funds,
      no_of_funds_percent,
      shares_held_by_funds,
      shares_held_by_funds_percent,
      queried_at,
      raw_json
    ) VALUES (
      @query,
      @stock_name,
      @current_price,
      @eps_strength,
      @price_strength,
      @master_rank,
      @master_score,
      @pe_ratio,
      @return_on_equity,
      @rs_rating,
      @eps_rating,
      @last_4_quarterly_earnings_percent,
      @eps_percent,
      @change,
      @sales_cr,
      @sales_change_percent,
      @no_of_funds,
      @no_of_funds_percent,
      @shares_held_by_funds,
      @shares_held_by_funds_percent,
      @queried_at,
      @raw_json
    )
  `);

  const payload = {
    query: data.query,
    stock_name: data.stock_name || null,
    current_price: data.current_price || null,
    eps_strength: data.eps_strength || null,
    price_strength: data.price_strength || null,
    master_rank: normalizeMasterRank(data.master_rank) || deriveMasterRankFromScore(data.master_score),
    master_score: data.master_score || null,
    pe_ratio: data.pe_ratio || null,
    return_on_equity: data.return_on_equity || null,
    rs_rating: data.rs_rating || null,
    eps_rating: data.eps_rating || null,
    last_4_quarterly_earnings_percent: data.last_4_quarterly_earnings_percent || null,
    eps_percent: data.eps_percent || null,
    change: data.change || null,
    sales_cr: data.sales_cr || null,
    sales_change_percent: data.sales_change_percent || null,
    no_of_funds: data.no_of_funds || null,
    no_of_funds_percent: data.no_of_funds_percent || null,
    shares_held_by_funds: data.shares_held_by_funds || null,
    shares_held_by_funds_percent: data.shares_held_by_funds_percent || null,
    queried_at: now,
    raw_json: JSON.stringify(data)
  };

  const info = stmt.run(payload);
  return { id: info.lastInsertRowid, ...payload };
}

function findExistingStock({ stockName, query }) {
  const stmt = db.prepare(`
    SELECT * FROM stock_records
    WHERE LOWER(COALESCE(stock_name, '')) = LOWER(@stockName)
       OR LOWER(query) = LOWER(@query)
    ORDER BY id DESC
    LIMIT 1
  `);

  return stmt.get({
    stockName: stockName || "",
    query: query || ""
  });
}

function queryStockRecords({ q, sort, order, limit, filters = {} }) {
  const sortColumn = COLUMN_MAP[sort] || COLUMN_MAP.queried_at;
  const orderDirection = order.toLowerCase() === "asc" ? "ASC" : "DESC";
  const max = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 200;

  const filterClauses = [];
  const filterParams = {};
  const numericFilters = [];

  Object.entries(filters).forEach(([key, value]) => {
    if (!value || !COLUMN_MAP[key]) {
      return;
    }
    const numericRule = parseNumericFilter(value);
    if (numericRule) {
      numericFilters.push({ key, rule: numericRule });
      return;
    }

    filterClauses.push(`${COLUMN_MAP[key]} LIKE @${key}`);
    filterParams[key] = `%${value}%`;
  });

  const filterSql = filterClauses.length ? ` AND ${filterClauses.join(" AND ")}` : "";

  const stmt = db.prepare(`
    SELECT * FROM stock_records
    WHERE (@q = '' OR stock_name LIKE @likeQ OR query LIKE @likeQ)
    ${filterSql}
    ORDER BY ${sortColumn} ${orderDirection}
    LIMIT @limit
  `);

  let records = stmt.all({
    q: q || "",
    likeQ: `%${q || ""}%`,
    limit: max,
    ...filterParams
  });

  if (numericFilters.length) {
    records = records.filter((record) =>
      numericFilters.every(({ key, rule }) => matchesNumericFilter(record[key], rule))
    );
  }

  return records;
}

function parseNumericFilter(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  const opMatch = raw.match(/^(>=|<=|>|<|=)\s*([0-9.,\-]+)\s*%?$/);
  if (opMatch) {
    const num = toNumber(opMatch[2]);
    if (Number.isNaN(num)) {
      return null;
    }
    return { type: "op", op: opMatch[1], value: num };
  }

  const rangeMatch = raw.match(/^([0-9.,\-]+)\s*(?:-|\.\.)\s*([0-9.,\-]+)\s*%?$/);
  if (rangeMatch) {
    const min = toNumber(rangeMatch[1]);
    const max = toNumber(rangeMatch[2]);
    if (Number.isNaN(min) || Number.isNaN(max)) {
      return null;
    }
    return { type: "range", min: Math.min(min, max), max: Math.max(min, max) };
  }

  const num = toNumber(raw);
  if (Number.isNaN(num)) {
    return null;
  }

  return { type: "op", op: "=", value: num };
}

function toNumber(value) {
  const cleaned = String(value || "")
    .replace(/[^0-9.\-]/g, "")
    .trim();
  if (!cleaned) {
    return Number.NaN;
  }
  return Number.parseFloat(cleaned);
}

function matchesNumericFilter(recordValue, rule) {
  const value = toNumber(recordValue);
  if (Number.isNaN(value)) {
    return false;
  }

  if (rule.type === "range") {
    return value >= rule.min && value <= rule.max;
  }

  switch (rule.op) {
    case ">":
      return value > rule.value;
    case ">=":
      return value >= rule.value;
    case "<":
      return value < rule.value;
    case "<=":
      return value <= rule.value;
    case "=":
    default:
      return value === rule.value;
  }
}

function listLatestStocks() {
  const stmt = db.prepare(`
    SELECT stock_name, query
    FROM stock_records
    WHERE id IN (
      SELECT MAX(id)
      FROM stock_records
      GROUP BY COALESCE(stock_name, query)
    )
    ORDER BY stock_name IS NULL, stock_name ASC
  `);

  return stmt.all();
}

function listAllStockRecords() {
  const stmt = db.prepare(`
    SELECT *
    FROM stock_records
    ORDER BY id ASC
  `);

  return stmt.all();
}

function deleteStockRecordsByIds(ids) {
  const numericIds = Array.isArray(ids)
    ? ids
        .map((id) => Number.parseInt(id, 10))
        .filter((id) => Number.isInteger(id) && id > 0)
    : [];

  if (!numericIds.length) {
    return 0;
  }

  const placeholders = numericIds.map(() => "?").join(",");
  const stmt = db.prepare(`DELETE FROM stock_records WHERE id IN (${placeholders})`);
  const info = stmt.run(...numericIds);
  return info.changes || 0;
}

function importStockRecords(records, mode = "replace") {
  const insertStmt = db.prepare(`
    INSERT INTO stock_records (
      query,
      stock_name,
      current_price,
      eps_strength,
      price_strength,
      master_rank,
      master_score,
      pe_ratio,
      return_on_equity,
      rs_rating,
      eps_rating,
      last_4_quarterly_earnings_percent,
      eps_percent,
      change,
      sales_cr,
      sales_change_percent,
      no_of_funds,
      no_of_funds_percent,
      shares_held_by_funds,
      shares_held_by_funds_percent,
      queried_at,
      raw_json
    ) VALUES (
      @query,
      @stock_name,
      @current_price,
      @eps_strength,
      @price_strength,
      @master_rank,
      @master_score,
      @pe_ratio,
      @return_on_equity,
      @rs_rating,
      @eps_rating,
      @last_4_quarterly_earnings_percent,
      @eps_percent,
      @change,
      @sales_cr,
      @sales_change_percent,
      @no_of_funds,
      @no_of_funds_percent,
      @shares_held_by_funds,
      @shares_held_by_funds_percent,
      @queried_at,
      @raw_json
    )
  `);

  const runImport = db.transaction((items, selectedMode) => {
    if (selectedMode === "replace") {
      db.prepare("DELETE FROM stock_records").run();
    }

    let imported = 0;

    for (const record of items) {
      const normalized = normalizeImportRecord(record);
      if (!normalized) {
        continue;
      }

      insertStmt.run(normalized);
      imported += 1;
    }

    return imported;
  });

  const safeMode = mode === "merge" ? "merge" : "replace";
  const importedCount = runImport(Array.isArray(records) ? records : [], safeMode);

  return {
    imported: importedCount,
    total: Array.isArray(records) ? records.length : 0,
    mode: safeMode
  };
}

function normalizeImportRecord(record) {
  if (!record || typeof record !== "object") {
    return null;
  }

  const query = String(record.query || record.stock_name || "").trim();
  if (!query) {
    return null;
  }

  const payload = {
    query,
    stock_name: record.stock_name || null,
    current_price: record.current_price || null,
    eps_strength: record.eps_strength || null,
    price_strength: record.price_strength || null,
    master_rank: normalizeMasterRank(record.master_rank) || deriveMasterRankFromScore(record.master_score),
    master_score: record.master_score || null,
    pe_ratio: record.pe_ratio || null,
    return_on_equity: record.return_on_equity || null,
    rs_rating: record.rs_rating || null,
    eps_rating: record.eps_rating || null,
    last_4_quarterly_earnings_percent: record.last_4_quarterly_earnings_percent || null,
    eps_percent: record.eps_percent || null,
    change: record.change || null,
    sales_cr: record.sales_cr || null,
    sales_change_percent: record.sales_change_percent || null,
    no_of_funds: record.no_of_funds || null,
    no_of_funds_percent: record.no_of_funds_percent || null,
    shares_held_by_funds: record.shares_held_by_funds || null,
    shares_held_by_funds_percent: record.shares_held_by_funds_percent || null,
    queried_at: record.queried_at || new Date().toISOString(),
    raw_json: null
  };

  if (record.raw_json) {
    payload.raw_json = String(record.raw_json);
  } else {
    payload.raw_json = JSON.stringify({
      query: payload.query,
      stock_name: payload.stock_name,
      current_price: payload.current_price,
      eps_strength: payload.eps_strength,
      price_strength: payload.price_strength,
      master_rank: payload.master_rank,
      master_score: payload.master_score,
      pe_ratio: payload.pe_ratio,
      return_on_equity: payload.return_on_equity,
      rs_rating: payload.rs_rating,
      eps_rating: payload.eps_rating,
      last_4_quarterly_earnings_percent: payload.last_4_quarterly_earnings_percent,
      eps_percent: payload.eps_percent,
      change: payload.change,
      sales_cr: payload.sales_cr,
      sales_change_percent: payload.sales_change_percent,
      no_of_funds: payload.no_of_funds,
      no_of_funds_percent: payload.no_of_funds_percent,
      shares_held_by_funds: payload.shares_held_by_funds,
      shares_held_by_funds_percent: payload.shares_held_by_funds_percent
    });
  }

  return payload;
}

function normalizeMasterRank(value) {
  const text = String(value || "").trim().toUpperCase();
  return /^[ABCD]$/.test(text) ? text : null;
}

function deriveMasterRankFromScore(value) {
  const score = toNumber(value);
  if (!Number.isFinite(score)) {
    return null;
  }
  if (score >= 80) {
    return "A";
  }
  if (score >= 60) {
    return "B";
  }
  if (score >= 40) {
    return "C";
  }
  return "D";
}

module.exports = {
  initDb,
  insertStockRecord,
  findExistingStock,
  queryStockRecords,
  listLatestStocks,
  listAllStockRecords,
  deleteStockRecordsByIds,
  importStockRecords
};
