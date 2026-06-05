const recordsBody = document.getElementById("records-body");
const filterInput = document.getElementById("filter");
const filterRoe = document.getElementById("filter-roe");
const filterRs = document.getElementById("filter-rs");
const filterEpsRating = document.getElementById("filter-eps-rating");
const filterPrice = document.getElementById("filter-price");
const filterMaster = document.getElementById("filter-master");
const filterPe = document.getElementById("filter-pe");
const filterEpsStrength = document.getElementById("filter-eps-strength");
const filterPriceStrength = document.getElementById("filter-price-strength");
const filterLast4q = document.getElementById("filter-last4q");
const filterEpsPercent = document.getElementById("filter-eps-percent");
const filterChange = document.getElementById("filter-change");
const filterSales = document.getElementById("filter-sales");
const filterSalesChange = document.getElementById("filter-sales-change");
const sortSelect = document.getElementById("sort");
const orderSelect = document.getElementById("order");
const manualForm = document.getElementById("manual-form");
const manualStatus = document.getElementById("manual-status");
const refreshButton = document.getElementById("refresh-all");
const refreshStatus = document.getElementById("refresh-status");
const exportButton = document.getElementById("export-db");
const importButton = document.getElementById("import-db");
const importFileInput = document.getElementById("import-file");
const importModeSelect = document.getElementById("import-mode");
const deleteSelectedButton = document.getElementById("delete-selected");
const selectAllRecordsCheckbox = document.getElementById("select-all-records");

let currentRecordIds = [];
const selectedRecordIds = new Set();

async function fetchRecords() {
  const params = new URLSearchParams({
    q: filterInput.value.trim(),
    return_on_equity: filterRoe.value.trim(),
    rs_rating: filterRs.value.trim(),
    eps_rating: filterEpsRating.value.trim(),
    current_price: filterPrice.value.trim(),
    master_rank: filterMaster.value.trim(),
    pe_ratio: filterPe.value.trim(),
    eps_strength: filterEpsStrength.value.trim(),
    price_strength: filterPriceStrength.value.trim(),
    last_4_quarterly_earnings_percent: filterLast4q.value.trim(),
    eps_percent: filterEpsPercent.value.trim(),
    change: filterChange.value.trim(),
    sales_cr: filterSales.value.trim(),
    sales_change_percent: filterSalesChange.value.trim(),
    sort: sortSelect.value,
    order: orderSelect.value
  });

  const response = await fetch(`/api/records?${params.toString()}`);
  const data = await response.json();
  const records = data.records || [];
  currentRecordIds = records
    .map((record) => Number.parseInt(record.id, 10))
    .filter((id) => Number.isInteger(id) && id > 0);

  const visibleIds = new Set(currentRecordIds);
  Array.from(selectedRecordIds).forEach((id) => {
    if (!visibleIds.has(id)) {
      selectedRecordIds.delete(id);
    }
  });

  renderRecords(records);
  syncSelectAllCheckbox();
}

function renderRecords(records) {
  recordsBody.innerHTML = "";

  records.forEach((record) => {
    const numericId = Number.parseInt(record.id, 10);
    const checked = selectedRecordIds.has(numericId) ? "checked" : "";
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><input class="record-select" type="checkbox" data-id="${record.id}" ${checked} /></td>
      <td>${record.stock_name || record.query || "-"}</td>
      <td>${record.current_price || "-"}</td>
      <td>${record.eps_strength || "-"}</td>
      <td>${record.price_strength || "-"}</td>
      <td>${formatMasterRank(record.master_rank)}</td>
      <td>${record.pe_ratio || "-"}</td>
      <td>${record.return_on_equity || "-"}</td>
      <td>${record.rs_rating || "-"}</td>
      <td>${record.eps_rating || "-"}</td>
      <td>${record.last_4_quarterly_earnings_percent || "-"}</td>
      <td>${record.eps_percent || "-"}</td>
      <td>${record.change || "-"}</td>
      <td>${record.sales_cr || "-"}</td>
      <td>${record.sales_change_percent || "-"}</td>
      <td>${formatMetricWithPercent(record.no_of_funds, record.no_of_funds_percent)}</td>
      <td>${formatMetricWithPercent(record.shares_held_by_funds, record.shares_held_by_funds_percent)}</td>
      <td>${new Date(record.queried_at).toLocaleString()}</td>
    `;
    recordsBody.appendChild(row);
  });
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

function syncSelectAllCheckbox() {
  if (!selectAllRecordsCheckbox) {
    return;
  }

  if (!currentRecordIds.length) {
    selectAllRecordsCheckbox.checked = false;
    selectAllRecordsCheckbox.indeterminate = false;
    return;
  }

  const selectedCount = currentRecordIds.filter((id) => selectedRecordIds.has(id)).length;
  selectAllRecordsCheckbox.checked = selectedCount === currentRecordIds.length;
  selectAllRecordsCheckbox.indeterminate = selectedCount > 0 && selectedCount < currentRecordIds.length;
}

function handleRowSelection(event) {
  const checkbox = event.target;
  if (!checkbox.classList.contains("record-select")) {
    return;
  }

  const id = Number.parseInt(checkbox.dataset.id, 10);
  if (!Number.isInteger(id)) {
    return;
  }

  if (checkbox.checked) {
    selectedRecordIds.add(id);
  } else {
    selectedRecordIds.delete(id);
  }

  syncSelectAllCheckbox();
}

function handleSelectAllRecords(event) {
  const checked = event.target.checked;
  currentRecordIds.forEach((id) => {
    if (checked) {
      selectedRecordIds.add(id);
    } else {
      selectedRecordIds.delete(id);
    }
  });

  recordsBody.querySelectorAll(".record-select").forEach((checkbox) => {
    checkbox.checked = checked;
  });

  syncSelectAllCheckbox();
}

async function handleDeleteSelected() {
  const ids = Array.from(selectedRecordIds);
  if (!ids.length) {
    refreshStatus.textContent = "Select at least one record to delete.";
    return;
  }

  const confirmed = window.confirm(`Delete ${ids.length} selected record(s)?`);
  if (!confirmed) {
    return;
  }

  refreshStatus.textContent = "Deleting selected records...";

  try {
    const response = await fetch("/api/records", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Delete failed.");
    }

    ids.forEach((id) => selectedRecordIds.delete(id));
    refreshStatus.textContent = `Deleted ${data.deleted} record(s).`;
    await fetchRecords();
  } catch (error) {
    refreshStatus.textContent = error.message;
  }
}

async function handleManual(event) {
  event.preventDefault();
  manualStatus.textContent = "Saving manual record...";

  const formData = new FormData(manualForm);
  const payload = Object.fromEntries(formData.entries());

  try {
    const response = await fetch("/api/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Manual save failed.");
    }

    manualStatus.textContent = `Saved: ${data.record.stock_name}`;
    manualForm.reset();
    await fetchRecords();
  } catch (error) {
    manualStatus.textContent = error.message;
  }
}

async function handleRefreshAll() {
  refreshStatus.textContent = "Refreshing all stocks...";

  try {
    const response = await fetch("/api/admin/refresh", { method: "POST" });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Refresh failed.");
    }

    refreshStatus.textContent = `Updated ${data.success} of ${data.total}.`;
    await fetchRecords();
  } catch (error) {
    refreshStatus.textContent = error.message;
  }
}

function handleExportDb() {
  refreshStatus.textContent = "Preparing backup download...";
  window.location.href = "/api/admin/export";
  setTimeout(() => {
    if (refreshStatus.textContent === "Preparing backup download...") {
      refreshStatus.textContent = "Backup download started.";
    }
  }, 600);
}

async function handleImportDb() {
  const file = importFileInput.files && importFileInput.files[0];
  if (!file) {
    refreshStatus.textContent = "Select a backup JSON file first.";
    return;
  }

  refreshStatus.textContent = "Importing backup...";

  try {
    const text = await file.text();
    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch (_error) {
      throw new Error("Invalid JSON file.");
    }

    const mode = importModeSelect.value === "merge" ? "merge" : "replace";
    const response = await fetch("/api/admin/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, payload: parsed })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Import failed.");
    }

    refreshStatus.textContent = `Import done: ${data.imported}/${data.total} records (${data.mode}).`;
    importFileInput.value = "";
    await fetchRecords();
  } catch (error) {
    refreshStatus.textContent = error.message;
  }
}

manualForm.addEventListener("submit", handleManual);
filterInput.addEventListener("input", fetchRecords);
filterRoe.addEventListener("input", fetchRecords);
filterRs.addEventListener("input", fetchRecords);
filterEpsRating.addEventListener("input", fetchRecords);
filterPrice.addEventListener("input", fetchRecords);
filterMaster.addEventListener("input", fetchRecords);
filterPe.addEventListener("input", fetchRecords);
filterEpsStrength.addEventListener("input", fetchRecords);
filterPriceStrength.addEventListener("input", fetchRecords);
filterLast4q.addEventListener("input", fetchRecords);
filterEpsPercent.addEventListener("input", fetchRecords);
filterChange.addEventListener("input", fetchRecords);
filterSales.addEventListener("input", fetchRecords);
filterSalesChange.addEventListener("input", fetchRecords);
sortSelect.addEventListener("change", fetchRecords);
orderSelect.addEventListener("change", fetchRecords);
refreshButton.addEventListener("click", handleRefreshAll);
exportButton.addEventListener("click", handleExportDb);
importButton.addEventListener("click", handleImportDb);
deleteSelectedButton.addEventListener("click", handleDeleteSelected);
recordsBody.addEventListener("change", handleRowSelection);
selectAllRecordsCheckbox.addEventListener("change", handleSelectAllRecords);

fetchRecords();
