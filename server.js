const path = require("path");
const express = require("express");
const {
  initDb,
  insertStockRecord,
  findExistingStock,
  queryStockRecords,
  listLatestStocks,
  listAllStockRecords,
  deleteStockRecordsByIds,
  importStockRecords
} = require("./storage");
const { lookupStock } = require("./marketSmith");

const app = express();
const port = process.env.PORT || 3000;

initDb();

app.use(express.json({ limit: "25mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/lookup", async (req, res) => {
  const query = (req.body?.query || "").trim();
  if (!query) {
    return res.status(400).json({ error: "Stock name is required." });
  }

  try {
    const result = await lookupStock(query);
    return res.json({
      record: {
        query,
        ...result
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Lookup failed." });
  }
});

app.post("/api/add", (req, res) => {
  const payload = req.body || {};
  const query = (payload.query || "").trim();
  const stockName = (payload.stock_name || payload.stockName || "").trim();

  if (!stockName && !query) {
    return res.status(400).json({ error: "Stock name is required." });
  }

  const existing = findExistingStock({ stockName, query });
  if (existing) {
    return res.status(409).json({ error: "Stock is previously added." });
  }

  const record = insertStockRecord({
    ...payload,
    query: query || stockName,
    stock_name: stockName || query,
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
    shares_held_by_funds_percent: payload.shares_held_by_funds_percent,
    source: payload.source || "lookup"
  });

  return res.json({ record });
});

app.post("/api/manual", (req, res) => {
  const payload = req.body || {};
  const stockName = (payload.stock_name || "").trim();
  const query = (payload.query || stockName || "").trim();

  if (!stockName) {
    return res.status(400).json({ error: "Stock name is required." });
  }

  const existing = findExistingStock({ stockName, query });
  if (existing) {
    return res.status(409).json({ error: "Stock is previously added." });
  }

  const record = insertStockRecord({
    query,
    stock_name: stockName,
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
    shares_held_by_funds_percent: payload.shares_held_by_funds_percent,
    source: "manual"
  });

  return res.json({ record });
});

app.post("/api/admin/refresh", async (_req, res) => {
  const stocks = listLatestStocks();
  const results = [];

  for (const stock of stocks) {
    const query = stock.stock_name || stock.query;
    if (!query) {
      continue;
    }

    try {
      const result = await lookupStock(query);
      const record = insertStockRecord({
        query,
        ...result
      });
      results.push({ query, status: "ok", id: record.id });
    } catch (error) {
      results.push({ query, status: "error", message: error.message });
    }
  }

  return res.json({
    total: results.length,
    success: results.filter((item) => item.status === "ok").length,
    errors: results.filter((item) => item.status === "error")
  });
});

app.get("/api/admin/export", (_req, res) => {
  const records = listAllStockRecords();
  const payload = {
    app: "cmt-get-stock-details",
    version: 1,
    exported_at: new Date().toISOString(),
    total: records.length,
    records
  };

  const fileName = `stocks-backup-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=\"${fileName}\"`);
  return res.send(JSON.stringify(payload, null, 2));
});

app.post("/api/admin/import", (req, res) => {
  const mode = String(req.body?.mode || "replace").toLowerCase();
  const records = Array.isArray(req.body?.records)
    ? req.body.records
    : Array.isArray(req.body?.payload?.records)
      ? req.body.payload.records
      : null;

  if (!records) {
    return res.status(400).json({
      error: "Invalid backup format. Expected JSON with a records array."
    });
  }

  try {
    const result = importStockRecords(records, mode);
    return res.json({
      message: "Import completed.",
      ...result
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Import failed."
    });
  }
});

app.get("/api/records", (req, res) => {
  const q = (req.query.q || "").trim();
  const filters = {
    stock_name: (req.query.stock_name || "").trim(),
    current_price: (req.query.current_price || "").trim(),
    eps_strength: (req.query.eps_strength || "").trim(),
    price_strength: (req.query.price_strength || "").trim(),
    master_rank: (req.query.master_rank || "").trim(),
    master_score: (req.query.master_score || "").trim(),
    pe_ratio: (req.query.pe_ratio || "").trim(),
    return_on_equity: (req.query.return_on_equity || "").trim(),
    rs_rating: (req.query.rs_rating || "").trim(),
    eps_rating: (req.query.eps_rating || "").trim(),
    last_4_quarterly_earnings_percent: (req.query.last_4_quarterly_earnings_percent || "").trim(),
    eps_percent: (req.query.eps_percent || "").trim(),
    change: (req.query.change || "").trim(),
    sales_cr: (req.query.sales_cr || "").trim(),
    sales_change_percent: (req.query.sales_change_percent || "").trim(),
    no_of_funds: (req.query.no_of_funds || "").trim(),
    no_of_funds_percent: (req.query.no_of_funds_percent || "").trim(),
    shares_held_by_funds: (req.query.shares_held_by_funds || "").trim(),
    shares_held_by_funds_percent: (req.query.shares_held_by_funds_percent || "").trim()
  };
  const sort = (req.query.sort || "queried_at").trim();
  const order = (req.query.order || "desc").trim();
  const limit = Number.parseInt(req.query.limit || "200", 10);

  const records = queryStockRecords({ q, sort, order, limit, filters });
  return res.json({ records });
});

app.delete("/api/records", (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (!ids.length) {
    return res.status(400).json({ error: "Provide at least one record id to delete." });
  }

  const deleted = deleteStockRecordsByIds(ids);
  return res.json({ deleted });
});

app.listen(port, () => {
  console.log(`Dashboard running on http://localhost:${port}`);
});
