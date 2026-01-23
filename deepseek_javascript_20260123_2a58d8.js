// app.js - COMPLETE FIXED VERSION WITH DB INTEGRATION

// ==================== GLOBAL VARIABLES ====================
const pages = document.querySelectorAll(".page");
let heads = JSON.parse(localStorage.getItem("heads")) || {};
let tempEntries = [];
let isEditing = false;
let editingEntryId = null;
let authToken = localStorage.getItem("auth_token");
let currentUser = JSON.parse(localStorage.getItem("auth_user") || "null");
let currentUserId = currentUser ? currentUser.id : null;

// ==================== DATABASE INITIALIZATION ====================
async function initUserDatabase() {
    if (!currentUserId) {
        console.error("Cannot initialize database: No user ID");
        return false;
    }
    
    try {
        console.log("Initializing database for user:", currentUserId);
        
        if (typeof window.dbAPI?.initDatabaseForUser === 'function') {
            await window.dbAPI.initDatabaseForUser(currentUserId);
            console.log("✅ Database initialized for user:", currentUserId);
            return true;
        } else if (typeof window.dbAPI?.setCurrentUserId === 'function') {
            // Fallback for older db.js
            window.dbAPI.setCurrentUserId(currentUserId);
            console.log("✅ Using legacy database setup for user:", currentUserId);
            return true;
        } else {
            console.error("❌ Database API not available");
            return false;
        }
    } catch (error) {
        console.error("❌ Database initialization failed:", error);
        return false;
    }
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
    
    // FIXED: Generate entry ID with timestamp + random + user ID
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

// ==================== AUTHENTICATION ====================
async function checkAuth() {
    console.log('🔐 Checking authentication...', { 
        authToken: !!authToken, 
        currentUser: !!currentUser,
        currentUserId 
    });
    
    if (authToken && currentUser && currentUserId) {
        // Initialize database for this user FIRST
        const dbInitialized = await initUserDatabase();
        
        if (!dbInitialized) {
            console.error("Failed to initialize database. Showing auth screen.");
            showAuthScreen();
            return;
        }
        
        // Database ready, show app
        document.getElementById("authScreen").style.display = "none";
        document.getElementById("appScreen").style.display = "block";
        document.getElementById("userName").textContent = currentUser.email || currentUser.name || "User";
        document.getElementById("settingsUserEmail").textContent = currentUser.email;
        
        // Store user ID for entry generation
        currentUserId = currentUser.id;
        
        // Initialize user-specific data
        initUserData();
        initApp();
        
        // Redirect to home page
        showPage('home');
    } else {
        showAuthScreen();
    }
}

function showAuthScreen() {
    document.getElementById("authScreen").style.display = "block";
    document.getElementById("appScreen").style.display = "none";
}

async function login() {
    const email = document.getElementById("authEmail").value;
    const password = document.getElementById("authPassword").value;
    const errorEl = document.getElementById("authError");
    
    if (!email || !password) {
        errorEl.textContent = "Please enter both email and password";
        return;
    }
    
    errorEl.textContent = "";
    
    console.log("🔐 Attempting login for:", email);
    
    try {
        const response = await fetch("/api/login", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify({ email, password })
        });
        
        console.log("📥 Login response status:", response.status);
        
        let data;
        try {
            data = await response.json();
        } catch (parseError) {
            console.error("❌ Failed to parse response:", parseError);
            throw new Error(`Server returned invalid JSON (status: ${response.status})`);
        }
        
        console.log("📊 Login response data:", data);
        
        if (data.success) {
            authToken = data.token;
            currentUser = data.user;
            currentUserId = data.user.id;
            
            localStorage.setItem("auth_token", data.token);
            localStorage.setItem("auth_user", JSON.stringify(data.user));
            localStorage.setItem("current_user_id", data.user.id);
            
            // Clear any previous user's data from localStorage (but keep auth)
            clearOtherUserData();
            
            // Initialize database for this user
            await initUserDatabase();
            
            // Load data from Neon after successful login
            await loadDataFromCloudOnLogin();
            
            // Re-check auth (which will show the app)
            await checkAuth();
        } else {
            errorEl.textContent = data.message || "Login failed. Please check your credentials.";
        }
    } catch (error) {
        console.error("❌ Login error:", error);
        errorEl.textContent = `Login failed: ${error.message}. Please check your network connection.`;
    }
}

async function register() {
    const email = document.getElementById("authEmail").value;
    const password = document.getElementById("authPassword").value;
    const errorEl = document.getElementById("authError");
    
    if (!email || !password) {
        errorEl.textContent = "Please enter both email and password";
        return;
    }
    
    if (password.length < 6) {
        errorEl.textContent = "Password must be at least 6 characters";
        return;
    }
    
    errorEl.textContent = "";
    
    console.log("📝 Attempting registration for:", email);
    
    try {
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
        
        console.log("📥 Registration response status:", response.status);
        
        let data;
        try {
            data = await response.json();
        } catch (parseError) {
            console.error("❌ Failed to parse response:", parseError);
            throw new Error(`Server returned invalid JSON (status: ${response.status})`);
        }
        
        console.log("📊 Registration response:", data);
        
        if (data.success) {
            authToken = data.token;
            currentUser = data.user;
            currentUserId = data.user.id;
            
            localStorage.setItem("auth_token", data.token);
            localStorage.setItem("auth_user", JSON.stringify(data.user));
            localStorage.setItem("current_user_id", data.user.id);
            
            // Clear any previous user's data
            clearOtherUserData();
            
            // Initialize database for this new user
            await initUserDatabase();
            
            // Re-check auth (which will show the app)
            await checkAuth();
        } else {
            errorEl.textContent = data.message || "Registration failed. User may already exist.";
        }
    } catch (error) {
        console.error("❌ Registration error:", error);
        errorEl.textContent = `Registration failed: ${error.message}`;
    }
}

function logout() {
    if (confirm("Are you sure you want to logout?")) {
        // Close database connection
        if (typeof window.dbAPI?.closeDatabase === 'function') {
            window.dbAPI.closeDatabase();
        }
        
        // Clear auth data
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_user");
        localStorage.removeItem("current_user_id");
        
        // Clear global variables
        authToken = null;
        currentUser = null;
        currentUserId = null;
        
        // Show auth screen
        showAuthScreen();
    }
}

// Clear data from other users
function clearOtherUserData() {
    if (!currentUserId) return;
    
    // Keep only user-specific data
    const allKeys = Object.keys(localStorage);
    allKeys.forEach(key => {
        if (!key.includes(currentUserId) && 
            !key.startsWith('heads_') &&
            key !== 'auth_token' && 
            key !== 'auth_user' &&
            key !== 'current_user_id') {
            localStorage.removeItem(key);
        }
    });
}

// ==================== USER-SPECIFIC DATA MANAGEMENT ====================
function initUserData() {
    if (!currentUserId) {
        console.error("Cannot init user data: No user ID");
        return;
    }
    
    // Load user-specific heads/categories
    const userHeadsKey = `heads_${currentUserId}`;
    const storedHeads = localStorage.getItem(userHeadsKey);
    if (storedHeads) {
        heads = JSON.parse(storedHeads);
    } else {
        heads = {};
    }
    
    // Preload categories from existing entries
    preloadCategoriesFromEntries();
}

function saveUserHeads() {
    if (!currentUserId) {
        console.error("Cannot save heads: No user ID");
        return;
    }
    const userHeadsKey = `heads_${currentUserId}`;
    localStorage.setItem(userHeadsKey, JSON.stringify(heads));
}

// Preload categories from existing entries
function preloadCategoriesFromEntries() {
    if (!window.dbAPI || !currentUserId) {
        setTimeout(preloadCategoriesFromEntries, 100);
        return;
    }
    
    getAllEntries(userEntries => {
        // Extract categories from entries
        userEntries.forEach(entry => {
            if (entry.main && !heads[entry.main]) {
                heads[entry.main] = [];
            }
            if (entry.main && entry.sub && heads[entry.main]) {
                if (!heads[entry.main].includes(entry.sub)) {
                    heads[entry.main].push(entry.sub);
                }
            }
        });
        
        saveUserHeads();
        updateAllDropdowns();
    });
}

// ==================== ENTRY ID GENERATION ====================
function generateEntryId() {
    if (!currentUserId) {
        console.error("No user ID available for entry generation");
        return 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    return Base61.generateEntryId(currentUserId);
}

// ==================== INITIALIZATION ====================
function initApp() {
    console.log("🚀 Initializing app for user:", currentUser?.email, "ID:", currentUserId);
    
    updateAllDropdowns();
    calcTotal();
    loadSaved();
    updateSettingsUI();
    updateSyncStatus();
    testAPI();
    
    // Setup scroll for entry lists
    setupEntryScroll();
    
    // Update sync buttons
    updateSyncButtons();
}

// Test API connection
async function testAPI() {
    console.log("🔌 Testing API connection...");
    try {
        const response = await fetch("/api/health");
        const data = await response.json();
        console.log("📊 API Health status:", data);
        
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
        return data.success;
    } catch (error) {
        console.error("❌ API test failed:", error);
        const statusElement = document.getElementById("cloudSyncStatus");
        if (statusElement) {
            statusElement.innerHTML = `
                <div class="status-indicator status-disconnected">
                    ❌ Cloud Sync: Connection failed
                </div>
            `;
        }
        return false;
    }
}

// ==================== UPDATE SYNC BUTTONS ====================
function updateSyncButtons() {
    // Update home page sync buttons
    const quickActions = document.querySelector(".quick-actions");
    if (quickActions) {
        // Remove old sync button if exists
        const oldBtn = quickActions.querySelector("#syncBtn");
        if (oldBtn) oldBtn.remove();
        
        // Check if buttons already exist
        if (!quickActions.querySelector("#syncToCloudBtn")) {
            // Add Sync TO Cloud button
            const syncToBtn = document.createElement("button");
            syncToBtn.id = "syncToCloudBtn";
            syncToBtn.className = "primary-btn sync-to-btn";
            syncToBtn.innerHTML = "⬆️ Sync TO Cloud";
            syncToBtn.onclick = syncWithCloud;
            quickActions.appendChild(syncToBtn);
            
            // Add Sync FROM Cloud button
            const syncFromBtn = document.createElement("button");
            syncFromBtn.id = "syncFromCloudBtn";
            syncFromBtn.className = "primary-btn sync-from-btn";
            syncFromBtn.innerHTML = "⬇️ Sync FROM Cloud";
            syncFromBtn.onclick = syncFromCloud;
            quickActions.appendChild(syncFromBtn);
        }
    }
}

// ==================== DATABASE WRAPPER FUNCTIONS ====================
function getAllEntries(callback) {
    if (typeof window.dbAPI?.getAllEntries === 'function') {
        window.dbAPI.getAllEntries(callback);
    } else {
        console.error("getAllEntries not available in dbAPI");
        callback([]);
    }
}

function saveEntry(entry) {
    if (typeof window.dbAPI?.saveEntry === 'function') {
        return window.dbAPI.saveEntry(entry);
    } else {
        console.error("saveEntry not available in dbAPI");
        return Promise.reject(new Error("Database not available"));
    }
}

function getEntriesNeedingSync() {
    if (typeof window.dbAPI?.getEntriesNeedingSync === 'function') {
        return window.dbAPI.getEntriesNeedingSync();
    } else {
        console.error("getEntriesNeedingSync not available in dbAPI");
        return Promise.resolve([]);
    }
}

function markAsSynced(entryIds) {
    if (typeof window.dbAPI?.markAsSynced === 'function') {
        return window.dbAPI.markAsSynced(entryIds);
    } else {
        console.error("markAsSynced not available in dbAPI");
        return Promise.resolve({ updatedCount: 0, errors: [] });
    }
}

// Get entries for current user only
function getUserEntries(callback) {
    getAllEntries(callback);
}

// ==================== TEMPORARY ENTRIES RENDER ====================
function renderTemp() {
    try {
        const tempList = document.getElementById("tempList");
        if (!tempList) return;
        
        tempList.innerHTML = "";
        
        if (tempEntries.length === 0) {
            tempList.innerHTML = '<div class="no-entries">No temporary entries</div>';
            return;
        }
        
        // Create table container
        const tableContainer = document.createElement("div");
        tableContainer.className = "table-container";
        tableContainer.style.maxHeight = "400px";
        tableContainer.style.overflowY = "auto";
        tableContainer.style.overflowX = "auto";
        
        const table = document.createElement("table");
        table.className = "fixed-table";
        
        // Create table header
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
        
        // Create table body
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
        
    } catch (error) {
        console.error("❌ Error in renderTemp:", error);
        const tempList = document.getElementById("tempList");
        if (tempList) {
            tempList.innerHTML = '<div class="no-entries" style="color: #f44336;">Error displaying temporary entries</div>';
        }
    }
}

// ==================== SYNC FROM CLOUD ====================
async function syncFromCloud() {
    if (!authToken || !currentUserId) {
        alert("Please login first");
        return;
    }
    
    const syncBtn = document.getElementById("syncFromCloudBtn");
    const originalText = syncBtn ? syncBtn.textContent : "⬇️ Sync FROM Cloud";
    
    if (syncBtn) {
        syncBtn.textContent = "⬇️ Syncing...";
        syncBtn.disabled = true;
    }
    
    try {
        const response = await fetch("/api/expenses", {
            headers: {
                "Authorization": `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.expenses && data.expenses.length > 0) {
            console.log(`☁️ Found ${data.expenses.length} expenses in cloud`);
            
            let importedCount = 0;
            let updatedCount = 0;
            
            for (const expense of data.expenses) {
                try {
                    const entryData = {
                        id: expense.id,
                        date: expense.date,
                        desc: expense.description,
                        amount: parseFloat(expense.amount),
                        main: expense.main_category,
                        sub: expense.sub_category,
                        synced: true,
                        syncRemarks: "synced",
                        created_at: expense.created_at || new Date().toISOString(),
                        updated_at: expense.updated_at || new Date().toISOString()
                    };
                    
                    await saveEntry(entryData);
                    importedCount++;
                    
                    // Add to categories if new
                    if (entryData.main && !heads[entryData.main]) {
                        heads[entryData.main] = [];
                    }
                    if (entryData.main && entryData.sub && heads[entryData.main]) {
                        if (!heads[entryData.main].includes(entryData.sub)) {
                            heads[entryData.main].push(entryData.sub);
                        }
                    }
                } catch (saveError) {
                    console.error("❌ Error saving expense:", saveError);
                }
            }
            
            // Save updated categories
            saveUserHeads();
            updateAllDropdowns();
            
            console.log(`✅ Sync from cloud complete: ${importedCount} imported`);
            
            let message = `✅ Sync FROM Cloud Complete!\n`;
            if (importedCount > 0) message += `• ${importedCount} entries imported\n`;
            
            alert(message);
            
            // Refresh UI
            loadSaved();
            calcTotal();
            updateSyncStatus();
            
        } else {
            alert("✅ No data found in cloud or cloud is empty.");
        }
        
    } catch (error) {
        console.error("❌ Sync from cloud error:", error);
        alert(`❌ Sync FROM Cloud failed: ${error.message}`);
    } finally {
        if (syncBtn) {
            syncBtn.textContent = originalText;
            syncBtn.disabled = false;
        }
    }
}

// ==================== SYNC TO CLOUD ====================
async function syncWithCloud() {
    if (!authToken || !currentUserId) {
        alert("Please login first");
        return;
    }
    
    const syncBtn = document.getElementById("syncToCloudBtn");
    const originalText = syncBtn ? syncBtn.textContent : "⬆️ Sync TO Cloud";
    
    if (syncBtn) {
        syncBtn.textContent = "⬆️ Syncing...";
        syncBtn.disabled = true;
    }
    
    try {
        // Get unsynced entries for current user
        const userUnsyncedEntries = await getEntriesNeedingSync();
        
        console.log(`🔄 Found ${userUnsyncedEntries.length} unsynced entries for user ${currentUserId}`);
        
        if (userUnsyncedEntries.length === 0) {
            alert("✅ All entries are already synced!");
            if (syncBtn) {
                syncBtn.textContent = originalText;
                syncBtn.disabled = false;
            }
            updateSyncStatus();
            return;
        }
        
        // Separate deleted entries from others
        const deletedEntries = userUnsyncedEntries.filter(e => e.syncRemarks === "deleted");
        const otherEntries = userUnsyncedEntries.filter(e => e.syncRemarks !== "deleted");
        
        console.log(`📤 Syncing ${otherEntries.length} entries, deleting ${deletedEntries.length} entries`);
        
        // Transform entries to match API format
        const expensesToSync = otherEntries.map(entry => ({
            id: entry.id,
            date: entry.date,
            description: entry.desc,
            amount: parseFloat(entry.amount),
            main_category: entry.main,
            sub_category: entry.sub,
            syncRemarks: entry.syncRemarks
        }));
        
        // Send regular entries to backend API
        let syncErrors = [];
        
        if (otherEntries.length > 0) {
            const response = await fetch("/api/expenses", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${authToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ expenses: expensesToSync })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            
            const data = await response.json();
            console.log("📊 Sync response:", data);
            
            if (data.success) {
                // Handle partial successes
                if (data.errors && data.errors.length > 0) {
                    syncErrors = data.errors;
                    console.warn("⚠️ Some entries failed to sync:", data.errors);
                }
                
                // Mark successful entries as synced
                if (data.successes && data.successes.length > 0) {
                    await markAsSynced(data.successes);
                    console.log(`✅ Marked ${data.successes.length} entries as synced`);
                }
            } else {
                throw new Error(data.message || "Sync failed");
            }
        }
        
        // Handle deleted entries - PERMANENT DELETE
        let deletedErrors = [];
        let deletedSuccessCount = 0;
        
        if (deletedEntries.length > 0) {
            console.log(`🗑️ Deleting ${deletedEntries.length} entries from cloud...`);
            
            for (const deletedEntry of deletedEntries) {
                try {
                    const deleteResponse = await fetch(`/api/expenses?id=${deletedEntry.id}`, {
                        method: "DELETE",
                        headers: {
                            "Authorization": `Bearer ${authToken}`
                        }
                    });
                    
                    if (deleteResponse.ok) {
                        console.log(`✅ Successfully deleted entry ${deletedEntry.id} from cloud`);
                        deletedSuccessCount++;
                    } else {
                        console.error(`❌ Failed to delete entry ${deletedEntry.id} from cloud`);
                        deletedErrors.push({ id: deletedEntry.id, error: "Failed to delete from cloud" });
                    }
                } catch (deleteError) {
                    console.error(`❌ Error deleting entry ${deletedEntry.id}:`, deleteError);
                    deletedErrors.push({ id: deletedEntry.id, error: deleteError.message });
                }
            }
        }
        
        // Show appropriate message based on results
        const totalErrors = syncErrors.length + deletedErrors.length;
        
        if (totalErrors === 0) {
            alert(`✅ Sync TO Cloud Complete!\n• ${otherEntries.length} entries synced\n• ${deletedSuccessCount} entries deleted`);
        } else {
            let errorMessage = `⚠️ Sync TO Cloud Partial Success\n`;
            if (otherEntries.length > 0) errorMessage += `• ${otherEntries.length - syncErrors.length}/${otherEntries.length} entries synced\n`;
            if (deletedEntries.length > 0) errorMessage += `• ${deletedSuccessCount}/${deletedEntries.length} entries deleted\n`;
            errorMessage += `\n❌ ${totalErrors} errors occurred.`;
            
            alert(errorMessage);
        }
        
        // Refresh UI
        calcTotal();
        loadSaved();
        updateSyncStatus();
        
    } catch (error) {
        console.error("❌ Sync error:", error);
        alert(`❌ Sync TO Cloud failed: ${error.message}\n\nEntries will retry on next sync.`);
    } finally {
        if (syncBtn) {
            syncBtn.textContent = originalText;
            syncBtn.disabled = false;
        }
    }
}

// ==================== LOAD DATA FROM CLOUD ON LOGIN ====================
async function loadDataFromCloudOnLogin() {
    console.log("☁️ Loading data from cloud on login...");
    
    try {
        const response = await fetch("/api/expenses", {
            headers: {
                "Authorization": `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            console.log("ℹ️ No data in cloud or error loading");
            return [];
        }
        
        const data = await response.json();
        
        if (data.success && data.expenses && data.expenses.length > 0) {
            console.log(`📥 Found ${data.expenses.length} expenses in cloud`);
            
            let importedCount = 0;
            
            for (const expense of data.expenses) {
                try {
                    const entryData = {
                        id: expense.id,
                        date: expense.date,
                        desc: expense.description,
                        amount: parseFloat(expense.amount),
                        main: expense.main_category,
                        sub: expense.sub_category,
                        synced: true,
                        syncRemarks: "synced",
                        created_at: expense.created_at || new Date().toISOString(),
                        updated_at: expense.updated_at || new Date().toISOString()
                    };
                    
                    await saveEntry(entryData);
                    importedCount++;
                    
                    // Add to categories
                    if (entryData.main && !heads[entryData.main]) {
                        heads[entryData.main] = [];
                    }
                    if (entryData.main && entryData.sub && heads[entryData.main]) {
                        if (!heads[entryData.main].includes(entryData.sub)) {
                            heads[entryData.main].push(entryData.sub);
                        }
                    }
                } catch (saveError) {
                    console.error("❌ Error saving expense:", saveError);
                }
            }
            
            // Save categories
            saveUserHeads();
            
            console.log(`✅ Login sync: ${importedCount} entries loaded`);
            
            if (importedCount > 0) {
                setTimeout(() => {
                    alert(`✅ Loaded ${importedCount} entries from cloud`);
                }, 500);
            }
            
            return data.expenses;
        } else {
            console.log("ℹ️ No expenses found in cloud response");
            return [];
        }
    } catch (error) {
        console.error("❌ Error loading from cloud:", error);
        return [];
    }
}

// ==================== FIX SCROLL ISSUES ====================
function setupEntryScroll() {
    const tempList = document.getElementById("tempList");
    const savedList = document.getElementById("savedEntryList");
    
    if (tempList) {
        tempList.style.maxHeight = "400px";
        tempList.style.overflowY = "auto";
        tempList.style.overflowX = "auto";
    }
    
    if (savedList) {
        savedList.style.maxHeight = "400px";
        savedList.style.overflowY = "auto";
        savedList.style.overflowX = "auto";
    }
}

// ==================== CSV EXPORT/IMPORT ====================
function exportToCSV() {
    getUserEntries(entries => {
        const activeEntries = entries.filter(e => e.syncRemarks !== "deleted");
        
        if (activeEntries.length === 0) {
            alert("No entries to export");
            return;
        }
        
        let csv = "ID,Date,Description,Main Category,Sub Category,Amount,Type,Sync Status\n";
        activeEntries.forEach(e => {
            const type = e.amount >= 0 ? "Income" : "Expense";
            const syncStatus = e.synced ? (e.syncRemarks === "edited" ? "Edited" : "Synced") : "Pending";
            csv += `"${e.id}","${e.date}","${e.desc}","${e.main}","${e.sub}",${e.amount},"${type}","${syncStatus}"\n`;
        });
        
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        
        // Generate filename with timestamp
        const now = new Date();
        const timestamp = 
            now.getFullYear().toString().slice(-2) +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0') +
            String(now.getHours()).padStart(2, '0') +
            String(now.getMinutes()).padStart(2, '0') +
            String(now.getSeconds()).padStart(2, '0');
        
        a.href = url;
        a.download = `accounts_diary_${timestamp}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        alert(`✅ Exported ${activeEntries.length} entries to CSV`);
    });
}

async function importFromCSV(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        const csvData = e.target.result;
        const lines = csvData.split('\n');
        let rowsToImport = [];
        
        // Parse CSV and prepare rows
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // Simple CSV parsing (for quoted values)
            const parts = [];
            let currentPart = '';
            let inQuotes = false;
            
            for (let char of line) {
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    parts.push(currentPart);
                    currentPart = '';
                } else {
                    currentPart += char;
                }
            }
            parts.push(currentPart);
            
            if (parts.length >= 5) {
                try {
                    const entry = {
                        date: parts[0],
                        desc: parts[1],
                        main: parts[2],
                        sub: parts[3],
                        amount: parseFloat(parts[4]),
                        synced: false,
                        syncRemarks: "new"
                    };
                    
                    if (!isNaN(entry.amount)) {
                        rowsToImport.push(entry);
                    }
                } catch (error) {
                    console.error("❌ Error parsing CSV row:", error);
                }
            }
        }
        
        if (rowsToImport.length === 0) {
            alert("No valid rows found in CSV file");
            return;
        }
        
        // Assign IDs and save entries
        let imported = 0;
        let errors = 0;
        
        for (let i = 0; i < rowsToImport.length; i++) {
            try {
                const entry = rowsToImport[i];
                entry.id = generateEntryId();
                await saveEntry(entry);
                imported++;
                
                // Add to categories if new
                if (entry.main && !heads[entry.main]) {
                    heads[entry.main] = [];
                }
                if (entry.main && entry.sub && heads[entry.main]) {
                    if (!heads[entry.main].includes(entry.sub)) {
                        heads[entry.main].push(entry.sub);
                    }
                }
            } catch (error) {
                console.error("❌ Error saving CSV row:", error);
                errors++;
            }
        }
        
        // Save updated categories
        saveUserHeads();
        
        // Clear file input
        event.target.value = '';
        
        // Update UI
        setTimeout(() => {
            updateAllDropdowns();
            loadSaved();
            calcTotal();
            alert(`✅ Imported ${imported} entries, ${errors} errors`);
        }, 500);
    };
    
    reader.readAsText(file);
}

// ==================== PAGE NAVIGATION ====================
function showPage(id) {
    try {
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
            
            // Setup scroll for entry pages
            if (id === "entry") {
                setTimeout(setupEntryScroll, 100);
            }
            
            // Initialize page-specific functions
            switch(id) {
                case "home":
                    loadHomeData();
                    updateSyncButtons();
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
                    updateSettingsUI();
                    testAPI();
                    break;
            }
        }
    } catch (error) {
        console.error("❌ Error in showPage:", error);
    }
}

// ==================== UPDATE SETTINGS UI ====================
function updateSettingsUI() {
    renderHeads();
    
    if (currentUser) {
        const userInfo = document.getElementById("userInfo");
        if (userInfo) {
            userInfo.innerHTML = `
                <div class="status-indicator status-connected">
                    <strong>Logged in as:</strong> ${currentUser.email}
                </div>
            `;
        }
        
        const settingsUserEmail = document.getElementById("settingsUserEmail");
        if (settingsUserEmail) {
            settingsUserEmail.textContent = currentUser.email;
        }
    }
}

// ==================== INITIALIZATION ON LOAD ====================
window.onload = async function() {
    try {
        const today = new Date().toISOString().split("T")[0];
        const dateInput = document.getElementById("date");
        if (dateInput) dateInput.value = today;
        
        // Add cancel edit button if not exists
        const entryForm = document.querySelector("#entry .entry-form .button-group");
        if (entryForm && !document.getElementById("cancelEditBtn")) {
            const cancelBtn = document.createElement("button");
            cancelBtn.id = "cancelEditBtn";
            cancelBtn.className = "secondary-btn";
            cancelBtn.textContent = "❌ Cancel Edit";
            cancelBtn.style.display = "none";
            cancelBtn.onclick = cancelEdit;
            entryForm.appendChild(cancelBtn);
        }
        
        updateAllDropdowns();
        await checkAuth();
        
    } catch (error) {
        console.error("❌ Error in window.onload:", error);
    }
};

// ==================== ADD EVENT LISTENERS ====================
document.addEventListener("DOMContentLoaded", function() {
    // Add keypress listener for search
    document.addEventListener("keypress", function(e) {
        if (e.key === "Enter") {
            const activePage = document.querySelector(".page.active");
            if (activePage && activePage.id === "search") {
                performSearch();
            }
            
            if (activePage && activePage.id === "authScreen") {
                const focused = document.activeElement;
                if (focused && focused.id === "authPassword") {
                    login();
                }
            }
        }
    });
});

// ==================== SERVICE WORKER ====================
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./service-worker.js")
            .then(registration => {
                console.log("✅ Service Worker registered");
            })
            .catch(error => {
                console.log("❌ Service Worker registration failed:", error);
            });
    });
}

// ==================== CATEGORY MANAGEMENT ====================
function saveHeads() {
    saveUserHeads();
    renderHeads();
    updateAllDropdowns();
}

function renderHeads() {
    try {
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
    } catch (error) {
        console.error("❌ Error in renderHeads:", error);
    }
}

function updateAllDropdowns() {
    updateEntryDropdowns();
    updateLedgerCategories();
    updateSearchCategories();
}

// ==================== ENTRY PAGE ====================
function updateEntryDropdowns() {
    try {
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
    } catch (error) {
        console.error("❌ Error in updateEntryDropdowns:", error);
    }
}

function updateEntrySubheads() {
    try {
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
    } catch (error) {
        console.error("❌ Error in updateEntrySubheads:", error);
    }
}

// ==================== DATE FUNCTIONS ====================
function formatDate(v) {
    try {
        const d = new Date(v);
        return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth()+1).padStart(2, "0")}-${d.getFullYear()}`;
    } catch (error) {
        const today = new Date();
        return `${String(today.getDate()).padStart(2, "0")}-${String(today.getMonth()+1).padStart(2, "0")}-${today.getFullYear()}`;
    }
}

// ==================== TEMPORARY ENTRIES ====================
function addTemp() {
    try {
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
    } catch (error) {
        console.error("❌ Error in addTemp:", error);
        alert("Error adding temporary entry: " + error.message);
    }
}

function editTemp(i) {
    try {
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
    } catch (error) {
        console.error("❌ Error in editTemp:", error);
        alert("Error editing temporary entry: " + error.message);
    }
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

// ==================== SAVE ALL ENTRIES ====================
async function saveAll() {
    try {
        if (tempEntries.length === 0 && !isEditing) {
            alert("No entries to save");
            return;
        }
        
        if (isEditing && editingEntryId) {
            getUserEntries(async d => {
                try {
                    const existingEntry = d.find(x => x.id === editingEntryId);
                    if (!existingEntry) return;
                    
                    const editedEntry = {
                        id: editingEntryId,
                        date: formatDate(document.getElementById("date").value),
                        desc: document.getElementById("desc").value.trim(),
                        amount: parseFloat(document.getElementById("amount").value),
                        main: document.getElementById("entryMain").value,
                        sub: document.getElementById("entrySub").value,
                        synced: existingEntry.synced,
                        syncRemarks: existingEntry.synced ? "edited" : "new",
                        created_at: existingEntry.created_at || new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    };
                    
                    await saveEntry(editedEntry);
                    
                    cancelEdit();
                    loadSaved();
                    calcTotal();
                    loadLedger();
                    
                    alert("✅ Entry updated successfully!");
                } catch (error) {
                    console.error("❌ Error saving edited entry:", error);
                    alert("Error updating entry: " + error.message);
                }
            });
            return;
        }
        
        if (tempEntries.length > 0) {
            if (!confirm(`Save ${tempEntries.length} entries to database?`)) {
                return;
            }
            
            const savePromises = [];
            tempEntries.forEach((e, i) => {
                e.id = generateEntryId();
                e.synced = false;
                e.syncRemarks = "new";
                savePromises.push(saveEntry(e));
            });
            
            Promise.all(savePromises).then(() => {
                tempEntries = [];
                renderTemp();
                
                // Add to categories
                tempEntries.forEach(entry => {
                    if (entry.main && !heads[entry.main]) {
                        heads[entry.main] = [];
                    }
                    if (entry.main && entry.sub && heads[entry.main]) {
                        if (!heads[entry.main].includes(entry.sub)) {
                            heads[entry.main].push(entry.sub);
                        }
                    }
                });
                
                saveUserHeads();
                updateAllDropdowns();
                
                loadSaved();
                calcTotal();
                
                alert(`✅ Successfully saved ${savePromises.length} entries!`);
            }).catch(error => {
                console.error("❌ Error saving entries:", error);
                alert("Error saving entries: " + error.message);
            });
        }
    } catch (error) {
        console.error("❌ Error in saveAll:", error);
        alert("Error saving entries: " + error.message);
    }
}

// ==================== SAVED ENTRIES MANAGEMENT ====================
function loadSaved() {
    getUserEntries(d => {
        try {
            const savedEntryList = document.getElementById("savedEntryList");
            if (!savedEntryList) return;
            
            savedEntryList.innerHTML = "";
            
            const activeEntries = d.filter(e => e.syncRemarks !== "deleted");
            
            activeEntries.sort((a, b) => {
                const dateA = new Date(a.date.split("-").reverse().join("-"));
                const dateB = new Date(b.date.split("-").reverse().join("-"));
                return dateB - dateA;
            });
            
            const recentEntries = activeEntries.slice(0, 20);
            
            if (recentEntries.length === 0) {
                savedEntryList.innerHTML = '<div class="no-entries">No saved entries</div>';
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
                    <th>Sync Status</th>
                    <th>Actions</th>
                </tr>
            `;
            
            table.appendChild(thead);
            
            const tbody = document.createElement("tbody");
            
            recentEntries.forEach((e, i) => {
                const row = document.createElement("tr");
                row.className = e.amount < 0 ? "expense-row" : "income-row";
                
                const syncStatus = e.synced ? 
                    (e.syncRemarks === "edited" ? "✏️ Edited" : "✅ Synced") : 
                    "🔄 Pending";
                
                row.innerHTML = `
                    <td>${e.date}</td>
                    <td>${e.main}</td>
                    <td>${e.sub}</td>
                    <td>${e.desc}</td>
                    <td class="${e.amount < 0 ? 'amount-negative' : 'amount-positive'}">
                        ${e.amount < 0 ? "-" : "+"}PKR ${Math.abs(e.amount).toFixed(2)}
                    </td>
                    <td style="text-align: center;">
                        ${syncStatus}
                    </td>
                    <td style="text-align: center;">
                        <button onclick="editSavedEntryFromOtherPage('${e.id}')" class="small-btn edit-btn">✏️</button>
                        <button onclick="deleteSavedEntry('${e.id}')" class="small-btn danger-btn">🗑️</button>
                    </td>
                `;
                
                tbody.appendChild(row);
            });
            
            table.appendChild(tbody);
            tableContainer.appendChild(table);
            savedEntryList.appendChild(tableContainer);
        } catch (error) {
            console.error("❌ Error in loadSaved:", error);
            const savedEntryList = document.getElementById("savedEntryList");
            if (savedEntryList) {
                savedEntryList.innerHTML = '<div class="no-entries" style="color: #f44336;">Error loading saved entries</div>';
            }
        }
    });
}

async function deleteSavedEntry(id) {
    if (!confirm("Delete this entry? This will mark it for deletion and sync with cloud.")) {
        return;
    }
    
    try {
        getUserEntries(async d => {
            const entry = d.find(x => x.id === id);
            if (!entry) return;
            
            // Mark as deleted
            entry.syncRemarks = "deleted";
            await saveEntry(entry);
            
            loadSaved();
            calcTotal();
            loadLedger();
            
            alert("✅ Entry marked for deletion. It will be permanently removed on next cloud sync.");
        });
    } catch (error) {
        console.error("❌ Error deleting entry:", error);
        alert("Error deleting entry: " + error.message);
    }
}

function editSavedEntry(id) {
    try {
        isEditing = true;
        editingEntryId = id;
        
        getUserEntries(d => {
            try {
                const e = d.find(x => x.id === id);
                if (!e) return;
                
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
                
                const cancelBtn = document.getElementById("cancelEditBtn");
                if (cancelBtn) cancelBtn.style.display = "inline-block";
                
                const saveBtn = document.querySelector('button[onclick="saveAll()"]');
                if (saveBtn) saveBtn.textContent = "💾 Update Entry";
                
                const msg = document.createElement("div");
                msg.className = "edit-message";
                msg.innerHTML = '<p style="color: #ff9800; margin: 10px 0;">✏️ Editing mode active. Make changes or click Cancel to keep original.</p>';
                
                const form = document.querySelector(".entry-form");
                if (form && !form.querySelector(".edit-message")) {
                    form.appendChild(msg);
                }
            } catch (error) {
                console.error("❌ Error in editSavedEntry:", error);
                alert("Error loading entry for editing: " + error.message);
            }
        });
    } catch (error) {
        console.error("❌ Error in editSavedEntry:", error);
        alert("Error entering edit mode: " + error.message);
    }
}

// For ledger and search pages
function editSavedEntryFromOtherPage(id) {
    showPage('entry');
    
    // Small delay to ensure page is loaded
    setTimeout(() => {
        editSavedEntry(id);
    }, 100);
}

function cancelEdit() {
    if (isEditing) {
        isEditing = false;
        editingEntryId = null;
        
        const cancelBtn = document.getElementById("cancelEditBtn");
        if (cancelBtn) cancelBtn.style.display = "none";
        
        const saveBtn = document.querySelector('button[onclick="saveAll()"]');
        if (saveBtn) saveBtn.textContent = "💾 Save All";
        
        const msg = document.querySelector(".edit-message");
        if (msg) msg.remove();
        
        resetEntryForm();
    }
}

function resetEntryForm() {
    try {
        const today = new Date().toISOString().split("T")[0];
        document.getElementById("date").value = today;
        document.getElementById("desc").value = "";
        document.getElementById("amount").value = "";
        document.getElementById("entryMain").value = "";
        document.getElementById("entrySub").value = "";
        
        isEditing = false;
        editingEntryId = null;
        
        const cancelBtn = document.getElementById("cancelEditBtn");
        if (cancelBtn) cancelBtn.style.display = "none";
        
        const saveBtn = document.querySelector('button[onclick="saveAll()"]');
        if (saveBtn) saveBtn.textContent = "💾 Save All";
        
        const msg = document.querySelector(".edit-message");
        if (msg) msg.remove();
    } catch (error) {
        console.error("❌ Error in resetEntryForm:", error);
    }
}

// ==================== BALANCE CALCULATION ====================
function calcTotal() {
    getUserEntries(d => {
        try {
            const activeEntries = d.filter(e => e.syncRemarks !== "deleted");
            
            const total = activeEntries.reduce((a, b) => a + b.amount, 0);
            const income = activeEntries.filter(e => e.amount > 0).reduce((a, b) => a + b.amount, 0);
            const expense = Math.abs(activeEntries.filter(e => e.amount < 0).reduce((a, b) => a + b.amount, 0));
            
            const totalBalance = document.getElementById("totalBalance");
            if (totalBalance) {
                totalBalance.innerText = `PKR ${total.toFixed(2)}`;
                totalBalance.style.color = total >= 0 ? "#2e7d32" : "#c62828";
            }
            
            const totalIncome = document.getElementById("totalIncome");
            const totalExpense = document.getElementById("totalExpense");
            const netBalance = document.getElementById("netBalance");
            
            if (totalIncome) totalIncome.innerText = `PKR ${income.toFixed(2)}`;
            if (totalExpense) totalExpense.innerText = `PKR ${expense.toFixed(2)}`;
            if (netBalance) {
                netBalance.innerText = `PKR ${total.toFixed(2)}`;
                netBalance.style.color = total >= 0 ? "#2e7d32" : "#c62828";
            }
            
            const entryCount = document.getElementById("entryCount");
            if (entryCount) entryCount.innerText = `📝 Total Entries: ${activeEntries.length}`;
            
            renderBalance(activeEntries);
            updateSyncStatus(d);
            loadRecentEntries(activeEntries);
        } catch (error) {
            console.error("❌ Error in calcTotal:", error);
        }
    });
}

function renderBalance(d) {
    try {
        const balanceList = document.getElementById("balanceList");
        if (!balanceList) return;
        
        let map = {};
        
        d.forEach(e => {
            map[e.main] = map[e.main] || {};
            map[e.main][e.sub] = (map[e.main][e.sub] || 0) + e.amount;
        });
        
        balanceList.innerHTML = "";
        
        for(let main in map) {
            const li = document.createElement("li");
            li.className = "category-balance";
            
            const mainTotal = Object.values(map[main]).reduce((a, b) => a + b, 0);
            
            li.innerHTML = `
                <div class="main-category-balance">
                    <span class="main-cat-name">${main}</span>
                    <span class="main-cat-total ${mainTotal >= 0 ? "positive" : "negative"}">
                        PKR ${Math.abs(mainTotal).toFixed(2)}
                    </span>
                </div>
                <ul class="subcategory-balance">
                    ${Object.entries(map[main]).map(([sub, amount]) => `
                        <li>
                            <span class="sub-cat-name">${sub}</span>
                            <span class="sub-cat-amount ${amount >= 0 ? "positive" : "negative"}">
                                ${amount >= 0 ? "+" : "-"}PKR ${Math.abs(amount).toFixed(2)}
                            </span>
                        </li>
                    `).join("")}
                </ul>
            `;
            
            balanceList.appendChild(li);
        }
    } catch (error) {
        console.error("❌ Error in renderBalance:", error);
        const balanceList = document.getElementById("balanceList");
        if (balanceList) {
            balanceList.innerHTML = '<div class="no-entries" style="color: #f44336;">Error calculating balance</div>';
        }
    }
}

function loadRecentEntries(entries) {
    try {
        const recentEntries = document.getElementById("recentEntries");
        if (!recentEntries) return;
        
        entries.sort((a, b) => {
            const dateA = new Date(a.date.split("-").reverse().join("-"));
            const dateB = new Date(b.date.split("-").reverse().join("-"));
            return dateB - dateA;
        });
        
        const recent = entries.slice(0, 10);
        
        recentEntries.innerHTML = "";
        
        if (recent.length === 0) {
            recentEntries.innerHTML = '<div class="no-entries">No recent transactions</div>';
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
                <th>Sync</th>
            </tr>
        `;
        
        table.appendChild(thead);
        
        const tbody = document.createElement("tbody");
        
        recent.forEach((e, i) => {
            const row = document.createElement("tr");
            row.className = e.amount < 0 ? "expense-row" : "income-row";
            
            const syncIcon = e.synced ? "✅" : "🔄";
            
            row.innerHTML = `
                <td>${e.date}</td>
                <td>${e.main}</td>
                <td>${e.sub}</td>
                <td>${e.desc}</td>
                <td class="${e.amount < 0 ? 'amount-negative' : 'amount-positive'}">
                    ${e.amount < 0 ? "-" : "+"}PKR ${Math.abs(e.amount).toFixed(2)}
                </td>
                <td style="text-align: center;">
                    ${syncIcon}
                </td>
            `;
            
            tbody.appendChild(row);
        });
        
        table.appendChild(tbody);
        tableContainer.appendChild(table);
        recentEntries.appendChild(tableContainer);
    } catch (error) {
        console.error("❌ Error in loadRecentEntries:", error);
        const recentEntries = document.getElementById("recentEntries");
        if (recentEntries) {
            recentEntries.innerHTML = '<div class="no-entries" style="color: #f44336;">Error loading recent entries</div>';
        }
    }
}

function loadHomeData() {
    calcTotal();
}

// ==================== SYNC STATUS ====================
function updateSyncStatus(entries = null) {
    try {
        if (!entries) {
            getUserEntries(updateSyncStatus);
            return;
        }
        
        const pendingSync = entries.filter(e => 
            !e.synced || (e.syncRemarks && e.syncRemarks !== "synced")
        ).length;
        
        const statusElement = document.getElementById("syncStatus");
        if (statusElement) {
            statusElement.innerHTML = pendingSync > 0 ? 
                `🔄 ${pendingSync} entries pending sync` : 
                "✅ All entries synced";
            statusElement.style.color = pendingSync > 0 ? "#ff9800" : "#4caf50";
        }
        
        // Update home page sync status
        const homeSyncStatus = document.getElementById("homeSyncStatus");
        if (homeSyncStatus) {
            homeSyncStatus.textContent = pendingSync > 0 ? 
                `${pendingSync} entries need sync` : 
                "All entries synced";
        }
    } catch (error) {
        console.error("❌ Error in updateSyncStatus:", error);
    }
}

// ==================== LEDGER FUNCTIONS ====================
function updateLedgerCategories() {
    try {
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
    } catch (error) {
        console.error("❌ Error in updateLedgerCategories:", error);
    }
}

function updateLedgerSubheads() {
    try {
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
    } catch (error) {
        console.error("❌ Error in updateLedgerSubheads:", error);
    }
}

function loadLedger() {
    getUserEntries(d => {
        try {
            const activeEntries = d.filter(e => e.syncRemarks !== "deleted");
            
            const mainFilter = document.getElementById("ledgerMain")?.value || "";
            const subFilter = document.getElementById("ledgerSub")?.value || "";
            const fromDate = document.getElementById("fromDate")?.value;
            const toDate = document.getElementById("toDate")?.value;
            const typeFilter = document.getElementById("typeFilter")?.value || "all";
            const minAmount = parseFloat(document.getElementById("minAmountFilter")?.value) || -Infinity;
            const maxAmount = parseFloat(document.getElementById("maxAmountFilter")?.value) || Infinity;
            
            const filtered = activeEntries.filter(e => {
                if (mainFilter && e.main !== mainFilter) return false;
                if (subFilter && e.sub !== subFilter) return false;
                if (typeFilter === "income" && e.amount < 0) return false;
                if (typeFilter === "expense" && e.amount > 0) return false;
                if (e.amount < minAmount || e.amount > maxAmount) return false;
                
                if (fromDate || toDate) {
                    const entryDate = new Date(e.date.split("-").reverse().join("-"));
                    const from = fromDate ? new Date(fromDate) : null;
                    const to = toDate ? new Date(toDate + "T23:59:59") : null;
                    
                    if (from && entryDate < from) return false;
                    if (to && entryDate > to) return false;
                }
                
                return true;
            });
            
            filtered.sort((a, b) => {
                const dateA = new Date(a.date.split("-").reverse().join("-"));
                const dateB = new Date(b.date.split("-").reverse().join("-"));
                return dateB - dateA;
            });
            
            const total = filtered.reduce((sum, entry) => sum + entry.amount, 0);
            const incomeTotal = filtered.filter(e => e.amount > 0)
                                    .reduce((sum, e) => sum + e.amount, 0);
            const expenseTotal = filtered.filter(e => e.amount < 0)
                                    .reduce((sum, e) => sum + Math.abs(e.amount), 0);
            
            const statsElement = document.getElementById("ledgerStats");
            if (statsElement) {
                statsElement.innerHTML = `
                    Showing ${filtered.length} transactions | 
                    Total: <span style="color:${total >= 0 ? "#2e7d32" : "#c62828"}">PKR ${total.toFixed(2)}</span> |
                    Income: <span style="color:#2e7d32">PKR ${incomeTotal.toFixed(2)}</span> |
                    Expense: <span style="color:#c62828">PKR ${expenseTotal.toFixed(2)}</span>
                `;
            }
            
            const tbody = document.getElementById("ledgerList");
            if (!tbody) return;
            
            tbody.innerHTML = "";
            
            if (filtered.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align: center; padding: 15px;">
                            📭 No transactions found matching your filters.
                        </td>
                    </tr>
                `;
                return;
            }
            
            filtered.forEach((e, i) => {
                const row = document.createElement("tr");
                row.className = e.amount < 0 ? "expense-row" : "income-row";
                
                row.innerHTML = `
                    <td>${e.date}</td>
                    <td>${e.desc}</td>
                    <td>${e.main}</td>
                    <td>${e.sub}</td>
                    <td class="${e.amount >= 0 ? 'amount-positive' : 'amount-negative'}">
                        ${e.amount >= 0 ? "+" : ""}PKR ${Math.abs(e.amount).toFixed(2)}
                    </td>
                    <td style="text-align: center;">
                        <button onclick="editSavedEntryFromOtherPage('${e.id}')" class="small-btn edit-btn">✏️</button>
                        <button onclick="deleteSavedEntry('${e.id}')" class="small-btn danger-btn">🗑️</button>
                    </td>
                `;
                
                tbody.appendChild(row);
            });
        } catch (error) {
            console.error("❌ Error in loadLedger:", error);
            const tbody = document.getElementById("ledgerList");
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align: center; padding: 15px; color: #f44336;">
                            ❌ Error loading ledger data
                        </td>
                    </tr>
                `;
            }
        }
    });
}

function resetLedgerFilters() {
    try {
        document.getElementById("ledgerMain").value = "";
        document.getElementById("ledgerSub").value = "";
        document.getElementById("fromDate").value = "";
        document.getElementById("toDate").value = "";
        document.getElementById("typeFilter").value = "all";
        document.getElementById("minAmountFilter").value = "";
        document.getElementById("maxAmountFilter").value = "";
        
        updateLedgerSubheads();
        loadLedger();
    } catch (error) {
        console.error("❌ Error in resetLedgerFilters:", error);
    }
}

function exportLedger() {
    getUserEntries(d => {
        try {
            const mainFilter = document.getElementById("ledgerMain").value;
            const subFilter = document.getElementById("ledgerSub").value;
            
            const filtered = d.filter(e => {
                if (mainFilter && e.main !== mainFilter) return false;
                if (subFilter && e.sub !== subFilter) return false;
                return e.syncRemarks !== "deleted";
            });
            
            let csv = "ID,Date,Description,Main Category,Sub Category,Amount,Type,Sync Status\n";
            filtered.forEach(e => {
                const type = e.amount >= 0 ? "Income" : "Expense";
                const syncStatus = e.synced ? (e.syncRemarks === "edited" ? "Edited" : "Synced") : "Pending";
                csv += `"${e.id}","${e.date}","${e.desc}","${e.main}","${e.sub}",${e.amount},"${type}","${syncStatus}"\n`;
            });
            
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
            const date = new Date().toISOString().split("T")[0];
            a.download = `ledger_export_${date}.csv`;
            a.click();
        } catch (error) {
            console.error("❌ Error in exportLedger:", error);
            alert("Error exporting ledger: " + error.message);
        }
    });
}

// ==================== SEARCH FUNCTIONS ====================
function updateSearchCategories() {
    try {
        const searchCategory = document.getElementById("searchCategory");
        if (!searchCategory) return;
        
        searchCategory.innerHTML = '<option value="">All Categories</option>';
        
        for (let mainCategory in heads) {
            const option = document.createElement("option");
            option.value = mainCategory;
            option.textContent = mainCategory;
            searchCategory.appendChild(option);
        }
    } catch (error) {
        console.error("❌ Error in updateSearchCategories:", error);
    }
}

function performSearch() {
    try {
        const searchTerm = document.getElementById("searchInput").value.toLowerCase().trim();
        const fromDate = document.getElementById("searchFromDate").value;
        const toDate = document.getElementById("searchToDate").value;
        const minAmount = parseFloat(document.getElementById("minAmount").value) || -Infinity;
        const maxAmount = parseFloat(document.getElementById("maxAmount").value) || Infinity;
        const typeFilter = document.getElementById("searchType").value;
        const categoryFilter = document.getElementById("searchCategory").value;
        
        getUserEntries(entries => {
            try {
                const activeEntries = entries.filter(e => e.syncRemarks !== "deleted");
                
                const filtered = activeEntries.filter(entry => {
                    if (searchTerm && !entry.desc.toLowerCase().includes(searchTerm)) {
                        return false;
                    }
                    
                    if (categoryFilter && entry.main !== categoryFilter) {
                        return false;
                    }
                    
                    if (fromDate || toDate) {
                        const entryDate = new Date(entry.date.split("-").reverse().join("-"));
                        const from = fromDate ? new Date(fromDate) : null;
                        const to = toDate ? new Date(toDate + "T23:59:59") : null;
                        
                        if (from && entryDate < from) return false;
                        if (to && entryDate > to) return false;
                    }
                    
                    if (entry.amount < minAmount || entry.amount > maxAmount) {
                        return false;
                    }
                    
                    if (typeFilter === "income" && entry.amount <= 0) return false;
                    if (typeFilter === "expense" && entry.amount >= 0) return false;
                    
                    return true;
                });
                
                displaySearchResults(filtered, searchTerm);
            } catch (error) {
                console.error("❌ Error filtering search results:", error);
                alert("Error performing search: " + error.message);
            }
        });
    } catch (error) {
        console.error("❌ Error in performSearch:", error);
        alert("Error performing search: " + error.message);
    }
}

function displaySearchResults(results, searchTerm = "") {
    try {
        const resultsList = document.getElementById("searchResults");
        const countElement = document.getElementById("searchResultsCount");
        const totalElement = document.getElementById("searchTotal");
        
        if (!resultsList) return;
        
        results.sort((a, b) => {
            const dateA = new Date(a.date.split("-").reverse().join("-"));
            const dateB = new Date(b.date.split("-").reverse().join("-"));
            return dateB - dateA;
        });
        
        const totalAmount = results.reduce((sum, entry) => sum + entry.amount, 0);
        if (countElement) {
            countElement.textContent = `🔍 Found ${results.length} transaction${results.length !== 1 ? "s" : ""}`;
        }
        
        if (totalElement) {
            totalElement.textContent = `💰 Total: PKR ${totalAmount.toFixed(2)}`;
            totalElement.style.color = totalAmount >= 0 ? "#2e7d32" : "#c62828";
        }
        
        resultsList.innerHTML = "";
        
        if (results.length === 0) {
            resultsList.innerHTML = '<div class="no-results">📭 No transactions found</div>';
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
        
        results.forEach((entry, i) => {
            const row = document.createElement("tr");
            row.className = entry.amount < 0 ? "expense-row" : "income-row";
            
            let description = entry.desc;
            if (searchTerm) {
                const regex = new RegExp(`(${searchTerm})`, "gi");
                description = description.replace(regex, "<mark>$1</mark>");
            }
            
            row.innerHTML = `
                <td>${entry.date}</td>
                <td>${entry.main}</td>
                <td>${entry.sub}</td>
                <td>${description}</td>
                <td class="${entry.amount >= 0 ? 'amount-positive' : 'amount-negative'}">
                    ${entry.amount >= 0 ? "+" : ""}PKR ${Math.abs(entry.amount).toFixed(2)}
                </td>
                <td style="text-align: center;">
                    <button onclick="editSavedEntryFromOtherPage('${entry.id}')" class="small-btn edit-btn">✏️</button>
                    <button onclick="deleteSavedEntry('${entry.id}')" class="small-btn danger-btn">🗑️</button>
                </td>
            `;
            
            tbody.appendChild(row);
        });
        
        table.appendChild(tbody);
        tableContainer.appendChild(table);
        resultsList.appendChild(tableContainer);
    } catch (error) {
        console.error("❌ Error in displaySearchResults:", error);
        const resultsList = document.getElementById("searchResults");
        if (resultsList) {
            resultsList.innerHTML = '<div class="no-results" style="color: #f44336;">Error displaying search results</div>';
        }
    }
}

function clearSearch() {
    try {
        document.getElementById("searchInput").value = "";
        document.getElementById("searchFromDate").value = "";
        document.getElementById("searchToDate").value = "";
        document.getElementById("minAmount").value = "";
        document.getElementById("maxAmount").value = "";
        document.getElementById("searchType").value = "all";
        document.getElementById("searchCategory").value = "";
        
        document.getElementById("searchResults").innerHTML = "";
        document.getElementById("searchResultsCount").textContent = "🔍 Found 0 transactions";
        document.getElementById("searchTotal").textContent = "💰 Total: PKR 0.00";
    } catch (error) {
        console.error("❌ Error in clearSearch:", error);
    }
}

function quickSearch() {
    try {
        const term = prompt("Enter search term:");
        if (term) {
            showPage("search");
            document.getElementById("searchInput").value = term;
            setTimeout(() => performSearch(), 100);
        }
    } catch (error) {
        console.error("❌ Error in quickSearch:", error);
    }
}

// ==================== CATEGORY CRUD ====================
function addMainHead() {
    try {
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
    } catch (error) {
        console.error("❌ Error in addMainHead:", error);
        alert("Error adding main category: " + error.message);
    }
}

function addSubHead() {
    try {
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
    } catch (error) {
        console.error("❌ Error in addSubHead:", error);
        alert("Error adding sub category: " + error.message);
    }
}

function deleteMainHead(m) {
    if (!confirm(`Delete main category "${m}" and all its sub-categories?`)) {
        return;
    }
    
    try {
        delete heads[m];
        saveHeads();
        alert(`✅ Deleted main category: ${m}`);
    } catch (error) {
        console.error("❌ Error in deleteMainHead:", error);
        alert("Error deleting main category: " + error.message);
    }
}

function deleteSubHead(m, s) {
    if (!confirm(`Delete sub category "${s}" from "${m}"?`)) {
        return;
    }
    
    try {
        heads[m] = heads[m].filter(x => x !== s);
        saveHeads();
        alert(`✅ Deleted sub category: ${s}`);
    } catch (error) {
        console.error("❌ Error in deleteSubHead:", error);
        alert("Error deleting sub category: " + error.message);
    }
}

console.log("✅ app.js COMPLETE FIXED VERSION loaded with user isolation and db integration");