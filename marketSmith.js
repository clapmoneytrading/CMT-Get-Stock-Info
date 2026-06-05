const { fetch } = require("undici");

const BASE_URL = "https://marketsmithindia.com";
const API_BASE = `${BASE_URL}/gateway/simple-api/ms-india`;
const DEFAULT_MS_AUTH = "0000+MarketSmithINDUID-0000000000000+MarketSmithINDUID-0000000000000";
const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  Accept: "application/json,text/plain,*/*"
};

async function lookupStock(query) {
  const candidate = await findInstrument(query);
  if (!candidate) {
    throw new Error("Stock not found in provider search results.");
  }

  const details = await fetchSymbolDetails(candidate.instrumentId, candidate.symbol);
  const header = details.detailsGeneralInformationHeader || {};
  const quarterlyRowsRaw =
    details.quarterlySalesAndEarningsInternational?.quarterlySalesAndEarningsOrigin || [];
  const quarterlyRows = Array.isArray(quarterlyRowsRaw)
    ? quarterlyRowsRaw.filter((item) => item && (item.eps != null || item.sales != null || item.salesMil != null))
    : [];

  const lastQuarter = quarterlyRows.length ? quarterlyRows[0] : {};
  const previousQuarter = quarterlyRows.length > 1 ? quarterlyRows[1] : {};
  const quarterlyEarningsLast4 = quarterlyRows.slice(0, 4).map((item) => ({
    date: formatMonthYear(item.calendarDate || item.fiscalDate),
    eps: formatValue(item.eps),
    eps_change_percent: formatSignedPercent(item.epsPct),
    sales_cr: formatValue(item.sales),
    sales_change_percent: formatSignedPercent(item.salesPct)
  }));
  const last4EpsPct = quarterlyRows
    .slice(0, 4)
    .map((item) => toNumber(item.epsPct))
    .filter((value) => Number.isFinite(value));

  const currentPrice = toNumber(header.currentPrice);
  const previousPrice = toNumber(header.prevPrice);
  const changePct =
    Number.isFinite(currentPrice) && Number.isFinite(previousPrice) && previousPrice !== 0
      ? ((currentPrice - previousPrice) / previousPrice) * 100
      : null;

  return {
    source: "provider-api",
    source_url: null,
    stock_name: normalizeString(header.companyName || candidate.name || query),
    current_price: formatValue(header.currentPrice),
    eps_strength: formatValue(header.epsRank),
    price_strength: formatValue(header.rsNumericGrade),
    master_rank: deriveMasterRankFromScore(header.masterScore),
    master_score: formatValue(header.masterScore),
    pe_ratio: formatValue(header.pe),
    return_on_equity: formatPercent(header.roe),
    rs_rating: formatValue(header.rsNumericGrade),
    eps_rating: formatValue(header.epsRank),
    last_4_quarterly_earnings_percent:
      last4EpsPct.length > 0
        ? `${(last4EpsPct.reduce((sum, value) => sum + value, 0) / last4EpsPct.length).toFixed(2)}%`
        : null,
    eps_percent: formatPercent(lastQuarter.epsPct),
    change: changePct == null ? null : `${changePct.toFixed(2)}%`,
    sales_cr: formatValue(lastQuarter.sales ?? header.sales),
    sales_change_percent: formatPercent(lastQuarter.salesPct),
    no_of_funds: formatCompactCount(lastQuarter.noOfFunds),
    no_of_funds_percent: calculateChangePercent(lastQuarter.noOfFunds, previousQuarter.noOfFunds),
    shares_held_by_funds: formatCroreShares(lastQuarter.totSharesHeldByFunds),
    shares_held_by_funds_percent: calculateChangePercent(
      lastQuarter.totSharesHeldByFunds,
      previousQuarter.totSharesHeldByFunds
    ),
    quarterly_earnings_last_4: quarterlyEarningsLast4
  };
}

async function findInstrument(query) {
  const url = `${API_BASE}/instr/srch.json?text=${encodeURIComponent(query)}&lang=en&listID=-1&ver=2`;
  const payload = await fetchJson(url);
  const results = payload?.response?.results || [];
  if (!results.length) {
    return null;
  }

  const exact = results.find((item) => {
    const symbols = [item.symbol, item.nseSymbol, item.bseSymbol].map((value) =>
      String(value || "").toLowerCase()
    );
    const name = String(item.name || "").toLowerCase();
    const q = String(query || "").toLowerCase();
    return symbols.includes(q) || name === q;
  });

  return exact || results[0];
}

async function fetchSymbolDetails(instrumentId, symbol) {
  const dateTo = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const url =
    `${API_BASE}/instr/0/${encodeURIComponent(String(instrumentId))}/symboldetails.json` +
    `?s=20180101&e=${dateTo}&text=${encodeURIComponent(symbol)}&lang=en&isConsolidated=1` +
    `&ms-auth=${encodeURIComponent(DEFAULT_MS_AUTH)}`;

  const payload = await fetchJson(url);
  if (!payload?.response) {
    throw new Error("Provider details API returned an unexpected response.");
  }
  return payload.response;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: DEFAULT_HEADERS
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch provider data (${response.status}).`);
  }

  return response.json();
}

function toNumber(value) {
  const numeric = Number.parseFloat(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}

function normalizeString(value) {
  const text = String(value || "").trim();
  return text || null;
}

function formatValue(value) {
  if (value == null || value === "") {
    return null;
  }
  return String(value);
}

function formatPercent(value) {
  const num = toNumber(value);
  if (!Number.isFinite(num)) {
    return null;
  }
  return `${num.toFixed(2)}%`;
}

function formatSignedPercent(value) {
  const num = toNumber(value);
  if (!Number.isFinite(num)) {
    return null;
  }
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toFixed(2)}%`;
}

function formatMonthYear(value) {
  if (value == null || value === "") {
    return null;
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  let date;
  if (/^\d{10,13}$/.test(raw)) {
    const epoch = Number.parseInt(raw, 10);
    const epochMs = raw.length <= 10 ? epoch * 1000 : epoch;
    date = new Date(epochMs);
  } else
  if (/^\d{8}$/.test(raw)) {
    const year = Number.parseInt(raw.slice(0, 4), 10);
    const month = Number.parseInt(raw.slice(4, 6), 10) - 1;
    const day = Number.parseInt(raw.slice(6, 8), 10);
    date = new Date(year, month, day);
  } else {
    date = new Date(raw);
  }

  if (!Number.isFinite(date.getTime())) {
    return raw;
  }

  return date.toLocaleString("en-US", {
    month: "short",
    year: "numeric"
  });
}

function formatCompactCount(value) {
  const num = toNumber(value);
  if (!Number.isFinite(num)) {
    return null;
  }

  if (Math.abs(num) >= 1000) {
    return `${(num / 1000).toFixed(2)} K`;
  }

  return `${Math.round(num)}`;
}

function formatCroreShares(value) {
  const num = toNumber(value);
  if (!Number.isFinite(num)) {
    return null;
  }

  const crore = num / 10000000;
  return `${crore.toFixed(2)} Cr`;
}

function calculateChangePercent(currentValue, previousValue) {
  const current = toNumber(currentValue);
  const previous = toNumber(previousValue);

  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return null;
  }

  const percent = ((current - previous) / previous) * 100;
  return formatSignedPercent(percent);
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
  lookupStock
};
