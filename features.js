// features.js - loaded AFTER app.js.
// Adds: monthly view + category chart, optional budgets, bulk ledger actions, rename/merge categories,
// Excel/PDF export, safer logout, auto-sync, bottom navigation, dark mode.
// It extends app.js by wrapping/overriding a few global functions (renderBalance, renderHeads,
// showPage, logout, deleteMainHead, deleteSubHead), so app.js keeps working as before.

// ==================== SMALL UTILITIES ====================
function escHtml(v) {
    return String(v === undefined || v === null ? "" : v)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function showToast(msg, ms) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add("show"), 10);
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, ms || 3000);
}

function allEntriesP() {
    return new Promise(resolve => getAllEntries(resolve));
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "03-04-2026" or "2026-04-03" -> "2026-04"  (no timezone problems: plain string parsing)
function monthKeyOf(dateStr) {
    if (!dateStr) return null;
    const p = String(dateStr).split("-");
    if (p.length !== 3) return null;
    const y = p[0].length === 4 ? p[0] : p[2];
    const m = parseInt(p[1], 10);
    if (!/^\d{4}$/.test(y) || !(m >= 1 && m <= 12)) return null;
    return `${y}-${String(m).padStart(2, "0")}`;
}

function monthLabel(key) {
    const [y, m] = key.split("-");
    return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
}

const fmtMoney = n => formatAmountPlain(Math.abs(n));

// ==================== BUDGETS (optional) ====================
// One amount per category per month, saved in the cloud table `budgets` (user_id, main_category, year, month, amount)
// and cached on this phone. A month/category WITHOUT an amount has NO limit - nothing is carried forward.
//   local format: { "2026-07": { "Food": 25000, "Fuel": 8000 }, "2026-08": { ... } }
function budgetsKey() { return `budgets_${getCurrentUserId()}`; }
function budgetPendingKey() { return `budgets_pending_${getCurrentUserId()}`; }

function currentMonthKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(fromKey, toKey) {
    const out = [];
    let [y, m] = fromKey.split("-").map(Number);
    const [ty, tm] = toKey.split("-").map(Number);
    while ((y < ty || (y === ty && m <= tm)) && out.length < 240) {
        out.push(`${y}-${String(m).padStart(2, "0")}`);
        m++; if (m > 12) { m = 1; y++; }
    }
    return out;
}

function prevMonthKey(key) {
    let [y, m] = key.split("-").map(Number);
    m--; if (m < 1) { m = 12; y--; }
    return `${y}-${String(m).padStart(2, "0")}`;
}

// Budgets saved by the older version ("from this month onward" + exceptions) -> one amount per month
function migrateOldBudgets(raw) {
    const out = {};
    const now = currentMonthKey();
    const startOfTime = `${new Date().getFullYear() - 2}-01`;
    Object.entries(raw.defaults || {}).forEach(([main, val]) => {
        const versions = (Array.isArray(val) ? val : [{ from: "0000-00", amount: Number(val) }])
            .slice().sort((x, y) => x.from.localeCompare(y.from));
        versions.forEach((v, i) => {
            if (!(v.amount > 0)) return;
            const from = v.from === "0000-00" ? startOfTime : v.from;
            const to = i + 1 < versions.length ? prevMonthKey(versions[i + 1].from) : now;
            monthRange(from, to).forEach(k => { (out[k] = out[k] || {})[main] = Number(v.amount); });
        });
    });
    Object.entries(raw.overrides || {}).forEach(([mk, obj]) => {
        Object.entries(obj || {}).forEach(([main, amt]) => { if (amt > 0) (out[mk] = out[mk] || {})[main] = Number(amt); });
    });
    return out;
}

function loadBudgets() {
    let months = {};
    try {
        const raw = JSON.parse(localStorage.getItem(budgetsKey()));
        if (raw && raw.months) {
            months = raw.months;
        } else if (raw && (raw.defaults || raw.overrides)) {
            months = migrateOldBudgets(raw);
            localStorage.setItem(budgetsKey(), JSON.stringify({ v: 2, months }));
            localStorage.setItem(budgetPendingKey(), "1");          // upload the converted budgets
        }
    } catch (e) { /* ignore */ }
    return months;
}

function saveBudgets(months, quiet) {
    localStorage.setItem(budgetsKey(), JSON.stringify({ v: 2, months }));
    localStorage.setItem(budgetPendingKey(), "1");                 // not in the cloud yet
    if (!quiet) setTimeout(pushBudgets, 300);
}

function getBudgetFor(main, monthKey) {
    if (!monthKey) return null;
    const v = Number((loadBudgets()[monthKey] || {})[main]);
    return v > 0 ? v : null;
}

function hasAnyBudget() {
    return Object.values(loadBudgets()).some(o => Object.values(o).some(v => v > 0));
}

function renameBudgetKey(oldName, newName) {
    const b = loadBudgets();
    let changed = false;
    Object.keys(b).forEach(mk => {
        if (b[mk][oldName] !== undefined) {
            if (b[mk][newName] === undefined) b[mk][newName] = b[mk][oldName];
            delete b[mk][oldName];
            changed = true;
        }
    });
    if (changed) saveBudgets(b);
}

// ----- cloud sync (GET/POST /api/budgets) -----
function budgetsToRows(b) {
    const rows = [];
    Object.keys(b).forEach(mk => {
        const [y, m] = mk.split("-").map(Number);
        Object.entries(b[mk]).forEach(([main, amt]) => {
            if (amt > 0) rows.push({ main_category: main, year: y, month: m, amount: Number(amt) });
        });
    });
    return rows;
}

async function pushBudgets() {
    if (typeof authToken === "undefined" || !authToken || !navigator.onLine) return false;
    if (!localStorage.getItem(budgetPendingKey())) return true;
    try {
        const res = await authFetch("/api/budgets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ budgets: budgetsToRows(loadBudgets()) })
        });
        const r = await res.json();
        if (r.success) { localStorage.removeItem(budgetPendingKey()); return true; }
        console.error("Budget upload failed:", r.message);
    } catch (e) {
        if (e.message !== "SESSION_EXPIRED") console.error("Budget upload error:", e);
    }
    return false;
}

async function pullBudgets() {
    if (typeof authToken === "undefined" || !authToken || !navigator.onLine) return;
    loadBudgets();                                                  // runs the old-format conversion if needed
    if (localStorage.getItem(budgetPendingKey())) { await pushBudgets(); return; }   // phone has newer changes
    try {
        const res = await authFetch("/api/budgets");
        const r = await res.json();
        if (!r.success) return;
        const months = {};
        (r.budgets || []).forEach(x => {
            const k = `${x.year}-${String(x.month).padStart(2, "0")}`;
            (months[k] = months[k] || {})[x.main_category] = parseFloat(x.amount);
        });
        localStorage.setItem(budgetsKey(), JSON.stringify({ v: 2, months }));
        renderBudgetSettings();
        calcTotal();
    } catch (e) {
        if (e.message !== "SESSION_EXPIRED") console.error("Budget download error:", e);
    }
}

// ----- Settings screen: From (month, year) to To (month, year) -----
function initBudgetMonthSelects() {
    const ids = ["budgetFromMonth", "budgetFromYear", "budgetToMonth", "budgetToYear"];
    const els = ids.map(id => document.getElementById(id));
    if (els.some(e => !e) || els[0].options.length) return;
    const now = new Date(), cy = now.getFullYear();
    const monthOpts = MONTH_NAMES.map((n, i) => `<option value="${String(i + 1).padStart(2, "0")}">${n}</option>`).join("");
    let yearOpts = "";
    for (let y = cy - 4; y <= cy + 3; y++) yearOpts += `<option value="${y}">${y}</option>`;
    [els[0], els[2]].forEach(e => { e.innerHTML = monthOpts; e.value = String(now.getMonth() + 1).padStart(2, "0"); });
    [els[1], els[3]].forEach(e => { e.innerHTML = yearOpts; e.value = String(cy); });
}

function budgetFromKey() { return `${document.getElementById("budgetFromYear").value}-${document.getElementById("budgetFromMonth").value}`; }
function budgetToKey() { return `${document.getElementById("budgetToYear").value}-${document.getElementById("budgetToMonth").value}`; }

window.onBudgetFromChange = function () {
    // keep "To" from being earlier than "From"
    if (budgetToKey() < budgetFromKey()) {
        document.getElementById("budgetToYear").value = document.getElementById("budgetFromYear").value;
        document.getElementById("budgetToMonth").value = document.getElementById("budgetFromMonth").value;
    }
    renderBudgetSettings();
};

window.renderBudgetSettings = function () {
    const box = document.getElementById("budgetSettings");
    if (!box) return;
    initBudgetMonthSelects();
    if (!document.getElementById("budgetFromMonth")) return;
    
    let from = budgetFromKey(), to = budgetToKey();
    if (to < from) to = from;
    const months = monthRange(from, to);
    const b = loadBudgets();
    const mains = Object.keys(heads || {});
    
    const info = document.getElementById("budgetRangeInfo");
    if (info) info.textContent = months.length === 1
        ? `Setting 1 month: ${monthLabel(from)}`
        : `Setting ${months.length} months: ${monthLabel(from)} to ${monthLabel(to)}`;
    
    if (mains.length === 0) {
        box.innerHTML = '<p style="color:#888;">Add main categories first, then set optional limits here.</p>';
        return;
    }
    
    box.innerHTML = mains.map(main => {
        const vals = months.map(k => Number((b[k] || {})[main]) || 0);
        const same = vals.every(v => v === vals[0]);
        const value = same && vals[0] > 0 ? vals[0] : "";
        const ph = same ? "No limit" : "Mixed (unchanged)";
        return `
            <div class="budget-row">
                <label>${escHtml(main)}</label>
                <input type="number" min="0" step="1" inputmode="decimal" data-main="${escHtml(main)}"
                       data-mixed="${same ? 0 : 1}" value="${value}" placeholder="${escHtml(ph)}">
            </div>`;
    }).join("");
};

window.saveBudgetSettings = function () {
    let from = budgetFromKey(), to = budgetToKey();
    if (to < from) to = from;
    const months = monthRange(from, to);
    const b = loadBudgets();
    
    document.querySelectorAll("#budgetSettings input[data-main]").forEach(inp => {
        const main = inp.getAttribute("data-main");
        const val = parseFloat(inp.value) > 0 ? parseFloat(inp.value) : 0;
        if (inp.getAttribute("data-mixed") === "1" && inp.value === "") return;   // different amounts per month: leave as is
        
        months.forEach(k => {
            b[k] = b[k] || {};
            if (val > 0) b[k][main] = val; else delete b[k][main];      // empty = no limit for that month
            if (Object.keys(b[k]).length === 0) delete b[k];
        });
    });
    
    saveBudgets(b);
    showToast(months.length === 1 ? `✅ Budget saved for ${monthLabel(from)}` : `✅ Budget saved for ${months.length} months`);
    renderBudgetSettings();
    calcTotal();
};

// ==================== BALANCE PAGE: MONTH FILTER, MONTHLY SUMMARY, CHART ====================
window.balanceYear = "";        // "" = all years
window.balanceMonthNum = "";    // "" = all months, else "01".."12"
window.balanceMonth = "";       // "YYYY-MM" only when BOTH year and month are chosen (used for budgets)
const _origRenderBalance = window.renderBalance;

window.renderBalance = function (entries) { renderBalancePage(entries); };

// called by the Year / Month dropdowns
window.setBalanceFilter = function () {
    window.balanceYear = (document.getElementById("balanceYear") || {}).value || "";
    window.balanceMonthNum = (document.getElementById("balanceMonthSel") || {}).value || "";
    calcTotal();
};

// called when a row of the Monthly Summary table is tapped ("YYYY-MM")
window.setBalanceMonth = function (value) {
    const p = (value || "").split("-");
    window.balanceYear = p[0] || "";
    window.balanceMonthNum = p[1] || "";
    calcTotal();
};

function renderBalancePage(entries) {
    try {
        const months = [...new Set(entries.map(e => monthKeyOf(e.date)).filter(Boolean))].sort().reverse();
        const years = [...new Set(months.map(k => k.split("-")[0]))];
        if (window.balanceYear && !years.includes(window.balanceYear)) { window.balanceYear = ""; }
        
        const ySel = document.getElementById("balanceYear"), mSel = document.getElementById("balanceMonthSel");
        if (ySel) {
            ySel.innerHTML = '<option value="">All years</option>' + years.map(y => `<option value="${y}">${y}</option>`).join("");
            ySel.value = window.balanceYear;
        }
        if (mSel) {
            mSel.innerHTML = '<option value="">All months</option>' +
                MONTH_NAMES.map((n, i) => `<option value="${String(i + 1).padStart(2, "0")}">${n}</option>`).join("");
            mSel.value = window.balanceMonthNum;
        }
        window.balanceMonth = window.balanceYear && window.balanceMonthNum ? `${window.balanceYear}-${window.balanceMonthNum}` : "";
        
        const f = entries.filter(e => {
            if (!window.balanceYear && !window.balanceMonthNum) return true;
            const k = monthKeyOf(e.date);
            if (!k) return false;
            const [ky, km] = k.split("-");
            return (!window.balanceYear || ky === window.balanceYear) && (!window.balanceMonthNum || km === window.balanceMonthNum);
        });
        
        const income = f.filter(e => e.amount > 0).reduce((a, e) => a + e.amount, 0);
        const expense = Math.abs(f.filter(e => e.amount < 0).reduce((a, e) => a + e.amount, 0));
        const net = income - expense;
        const setText = (id, t) => { const el = document.getElementById(id); if (el) el.innerText = t; };
        setText("totalIncome", `PKR ${formatAmountPlain(income)}`);
        setText("totalExpense", `PKR ${formatAmountPlain(expense)}`);
        setText("netBalance", `${net < 0 ? "-" : ""}PKR ${formatAmountPlain(Math.abs(net))}`);
        const netEl = document.getElementById("netBalance");
        if (netEl) netEl.style.color = net >= 0 ? "#2e7d32" : "#c62828";
        
        if (typeof _origRenderBalance === "function") _origRenderBalance(f);
        renderMonthlySummary(entries, months);
        renderCategoryChart(f);
    } catch (error) {
        console.error("❌ Error in renderBalancePage:", error);
    }
}

function renderMonthlySummary(entries, months) {
    const box = document.getElementById("monthlySummary");
    if (!box) return;
    if (months.length === 0) { box.innerHTML = '<p style="color:#888;">No dated transactions yet.</p>'; return; }
    
    const agg = {};
    entries.forEach(e => {
        const k = monthKeyOf(e.date);
        if (!k) return;
        agg[k] = agg[k] || { inc: 0, exp: 0 };
        if (e.amount > 0) agg[k].inc += e.amount; else agg[k].exp += -e.amount;
    });
    
    box.innerHTML = `
        <div class="monthly-scroll">
        <table class="monthly-table">
            <thead><tr><th>Month</th><th>Income</th><th>Expense</th><th>Net</th></tr></thead>
            <tbody>
            ${months.map(k => {
                const a = agg[k], net = a.inc - a.exp;
                return `<tr class="${k === window.balanceMonth ? "sel" : ""}" onclick="setBalanceMonth('${k}')">
                    <td>${monthLabel(k)}</td>
                    <td class="amount-positive">${fmtMoney(a.inc)}</td>
                    <td class="amount-negative">${fmtMoney(a.exp)}</td>
                    <td class="${net >= 0 ? "amount-positive" : "amount-negative"}">${net < 0 ? "-" : ""}${fmtMoney(net)}</td>
                </tr>`;
            }).join("")}
            </tbody>
        </table>
        </div>
        <small style="color:#888;">Tap a month to filter this page.</small>`;
}

function renderCategoryChart(f) {
    const box = document.getElementById("categoryChart");
    const alertBox = document.getElementById("budgetAlert");
    if (!box) return;
    
    const map = {};
    f.forEach(e => {
        const m = e.main || "(none)";
        map[m] = map[m] || { inc: 0, exp: 0 };
        if (e.amount > 0) map[m].inc += e.amount; else map[m].exp += -e.amount;
    });
    
    const rows = Object.entries(map).filter(([, v]) => v.inc > 0 || v.exp > 0).sort((a, b) => b[1].exp - a[1].exp);
    if (rows.length === 0) {
        box.innerHTML = '<p style="color:#888;">Nothing to show for this period.</p>';
        if (alertBox) alertBox.innerHTML = "";
        return;
    }
    
    const month = window.balanceMonth;
    const maxExp = Math.max(1, ...rows.map(r => r[1].exp));
    const over = [], near = [];
    let anyBudget = false;
    
    box.innerHTML = rows.map(([name, v]) => {
        const budget = month ? getBudgetFor(name, month) : null;
        let width = (v.exp / maxExp) * 100, cls = "bar-normal", budgetLine = "";
        
        if (budget) {
            anyBudget = true;
            const pct = (v.exp / budget) * 100;
            width = Math.min(100, pct);
            cls = pct >= 100 ? "bar-over" : pct >= 80 ? "bar-warn" : "bar-ok";
            if (pct >= 100) over.push(`${name} (${pct.toFixed(0)}%)`); else if (pct >= 80) near.push(`${name} (${pct.toFixed(0)}%)`);
            budgetLine = `<span class="budget-note ${cls}-text">Budget PKR ${fmtMoney(budget)} · ${pct.toFixed(0)}% used · ${pct >= 100 ? "over by PKR " + fmtMoney(v.exp - budget) : "left PKR " + fmtMoney(budget - v.exp)}</span>`;
        }
        
        return `
            <div class="cat-row">
                <div class="cat-head"><span class="cat-name">${escHtml(name)}</span>
                    <span class="amount-negative">${v.exp > 0 ? "-PKR " + fmtMoney(v.exp) : "PKR 0.00"}</span></div>
                <div class="bar"><div class="fill ${cls}" style="width:${width}%"></div></div>
                <div class="cat-sub">${v.inc > 0 ? `<span class="amount-positive">Income: +PKR ${fmtMoney(v.inc)}</span>` : ""}${budgetLine}</div>
            </div>`;
    }).join("");
    
    if (alertBox) {
        let html = "";
        if (over.length) html += `<div class="budget-alert over">🚨 Over budget: ${escHtml(over.join(", "))}</div>`;
        if (near.length) html += `<div class="budget-alert near">⚠️ Close to limit: ${escHtml(near.join(", "))}</div>`;
        if (!month && hasAnyBudget()) {
            html += '<div class="budget-alert info">💡 Choose a year AND a month above to see budget progress.</div>';
        }
        alertBox.innerHTML = html;
    }
}

// ==================== LEDGER: BULK SELECT / DELETE / CHANGE CATEGORY ====================
function selectedLedgerIds() {
    return [...document.querySelectorAll(".bulk-chk:checked")].map(c => c.getAttribute("data-id"));
}

window.updateBulkCount = function () {
    const el = document.getElementById("bulkCount");
    if (el) el.textContent = `${selectedLedgerIds().length} selected`;
};

document.addEventListener("change", e => {
    if (e.target && e.target.classList && e.target.classList.contains("bulk-chk")) updateBulkCount();
});

window.toggleBulkMode = function () {
    const page = document.getElementById("ledger");
    const bar = document.getElementById("bulkBar");
    if (!page) return;
    const on = page.classList.toggle("select-mode");
    if (bar) bar.style.display = on ? "flex" : "none";
    if (!on) document.querySelectorAll(".bulk-chk").forEach(c => { c.checked = false; });
    updateBulkCount();
};

window.bulkSelectAll = function () {
    const all = [...document.querySelectorAll(".bulk-chk")];
    const everyChecked = all.length > 0 && all.every(c => c.checked);
    all.forEach(c => { c.checked = !everyChecked; });
    updateBulkCount();
};

window.bulkDelete = async function () {
    const ids = selectedLedgerIds();
    if (ids.length === 0) { showToast("Select at least one entry"); return; }
    if (!confirm(`Delete ${ids.length} selected entries?\nThey are marked for deletion and removed from the cloud on next sync.`)) return;
    
    const set = new Set(ids);
    const entries = await allEntriesP();
    for (const e of entries.filter(x => set.has(x.id))) {
        e.syncRemarks = "deleted";
        await saveEntry(e);
    }
    loadSaved(); calcTotal(); loadLedger();
    showToast(`🗑️ ${ids.length} entries deleted`);
};

window.bulkChangeCategory = function () {
    const ids = selectedLedgerIds();
    if (ids.length === 0) { showToast("Select at least one entry"); return; }
    window.__bulkIds = ids;
    
    const mains = Object.keys(heads || {});
    const modal = document.createElement("div");
    modal.id = "bulkCatModal";
    modal.className = "app-modal";
    modal.innerHTML = `
        <div class="app-modal-box">
            <h3>📂 Change category</h3>
            <p style="color:#666;font-size:0.9em;margin-bottom:10px;">${ids.length} selected entries will move to:</p>
            <select id="bulkMain" onchange="fillBulkSubs()" style="width:100%;padding:10px;margin-bottom:8px;">
                ${mains.map(m => `<option value="${escHtml(m)}">${escHtml(m)}</option>`).join("")}
            </select>
            <select id="bulkSub" style="width:100%;padding:10px;margin-bottom:12px;"></select>
            <div style="display:flex;gap:10px;">
                <button class="primary-btn" style="flex:1;padding:10px;" onclick="applyBulkCategory()">Apply</button>
                <button class="secondary-btn" style="flex:1;padding:10px;" onclick="closeBulkCat()">Cancel</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    fillBulkSubs();
};

window.fillBulkSubs = function () {
    const main = (document.getElementById("bulkMain") || {}).value;
    const subSel = document.getElementById("bulkSub");
    if (!subSel) return;
    subSel.innerHTML = (heads[main] || []).map(s => `<option value="${escHtml(s)}">${escHtml(s)}</option>`).join("");
};

window.closeBulkCat = function () {
    const m = document.getElementById("bulkCatModal");
    if (m) m.remove();
};

window.applyBulkCategory = async function () {
    const main = document.getElementById("bulkMain").value;
    const sub = document.getElementById("bulkSub").value;
    if (!main || !sub) { alert("Please choose both a main and a sub category (add a sub category in Settings if empty)."); return; }
    
    const set = new Set(window.__bulkIds || []);
    const entries = await allEntriesP();
    for (const e of entries.filter(x => set.has(x.id))) {
        e.main = main; e.sub = sub;
        e.synced = false;
        e.syncRemarks = e.syncRemarks === "new" ? "new" : "edited";
        await saveEntry(e);
    }
    closeBulkCat();
    loadSaved(); calcTotal(); loadLedger();
    showToast(`✅ ${set.size} entries moved to ${main} › ${sub}`);
};

// ==================== CATEGORY SETTINGS: RENAME / MERGE / SAFE DELETE ====================
async function touchEntry(e) {
    if (e.syncRemarks === "deleted") { await saveEntry(e); return; }   // pending delete: keep as is
    e.synced = false;
    e.syncRemarks = e.syncRemarks === "new" ? "new" : "edited";
    await saveEntry(e);
}

window.renameMainHead = async function (old) {
    const input = prompt(`Rename main category "${old}" to:`, old);
    const nw = (input || "").trim();
    if (!nw || nw === old) return;
    
    if (heads[nw] && !confirm(`"${nw}" already exists.\nMerge "${old}" into "${nw}"? All entries and sub categories will move there.`)) return;
    
    const entries = await allEntriesP();
    let n = 0;
    for (const e of entries.filter(x => x.main === old)) {
        e.main = nw;
        await touchEntry(e);
        if (e.syncRemarks !== "deleted") n++;
    }
    
    heads[nw] = heads[nw] || [];
    (heads[old] || []).forEach(s => { if (!heads[nw].includes(s)) heads[nw].push(s); });
    delete heads[old];
    renameBudgetKey(old, nw);
    
    saveHeads();
    loadSaved(); calcTotal(); loadLedger();
    showToast(`✅ Renamed to "${nw}" (${n} entries updated)`);
};

window.renameSubHead = async function (main, old) {
    const input = prompt(`Rename sub category "${old}" (in ${main}) to:`, old);
    const nw = (input || "").trim();
    if (!nw || nw === old) return;
    
    const exists = (heads[main] || []).includes(nw);
    if (exists && !confirm(`"${nw}" already exists in ${main}.\nMerge "${old}" into it?`)) return;
    
    const entries = await allEntriesP();
    let n = 0;
    for (const e of entries.filter(x => x.main === main && x.sub === old)) {
        e.sub = nw;
        await touchEntry(e);
        if (e.syncRemarks !== "deleted") n++;
    }
    
    heads[main] = (heads[main] || []).filter(s => s !== old);
    if (!exists) heads[main].push(nw);
    
    saveHeads();
    loadSaved(); calcTotal(); loadLedger();
    showToast(`✅ Renamed to "${nw}" (${n} entries updated)`);
};

// Deleting a category that still has entries would silently bring it back, so we block it.
const _deleteMainHead = window.deleteMainHead;
window.deleteMainHead = async function (m) {
    const entries = await allEntriesP();
    const n = entries.filter(e => e.main === m && e.syncRemarks !== "deleted").length;
    if (n > 0) {
        alert(`"${m}" is used by ${n} entries.\n\nUse ✏️ Rename to merge it into another category (type that category's name), or delete those entries first.`);
        return;
    }
    _deleteMainHead(m);
};

const _deleteSubHead = window.deleteSubHead;
window.deleteSubHead = async function (m, s) {
    const entries = await allEntriesP();
    const n = entries.filter(e => e.main === m && e.sub === s && e.syncRemarks !== "deleted").length;
    if (n > 0) {
        alert(`"${s}" is used by ${n} entries.\n\nUse ✏️ Rename to merge it into another sub category, or delete those entries first.`);
        return;
    }
    _deleteSubHead(m, s);
};

// Re-implemented so each category gets a ✏️ rename button (same behaviour otherwise)
window.renderHeads = function () {
    try {
        const mainForSub = document.getElementById("mainForSub");
        const entryMain = document.getElementById("entryMain");
        const headList = document.getElementById("headList");
        
        if (mainForSub) mainForSub.innerHTML = '<option value="">-- Select Main --</option>';
        if (entryMain) entryMain.innerHTML = '<option value="">-- Select Main --</option>';
        if (headList) headList.innerHTML = "";
        
        for (const main in heads) {
            [mainForSub, entryMain].forEach(sel => {
                if (!sel) return;
                const o = document.createElement("option");
                o.value = main; o.textContent = main;
                sel.appendChild(o);
            });
            
            if (headList) {
                const mArg = escHtml(JSON.stringify(main));
                const li = document.createElement("li");
                li.innerHTML = `
                    <div class="category-item">
                        <span class="main-category"><strong>${escHtml(main)}</strong></span>
                        <button onclick="renameMainHead(${mArg})" class="small-btn">✏️ Rename</button>
                        <button onclick="deleteMainHead(${mArg})" class="small-btn danger-btn">🗑️ Delete</button>
                        <ul class="subcategory-list">
                            ${(heads[main] || []).map(sub => {
                                const sArg = escHtml(JSON.stringify(sub));
                                return `
                                <li>
                                    <span>${escHtml(sub)}</span>
                                    <span class="sub-actions">
                                        <button onclick="renameSubHead(${mArg},${sArg})" class="small-btn">✏️</button>
                                        <button onclick="deleteSubHead(${mArg},${sArg})" class="small-btn">❌</button>
                                    </span>
                                </li>`;
                            }).join("")}
                        </ul>
                    </div>`;
                headList.appendChild(li);
            }
        }
    } catch (error) {
        console.error("❌ Error in renderHeads:", error);
    }
};

// ==================== EXPORT LEDGER: EXCEL + PDF ====================
window.exportLedgerExcel = function () {
    const rows = window.lastLedgerRows || [];
    if (rows.length === 0) { showToast("No transactions to export"); return; }
    
    const body = rows.map(e => `<tr>
        <td>${escHtml(e.date)}</td><td>${escHtml(e.main)}</td><td>${escHtml(e.sub)}</td>
        <td>${escHtml(e.desc)}</td><td>${e.amount}</td><td>${e.runBal}</td></tr>`).join("");
    
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
        <head><meta charset="UTF-8"></head><body><table border="1">
        <tr><th>Date</th><th>Main Category</th><th>Sub Category</th><th>Description</th><th>Amount</th><th>Running Balance</th></tr>
        ${body}</table></body></html>`;
    
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel" }));
    a.download = `ledger_${new Date().toISOString().split("T")[0]}.xls`;
    document.body.appendChild(a); a.click(); a.remove();
    showToast("📊 Excel file created (open it with Excel / WPS)");
};

window.printLedger = function () {
    document.body.classList.add("printing-ledger");
    setTimeout(() => {
        window.print();
        setTimeout(() => document.body.classList.remove("printing-ledger"), 500);
    }, 100);
};

// ==================== SAFER LOGOUT ====================
const _logout = window.logout;
window.logout = async function () {
    try {
        const pending = await getEntriesNeedingSync();
        const budgetsPending = !!localStorage.getItem(budgetPendingKey());
        if (budgetsPending) await pushBudgets();                       // try to upload budgets first
        const budgetsStillPending = !!localStorage.getItem(budgetPendingKey());
        if (pending.length > 0 || budgetsStillPending) {
            const go = confirm(
                `⚠️ ${pending.length} entries${budgetsStillPending ? " and your budget changes are" : " are"} NOT synced to the cloud yet.\n\n` +
                `Logout DELETES the data stored on this phone, so these entries would be lost.\n\n` +
                `Press Cancel, then tap "Sync TO Cloud" first.\nPress OK only if you really want to logout anyway.`
            );
            if (!go) return;
        }
    } catch (e) { console.error(e); }
    _logout();
};

// ==================== AUTO-SYNC WHEN BACK ONLINE ====================
let autoSyncRunning = false;

async function autoSync() {
    if (autoSyncRunning || !navigator.onLine) return;
    if (typeof authToken === "undefined" || !authToken) return;
    if (typeof sessionExpiredShown !== "undefined" && sessionExpiredShown) return;
    
    try {
        if (localStorage.getItem(budgetPendingKey())) pushBudgets();
        const pending = await getEntriesNeedingSync();
        if (pending.length === 0) return;
        
        autoSyncRunning = true;
        const realAlert = window.alert;
        window.alert = msg => showToast(String(msg).split("\n")[0], 4000);   // no pop-ups for automatic sync
        try {
            await syncWithCloud();
        } finally {
            window.alert = realAlert;
            autoSyncRunning = false;
        }
    } catch (e) {
        autoSyncRunning = false;
        console.error("Auto-sync error:", e);
    }
}

window.addEventListener("online", () => setTimeout(() => { autoSync(); pullBudgets(); }, 2000));
window.addEventListener("load", () => setTimeout(pullBudgets, 3000));

// after a fresh login the app downloads the entries; download the budgets as well
if (typeof window.loadDataFromCloudOnLogin === "function") {
    const _loadCloud = window.loadDataFromCloudOnLogin;
    window.loadDataFromCloudOnLogin = async function (...args) {
        const result = await _loadCloud.apply(this, args);
        try { await pullBudgets(); } catch (e) { console.error(e); }
        return result;
    };
}
window.addEventListener("load", () => setTimeout(autoSync, 8000));

// ==================== BOTTOM NAV, MORE MENU, DARK MODE ====================
window.setActiveNav = function (id) {
    document.querySelectorAll("#mainNav button[data-nav]").forEach(b => {
        const key = b.dataset.nav;
        b.classList.toggle("active", key === id || (key === "more" && (id === "search" || id === "settings")));
    });
    closeMoreMenu();
};

window.toggleMoreMenu = function () {
    const m = document.getElementById("moreMenu");
    if (m) m.style.display = m.style.display === "block" ? "none" : "block";
};

window.closeMoreMenu = function () {
    const m = document.getElementById("moreMenu");
    if (m) m.style.display = "none";
};

function applyTheme(dark) {
    document.body.classList.toggle("dark", dark);
    const label = document.getElementById("themeLabel");
    if (label) label.textContent = dark ? "☀️ Light mode" : "🌙 Dark mode";
}

window.toggleDarkMode = function () {
    const dark = !document.body.classList.contains("dark");
    localStorage.setItem("theme", dark ? "dark" : "light");
    applyTheme(dark);
    closeMoreMenu();
};

document.addEventListener("click", e => {
    const menu = document.getElementById("moreMenu");
    if (!menu || menu.style.display !== "block") return;
    if (!menu.contains(e.target) && !e.target.closest('[data-nav="more"]')) closeMoreMenu();
});

const _showPage = window.showPage;
window.showPage = function (id) {
    _showPage(id);
    setActiveNav(id);
    if (id === "settings") setTimeout(renderBudgetSettings, 50);
    window.scrollTo(0, 0);
};

applyTheme(localStorage.getItem("theme") === "dark");

// ==================== TRANSFER BETWEEN CATEGORIES (creates two normal entries) ====================
// Example: loan of 2,000 from Account > Alfa DGK to Loan > Umer  ->  -2,000 in Account and +2,000 in Loan.
// The two entries are independent (no link/ID between them), so no database change is needed.
function trLastKey() { return `transfer_last_${getCurrentUserId()}`; }

function trOptions(list, selected, placeholder) {
    return `<option value="">${placeholder}</option>` +
        list.map(v => `<option value="${escHtml(v)}"${v === selected ? " selected" : ""}>${escHtml(v)}</option>`).join("");
}

window.trFillSubs = function (side, selectedSub) {
    const main = (document.getElementById(`tr${side}Main`) || {}).value;
    const subSel = document.getElementById(`tr${side}Sub`);
    if (!subSel) return;
    subSel.innerHTML = trOptions(heads[main] || [], selectedSub, "-- Sub category --");
};

window.showTransferDialog = function () {
    if (document.getElementById("transferModal")) return;
    const mains = Object.keys(heads || {});
    if (mains.length === 0) { alert("Add categories first (Settings)."); return; }
    
    let last = {};
    try { last = JSON.parse(localStorage.getItem(trLastKey())) || {}; } catch (e) { /* ignore */ }
    // first time: guess Account -> Loan from the category names
    const guess = re => mains.find(m => re.test(m)) || "";
    const fm = last.fm && heads[last.fm] ? last.fm : guess(/account|bank|cash/i);
    const tm = last.tm && heads[last.tm] ? last.tm : guess(/loan/i);
    
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    
    const modal = document.createElement("div");
    modal.id = "transferModal";
    modal.className = "app-modal";
    modal.innerHTML = `
        <div class="app-modal-box transfer-box">
            <h3>🔁 Transfer / Loan</h3>
            <p class="tr-hint">One entry here creates <strong>two entries</strong>: minus in FROM, plus in TO.</p>
            
            <div class="tr-block tr-from">
                <label>FROM &nbsp;(money goes out, −)</label>
                <select id="trFromMain" onchange="trFillSubs('From')">${trOptions(mains, fm, "-- Main category --")}</select>
                <select id="trFromSub"></select>
            </div>
            
            <button type="button" class="tr-swap" onclick="swapTransfer()">⇅ Swap (for repayment)</button>
            
            <div class="tr-block tr-to">
                <label>TO &nbsp;(money comes in, +)</label>
                <select id="trToMain" onchange="trFillSubs('To')">${trOptions(mains, tm, "-- Main category --")}</select>
                <select id="trToSub"></select>
            </div>
            
            <label class="tr-label">Amount</label>
            <input type="number" id="trAmount" placeholder="e.g. 2000" step="0.01" min="0" inputmode="decimal">
            <label class="tr-label">Date</label>
            <input type="date" id="trDate" value="${todayStr}">
            <label class="tr-label">Description (optional)</label>
            <input type="text" id="trDesc" placeholder="Leave empty for automatic text">
            
            <div class="tr-buttons">
                <button class="primary-btn" onclick="saveTransfer()">💾 Save both entries</button>
                <button class="secondary-btn" onclick="closeTransfer()">Cancel</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    trFillSubs("From", last.fs);
    trFillSubs("To", last.ts);
};

window.closeTransfer = function () {
    const m = document.getElementById("transferModal");
    if (m) m.remove();
};

window.swapTransfer = function () {
    const v = id => document.getElementById(id).value;
    const fm = v("trFromMain"), fs = v("trFromSub"), tm = v("trToMain"), ts = v("trToSub");
    document.getElementById("trFromMain").value = tm;
    document.getElementById("trToMain").value = fm;
    trFillSubs("From", ts);
    trFillSubs("To", fs);
};

window.saveTransfer = async function () {
    const v = id => document.getElementById(id).value;
    const fm = v("trFromMain"), fs = v("trFromSub"), tm = v("trToMain"), ts = v("trToSub");
    const amount = Math.abs(parseFloat(v("trAmount")));
    const dateRaw = v("trDate");
    const typed = v("trDesc").trim();
    
    if (!fm || !fs || !tm || !ts) { alert("Please choose main and sub category for both FROM and TO."); return; }
    if (fm === tm && fs === ts) { alert("FROM and TO cannot be the same category."); return; }
    if (!(amount > 0)) { alert("Please enter an amount greater than 0."); return; }
    if (!dateRaw) { alert("Please choose a date."); return; }
    
    const [y, m, d] = dateRaw.split("-");
    const date = `${d}-${m}-${y}`;                         // DD-MM-YYYY, built from the text (no timezone shift)
    const now = new Date().toISOString();
    
    const make = (main, sub, signedAmount, desc) => ({
        id: generateEntryId(), date, desc, amount: signedAmount, main, sub,
        synced: false, syncRemarks: "new", created_at: now, updated_at: now
    });
    
    try {
        await saveEntry(make(fm, fs, -amount, typed || `Transfer to ${tm} › ${ts}`));
        await saveEntry(make(tm, ts, amount, typed || `Transfer from ${fm} › ${fs}`));
    } catch (e) {
        alert("Error saving transfer: " + e.message);
        return;
    }
    
    localStorage.setItem(trLastKey(), JSON.stringify({ fm, fs, tm, ts }));
    closeTransfer();
    loadSaved(); calcTotal(); loadLedger(); updateSyncStatus();
    showToast(`✅ ${formatAmountPlain(amount)}: ${fm} › ${fs}  →  ${tm} › ${ts}`, 4500);
};

console.log("✅ features.js loaded");
