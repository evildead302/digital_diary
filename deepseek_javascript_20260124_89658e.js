// app.js - SIMPLIFIED FIXED VERSION

// ==================== GLOBAL VARIABLES ====================
const pages = document.querySelectorAll(".page");
let heads = JSON.parse(localStorage.getItem("heads")) || {};
let tempEntries = [];
let isEditing = false;
let editingEntryId = null;
let authToken = localStorage.getItem('auth_token');
let currentUser = JSON.parse(localStorage.getItem('auth_user') || 'null');
let currentUserId = currentUser ? currentUser.id : null;

// ==================== INITIALIZATION ====================
document.addEventListener("DOMContentLoaded", function() {
    console.log("DOM Content Loaded");
    
    // Set today's date
    const today = new Date().toISOString().split("T")[0];
    const dateInput = document.getElementById("date");
    if (dateInput) dateInput.value = today;
    
    // Initialize UI
    updateAllDropdowns();
    
    // Check authentication
    checkAuth();
});

// ==================== AUTHENTICATION FUNCTIONS ====================
async function login() {
    const email = document.getElementById("authEmail").value;
    const password = document.getElementById("authPassword").value;
    const errorEl = document.getElementById("authError");
    const statusEl = document.getElementById("authStatus");
    
    if (!email || !password) {
        if (errorEl) errorEl.textContent = "Please enter both email and password";
        return;
    }
    
    errorEl.textContent = "";
    if (statusEl) statusEl.textContent = "Logging in...";
    
    console.log("Login attempt for:", email);
    
    try {
        // Use relative URL
        const response = await fetch("/api/login", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        console.log("Login response:", data);
        
        if (data.success && data.token && data.user) {
            // Save to localStorage
            localStorage.setItem("auth_token", data.token);
            localStorage.setItem("auth_user", JSON.stringify(data.user));
            
            if (statusEl) statusEl.textContent = "✅ Login successful!";
            
            // Reload the page to initialize app
            setTimeout(() => {
                window.location.reload();
            }, 1000);
            
        } else {
            if (errorEl) errorEl.textContent = data.message || "Login failed";
            if (statusEl) statusEl.textContent = "";
        }
    } catch (error) {
        console.error("Login error:", error);
        if (errorEl) errorEl.textContent = `Login failed: ${error.message}`;
        if (statusEl) statusEl.textContent = "";
    }
}

async function register() {
    const email = document.getElementById("authEmail").value;
    const password = document.getElementById("authPassword").value;
    const errorEl = document.getElementById("authError");
    const statusEl = document.getElementById("authStatus");
    
    if (!email || !password) {
        if (errorEl) errorEl.textContent = "Please enter both email and password";
        return;
    }
    
    if (password.length < 6) {
        if (errorEl) errorEl.textContent = "Password must be at least 6 characters";
        return;
    }
    
    errorEl.textContent = "";
    if (statusEl) statusEl.textContent = "Registering...";
    
    console.log("Registration attempt for:", email);
    
    try {
        // Use relative URL
        const response = await fetch("/api/register", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify({ 
                email, 
                password,
                name: email.split("@")[0]
            })
        });
        
        const data = await response.json();
        console.log("Registration response:", data);
        
        if (data.success && data.token && data.user) {
            // Save to localStorage
            localStorage.setItem("auth_token", data.token);
            localStorage.setItem("auth_user", JSON.stringify(data.user));
            
            if (statusEl) statusEl.textContent = "✅ Registration successful!";
            
            // Reload the page to initialize app
            setTimeout(() => {
                window.location.reload();
            }, 1000);
            
        } else {
            if (errorEl) errorEl.textContent = data.message || "Registration failed";
            if (statusEl) statusEl.textContent = "";
        }
    } catch (error) {
        console.error("Registration error:", error);
        if (errorEl) errorEl.textContent = `Registration failed: ${error.message}`;
        if (statusEl) statusEl.textContent = "";
    }
}

function logout() {
    if (confirm("Are you sure you want to logout?")) {
        // Clear auth data
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_user");
        localStorage.removeItem("current_user_id");
        
        // Show auth screen
        document.getElementById("authScreen").style.display = "block";
        document.getElementById("appScreen").style.display = "none";
    }
}

// ==================== CHECK AUTHENTICATION ====================
function checkAuth() {
    console.log("Checking authentication...");
    console.log("Token exists:", !!authToken);
    console.log("User exists:", !!currentUser);
    
    if (authToken && currentUser) {
        console.log("User is authenticated:", currentUser.email);
        showAppScreen();
    } else {
        console.log("No authentication found");
        showAuthScreen();
    }
}

function showAuthScreen() {
    document.getElementById("authScreen").style.display = "block";
    document.getElementById("appScreen").style.display = "none";
}

function showAppScreen() {
    document.getElementById("authScreen").style.display = "none";
    document.getElementById("appScreen").style.display = "block";
    
    // Initialize user data
    document.getElementById("userName").textContent = currentUser.email || currentUser.name || "User";
    document.getElementById("settingsUserEmail").textContent = currentUser.email;
    
    // Initialize app
    initApp();
    
    // Show home page
    showPage('home');
}

// ==================== INITIALIZE APP ====================
function initApp() {
    console.log("Initializing app...");
    
    // Initialize database if available
    if (window.dbAPI && currentUserId) {
        if (typeof window.dbAPI.initDatabaseForUser === 'function') {
            window.dbAPI.initDatabaseForUser(currentUserId);
        } else if (typeof window.dbAPI.setCurrentUserId === 'function') {
            window.dbAPI.setCurrentUserId(currentUserId);
        }
    }
    
    // Update UI
    updateAllDropdowns();
    calcTotal();
    loadSaved();
    
    // Test API connection
    testAPI();
}

// ==================== BASE61 ID GENERATION ====================
class Base61 {
    static characters = '123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    
    static encode(num) {
        if (num === 0) return this.characters[0];
        let result = '';
        const base = this.characters.length;
        while (num > 0) {
            const remainder = num % base;
            result = this.characters[remainder] + result;
            num = Math.floor(num / base);
        }
        return result;
    }
    
    static random(length) {
        let result = '';
        const charsLength = this.characters.length;
        for (let i = 0; i < length; i++) {
            const randomIndex = Math.floor(Math.random() * charsLength);
            result += this.characters[randomIndex];
        }
        return result;
    }
    
    static getTimestampString(date = new Date()) {
        const year = date.getFullYear().toString().slice(-2);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        const tenths = String(Math.floor(date.getMilliseconds() / 100)).padStart(1, '0');
        return year + month + day + hours + minutes + seconds + tenths;
    }
    
    static timestampToBase61(timestampStr) {
        const num = parseInt(timestampStr, 10);
        return this.encode(num);
    }
    
    static generateBase61Timestamp(date = new Date()) {
        const timestampStr = this.getTimestampString(date);
        return this.timestampToBase61(timestampStr);
    }
    
    // Generate entry ID with timestamp + random + user ID
    static generateEntryId(userId) {
        if (!userId) {
            console.error("Cannot generate entry ID: No user ID");
            return 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }
        const timestampBase61 = this.generateBase61Timestamp();
        const randomPart = this.random(3);
        return timestampBase61 + randomPart + userId;
    }
}

function generateEntryId() {
    if (!currentUserId) {
        console.error("No user ID available for entry generation");
        return 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    return Base61.generateEntryId(currentUserId);
}

// ==================== PAGE NAVIGATION ====================
function showPage(id) {
    pages.forEach(p => {
        p.classList.remove("active");
        p.style.display = "none";
    });
    
    const page = document.getElementById(id);
    if (page) {
        page.style.display = "block";
        setTimeout(() => {
            page.classList.add("active");
        }, 10);
        
        // Initialize page-specific functions
        switch(id) {
            case "home":
                loadHomeData();
                break;
            case "entry":
                updateEntryDropdowns();
                loadSaved();
                resetEntryForm();
                break;
            case "balance":
                calcTotal();
                break;
            case "ledger":
                updateLedgerCategories();
                loadLedger();
                break;
            case "search":
                updateSearchCategories();
                break;
            case "settings":
                renderHeads();
                testAPI();
                break;
        }
    }
}

// ==================== DROPDOWN FUNCTIONS ====================
function updateAllDropdowns() {
    updateEntryDropdowns();
    updateLedgerCategories();
    updateSearchCategories();
    renderHeads();
}

function updateEntryDropdowns() {
    const entryMain = document.getElementById("entryMain");
    const entrySub = document.getElementById("entrySub");
    
    if (!entryMain || !entrySub) return;
    
    const selectedMain = entryMain.value;
    
    entryMain.innerHTML = '<option value="">-- Select Main --</option>';
    for (let main in heads) {
        const option = document.createElement("option");
        option.value = main;
        option.textContent = main;
        if (main === selectedMain) option.selected = true;
        entryMain.appendChild(option);
    }
    
    updateEntrySubheads();
}

function updateEntrySubheads() {
    const entryMain = document.getElementById("entryMain");
    const entrySub = document.getElementById("entrySub");
    
    if (!entryMain || !entrySub) return;
    
    const selectedMain = entryMain.value;
    entrySub.innerHTML = '<option value="">-- Select Sub --</option>';
    
    if (selectedMain && heads[selectedMain]) {
        heads[selectedMain].forEach(sub => {
            const option = document.createElement("option");
            option.value = sub;
            option.textContent = sub;
            entrySub.appendChild(option);
        });
    }
}

function updateLedgerCategories() {
    const ledgerMain = document.getElementById("ledgerMain");
    if (!ledgerMain) return;
    
    ledgerMain.innerHTML = '<option value="">All Categories</option>';
    for (let mainCategory in heads) {
        const option = document.createElement("option");
        option.value = mainCategory;
        option.textContent = mainCategory;
        ledgerMain.appendChild(option);
    }
    updateLedgerSubheads();
}

function updateLedgerSubheads() {
    const mainSelect = document.getElementById("ledgerMain");
    const subSelect = document.getElementById("ledgerSub");
    
    if (!mainSelect || !subSelect) return;
    
    const selectedMain = mainSelect.value;
    subSelect.innerHTML = '<option value="">All Sub-categories</option>';
    
    if (selectedMain && heads[selectedMain]) {
        heads[selectedMain].forEach(subCategory => {
            const option = document.createElement("option");
            option.value = subCategory;
            option.textContent = subCategory;
            subSelect.appendChild(option);
        });
    }
}

function updateSearchCategories() {
    const searchCategory = document.getElementById("searchCategory");
    if (!searchCategory) return;
    
    searchCategory.innerHTML = '<option value="">All Categories</option>';
    for (let mainCategory in heads) {
        const option = document.createElement("option");
        option.value = mainCategory;
        option.textContent = mainCategory;
        searchCategory.appendChild(option);
    }
}

function renderHeads() {
    const mainForSub = document.getElementById("mainForSub");
    const entryMain = document.getElementById("entryMain");
    const headList = document.getElementById("headList");
    
    if (mainForSub) mainForSub.innerHTML = '<option value="">-- Select Main --</option>';
    if (entryMain) entryMain.innerHTML = '<option value="">-- Select Main --</option>';
    if (headList) headList.innerHTML = "";
    
    for(let main in heads) {
        if (mainForSub) {
            const option1 = document.createElement("option");
            option1.value = main;
            option1.textContent = main;
            mainForSub.appendChild(option1);
        }
        
        if (entryMain) {
            const option2 = document.createElement("option");
            option2.value = main;
            option2.textContent = main;
            entryMain.appendChild(option2);
        }
        
        if (headList) {
            const li = document.createElement("li");
            li.innerHTML = `
                <div class="category-item">
                    <span class="main-category"><strong>${main}</strong></span>
                    <button onclick="deleteMainHead('${main}')" class="small-btn danger-btn">🗑️ Delete</button>
                    <ul class="subcategory-list">
                        ${heads[main].map(sub => `
                            <li>
                                <span>${sub}</span>
                                <button onclick="deleteSubHead('${main}','${sub}')" class="small-btn">❌</button>
                            </li>
                        `).join("")}
                    </ul>
                </div>
            `;
            headList.appendChild(li);
        }
    }
}

// ==================== CATEGORY MANAGEMENT ====================
function addMainHead() {
    const mainHeadInput = document.getElementById("mainHeadInput");
    if (!mainHeadInput || !mainHeadInput.value.trim()) {
        alert("Please enter a main category name");
        return;
    }
    
    const mainHead = mainHeadInput.value.trim();
    
    if (heads[mainHead]) {
        alert("Main category already exists!");
        return;
    }
    
    heads[mainHead] = [];
    mainHeadInput.value = "";
    saveHeads();
    alert(`✅ Added main category: ${mainHead}`);
}

function addSubHead() {
    const mainForSub = document.getElementById("mainForSub");
    const subHeadInput = document.getElementById("subHeadInput");
    
    if (!mainForSub || !mainForSub.value) {
        alert("Please select a main category first");
        return;
    }
    
    if (!subHeadInput || !subHeadInput.value.trim()) {
        alert("Please enter a sub category name");
        return;
    }
    
    const main = mainForSub.value;
    const sub = subHeadInput.value.trim();
    
    if (heads[main].includes(sub)) {
        alert("Sub category already exists!");
        return;
    }
    
    heads[main].push(sub);
    subHeadInput.value = "";
    saveHeads();
    alert(`✅ Added sub category: ${sub} under ${main}`);
}

function saveHeads() {
    localStorage.setItem("heads", JSON.stringify(heads));
    updateAllDropdowns();
}

function deleteMainHead(m) {
    if (!confirm(`Delete main category "${m}" and all its sub-categories?`)) return;
    delete heads[m];
    saveHeads();
    alert(`✅ Deleted main category: ${m}`);
}

function deleteSubHead(m, s) {
    if (!confirm(`Delete sub category "${s}" from "${m}"?`)) return;
    heads[m] = heads[m].filter(x => x !== s);
    saveHeads();
    alert(`✅ Deleted sub category: ${s}`);
}

// ==================== TEMPORARY ENTRIES ====================
function addTemp() {
    const entryMain = document.getElementById("entryMain");
    const entrySub = document.getElementById("entrySub");
    const desc = document.getElementById("desc");
    const amount = document.getElementById("amount");
    const date = document.getElementById("date");
    
    if (!entryMain || !entryMain.value) {
        alert("Please select a main category");
        return;
    }
    
    if (!entrySub || !entrySub.value) {
        alert("Please select a sub category");
        return;
    }
    
    if (!desc || !desc.value.trim()) {
        alert("Please enter a description");
        return;
    }
    
    const amountValue = parseFloat(amount.value);
    if (isNaN(amountValue)) {
        alert("Please enter a valid amount");
        return;
    }
    
    const entryDate = date.value ? formatDate(date.value) : formatDate(new Date());
    
    tempEntries.push({
        date: entryDate,
        desc: desc.value.trim(),
        amount: amountValue,
        main: entryMain.value,
        sub: entrySub.value,
        synced: false,
        syncRemarks: "new"
    });
    
    desc.value = "";
    amount.value = "";
    
    renderTemp();
}

function renderTemp() {
    const tempList = document.getElementById("tempList");
    if (!tempList) return;
    
    tempList.innerHTML = "";
    
    if (tempEntries.length === 0) {
        tempList.innerHTML = '<div class="no-entries">No temporary entries</div>';
        return;
    }
    
    const tableContainer = document.createElement("div");
    tableContainer.className = "table-container";
    tableContainer.style.maxHeight = "400px";
    tableContainer.style.overflowY = "auto";
    tableContainer.style.overflowX = "auto";
    
    const table = document.createElement("table");
    table.className = "fixed-table";
    
    const thead = document.createElement("thead");
    thead.innerHTML = `
        <tr>
            <th>Date</th>
            <th>Main Category</th>
            <th>Sub Category</th>
            <th>Description</th>
            <th>Amount</th>
            <th>Actions</th>
        </tr>
    `;
    
    table.appendChild(thead);
    
    const tbody = document.createElement("tbody");
    
    tempEntries.forEach((entry, index) => {
        const row = document.createElement("tr");
        row.className = entry.amount < 0 ? "expense-row" : "income-row";
        
        row.innerHTML = `
            <td>${entry.date}</td>
            <td>${entry.main}</td>
            <td>${entry.sub}</td>
            <td>${entry.desc}</td>
            <td class="${entry.amount < 0 ? 'amount-negative' : 'amount-positive'}">
                ${entry.amount < 0 ? "-" : "+"}PKR ${Math.abs(entry.amount).toFixed(2)}
            </td>
            <td style="text-align: center;">
                <button onclick="editTemp(${index})" class="small-btn edit-btn">✏️</button>
                <button onclick="deleteTemp(${index})" class="small-btn danger-btn">🗑️</button>
            </td>
        `;
        
        tbody.appendChild(row);
    });
    
    table.appendChild(tbody);
    tableContainer.appendChild(table);
    tempList.appendChild(tableContainer);
}

function editTemp(i) {
    const e = tempEntries[i];
    
    document.getElementById("date").value = e.date.split("-").reverse().join("-");
    document.getElementById("desc").value = e.desc;
    document.getElementById("amount").value = e.amount;
    
    const entryMain = document.getElementById("entryMain");
    const entrySub = document.getElementById("entrySub");
    
    if (entryMain) {
        entryMain.value = e.main;
        updateEntrySubheads();
        
        setTimeout(() => {
            if (entrySub) entrySub.value = e.sub;
        }, 100);
    }
    
    tempEntries.splice(i, 1);
    renderTemp();
}

function deleteTemp(i) {
    if (confirm("Delete this temporary entry?")) {
        tempEntries.splice(i, 1);
        renderTemp();
    }
}

function clearTemp() {
    if (tempEntries.length > 0 && confirm("Clear all temporary entries?")) {
        tempEntries = [];
        renderTemp();
    }
}

// ==================== SAVED ENTRIES ====================
function loadSaved() {
    // This would normally get data from database
    // For now, we'll use a dummy function
    const savedEntryList = document.getElementById("savedEntryList");
    if (savedEntryList) {
        savedEntryList.innerHTML = '<div class="no-entries">No saved entries yet</div>';
    }
}

// ==================== BALANCE CALCULATION ====================
function calcTotal() {
    // This would normally calculate from database
    // For now, set default values
    document.getElementById("totalBalance").innerText = "PKR 0.00";
    document.getElementById("totalIncome").innerText = "PKR 0.00";
    document.getElementById("totalExpense").innerText = "PKR 0.00";
    document.getElementById("netBalance").innerText = "PKR 0.00";
    document.getElementById("entryCount").innerText = "📝 Total Entries: 0";
}

// ==================== OTHER FUNCTIONS ====================
function formatDate(v) {
    try {
        const d = new Date(v);
        return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth()+1).padStart(2, "0")}-${d.getFullYear()}`;
    } catch (error) {
        const today = new Date();
        return `${String(today.getDate()).padStart(2, "0")}-${String(today.getMonth()+1).padStart(2, "0")}-${today.getFullYear()}`;
    }
}

function saveAll() {
    if (tempEntries.length === 0) {
        alert("No entries to save");
        return;
    }
    
    alert(`Would save ${tempEntries.length} entries to database`);
    tempEntries = [];
    renderTemp();
}

function resetEntryForm() {
    const today = new Date().toISOString().split("T")[0];
    document.getElementById("date").value = today;
    document.getElementById("desc").value = "";
    document.getElementById("amount").value = "";
    document.getElementById("entryMain").value = "";
    document.getElementById("entrySub").value = "";
}

function cancelEdit() {
    resetEntryForm();
    const cancelBtn = document.getElementById("cancelEditBtn");
    if (cancelBtn) cancelBtn.style.display = "none";
}

// ==================== API TEST ====================
async function testAPI() {
    try {
        const response = await fetch("/api/health");
        const data = await response.json();
        
        const statusElement = document.getElementById("cloudSyncStatus");
        if (statusElement) {
            if (data.success) {
                statusElement.innerHTML = `
                    <div class="status-indicator status-connected">
                        ✅ Cloud Sync: Connected
                    </div>
                `;
            } else {
                statusElement.innerHTML = `
                    <div class="status-indicator status-disconnected">
                        ❌ Cloud Sync: Failed - ${data.message}
                    </div>
                `;
            }
        }
    } catch (error) {
        console.error("API test failed:", error);
        const statusElement = document.getElementById("cloudSyncStatus");
        if (statusElement) {
            statusElement.innerHTML = `
                <div class="status-indicator status-disconnected">
                    ❌ Cloud Sync: Connection failed
                </div>
            `;
        }
    }
}

// ==================== SIMPLIFIED FUNCTIONS FOR OTHER PAGES ====================
function loadHomeData() {
    calcTotal();
}

function loadLedger() {
    const tbody = document.getElementById("ledgerList");
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 20px;">
                    No transactions found. Add entries from the "Add Entry" page.
                </td>
            </tr>
        `;
    }
}

function resetLedgerFilters() {
    // Reset filter values
    document.getElementById("ledgerMain").value = "";
    document.getElementById("ledgerSub").value = "";
    document.getElementById("fromDate").value = "";
    document.getElementById("toDate").value = "";
    document.getElementById("typeFilter").value = "all";
    document.getElementById("minAmountFilter").value = "";
    document.getElementById("maxAmountFilter").value = "";
}

function performSearch() {
    const resultsList = document.getElementById("searchResults");
    if (resultsList) {
        resultsList.innerHTML = '<div class="no-results">📭 No transactions found</div>';
    }
}

function clearSearch() {
    document.getElementById("searchInput").value = "";
    document.getElementById("searchFromDate").value = "";
    document.getElementById("searchToDate").value = "";
    document.getElementById("minAmount").value = "";
    document.getElementById("maxAmount").value = "";
    document.getElementById("searchType").value = "all";
    document.getElementById("searchCategory").value = "";
    
    const resultsList = document.getElementById("searchResults");
    if (resultsList) {
        resultsList.innerHTML = '<div class="no-results">📭 No transactions found</div>';
    }
}

function quickSearch() {
    const term = prompt("Enter search term:");
    if (term) {
        showPage("search");
        document.getElementById("searchInput").value = term;
    }
}

console.log("✅ app.js loaded");