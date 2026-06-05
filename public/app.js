const form = document.getElementById("lookup-form");
const statusEl = document.getElementById("status");
const resultPanel = document.getElementById("result-panel");
const resultStockName = document.getElementById("result-stock-name");
const resultStockPrice = document.getElementById("result-stock-price");
const resultSource = document.getElementById("result-source");
const summaryGrid = document.getElementById("summary-grid");
const quarterlyBody = document.getElementById("quarterly-body");

async function handleLookup(event) {
  event.preventDefault();
  const queryInput = document.getElementById("query");
  const query = queryInput.value.trim();
  if (!query) {
    return;
  }

  statusEl.textContent = "Fetching stock details...";

  try {
    const response = await fetch("/api/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Lookup failed.");
    }

    const record = data.record || {};
    renderLookupResult(record);

    const saveState = await saveLookupRecord(record);
    statusEl.textContent =
      saveState === "saved"
        ? "Search completed and saved to dashboard."
        : "Search completed. Record already exists in dashboard.";
  } catch (error) {
    statusEl.textContent = error.message;
    resultPanel.style.display = "none";
  }
}

async function saveLookupRecord(record) {
  const response = await fetch("/api/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record)
  });

  const data = await response.json();
  if (response.ok) {
    return "saved";
  }

  if (response.status === 409) {
    return "duplicate";
  }

  throw new Error(data.error || "Failed to save record to database.");
}

function renderLookupResult(record) {
  resultPanel.style.display = "block";
  resultStockName.textContent = record.stock_name || record.query || "-";
  resultStockPrice.textContent = `Price: ${record.current_price || "-"}`;
  resultSource.textContent = "Latest live data";

  const summaryRows = [
    ["Master Rank Score", formatMasterRank(record.master_rank)],
    ["No of Funds", formatMetricWithPercent(record.no_of_funds, record.no_of_funds_percent)],
    [
      "Shares held by Funds",
      formatMetricWithPercent(record.shares_held_by_funds, record.shares_held_by_funds_percent)
    ],
    ["EPS Rating", record.eps_rating],
    ["Price Rank", record.price_strength],
    ["P/E Ratio", record.pe_ratio],
    ["Return on Equity", record.return_on_equity]
  ];

  summaryGrid.innerHTML = "";
  summaryRows.forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "preview-item";
    row.innerHTML = `<span>${label}</span><strong>${value || "-"}</strong>`;
    summaryGrid.appendChild(row);
  });

  const quarters = Array.isArray(record.quarterly_earnings_last_4)
    ? record.quarterly_earnings_last_4
    : [];

  quarterlyBody.innerHTML = "";

  if (!quarters.length) {
    const emptyRow = document.createElement("tr");
    emptyRow.innerHTML = `<td colspan="5">No quarterly data available.</td>`;
    quarterlyBody.appendChild(emptyRow);
    return;
  }

  quarters.forEach((item) => {
    const epsClass = changeClass(item.eps_change_percent);
    const salesClass = changeClass(item.sales_change_percent);
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${item.date || "-"}</td>
      <td>${item.eps || "-"}</td>
      <td class="${epsClass}">${item.eps_change_percent || "-"}</td>
      <td>${item.sales_cr || "-"}</td>
      <td class="${salesClass}">${item.sales_change_percent || "-"}</td>
    `;
    quarterlyBody.appendChild(row);
  });
}

function changeClass(value) {
  const text = String(value || "").trim();
  if (text.startsWith("+")) {
    return "chg-pos";
  }
  if (text.startsWith("-")) {
    return "chg-neg";
  }
  return "chg-zero";
}

function formatMetricWithPercent(value, percent) {
  if (!value && !percent) {
    return "-";
  }
  if (!percent) {
    return value || "-";
  }
  return `${value || "-"} (${percent})`;
}

function formatMasterRank(rank) {
  const value = String(rank || "").trim().toUpperCase();
  if (!/^[ABCD]$/.test(value)) {
    return "-";
  }
  return `Master Rank Score ${value}`;
}

form.addEventListener("submit", handleLookup);
