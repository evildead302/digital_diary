// app.js - COMPLETE VERSION WITH USER ISOLATION
// DEBUG: App.js loading started

if (typeof window.addDebugLog === 'function') {
    window.addDebugLog('app.js: Script loading started...', 'info');
} else {
    console.log('app.js: Script loading started...');
}

// ==================== GLOBAL VARIABLES ====================
const pages = document.querySelectorAll(".page");
let heads = {};
let tempEntries = [];
let isEditing = false;
let editingEntryId = null;
let authToken = null;
let currentUser = null;

// ==================== DEBUG LOGGING ====================
console.log("=== APP INITIALIZATION ===");
if (typeof window.addDebugLog === 'function') {
    window.addDebugLog('app.js: Global variables initialized', 'info');
}

// ==================== HELPER FUNCTION TO GET USER ID ====================
function getCurrentUserId() {
    // Always get fresh from currentUser object
    if (currentUser && currentUser.id) {
        return currentUser.id;
    }
    
    // Fallback to localStorage
    const userStr = localStorage.getItem('auth_user');
    if (userStr) {
        try {
            const user = JSON.parse(userStr);
            return user.id || null;
        } catch (e) {
            console.error("Error parsing user data:", e);
        }
    }
    
    console.error("No user ID found");
    return null;
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

// ==================== INITIALIZATION ON LOAD ====================
document.addEventListener("DOMContentLoaded", async function() {
    console.log("🔄 DOM fully loaded, initializing app...");
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: DOMContentLoaded event fired', 'success');
    }
    
    try {
        // Setup event listeners first
        if (typeof window.addDebugLog === 'function') {
            window.addDebugLog('app.js: Setting up event listeners...', 'info');
        }
        setupEventListeners();
        
        // Set today's date
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
        
        // Initialize dropdowns
        updateAllDropdowns();
        
        // Check authentication
        if (typeof window.addDebugLog === 'function') {
            window.addDebugLog('app.js: Calling checkAuth()...', 'info');
        }
        await checkAuth();
        
        if (typeof window.addDebugLog === 'function') {
            window.addDebugLog('app.js: Initialization complete', 'success');
        }
        
    } catch (error) {
        console.error("❌ Error in initialization:", error);
        if (typeof window.addDebugLog === 'function') {
            window.addDebugLog(`app.js: Initialization error: ${error.message}`, 'error');
        }
        showAuthScreen();
    }
});

// ==================== SETUP EVENT LISTENERS ====================
function setupEventListeners() {
    console.log("✅ Event listeners setup");
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: setupEventListeners() called', 'info');
    }
}

// ==================== DATABASE INITIALIZATION ====================
async function initUserDatabase() {
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: initUserDatabase() called', 'info');
    }
    
    // Get user ID using helper function
    const userId = getCurrentUserId();
    if (!userId) {
        console.error("Cannot initialize database: No user ID");
        if (typeof window.addDebugLog === 'function') {
            window.addDebugLog('app.js: No user ID for database init', 'error');
        }
        return false;
    }
    
    try {
        console.log("Initializing database for user:", userId);
        if (typeof window.addDebugLog === 'function') {
            window.addDebugLog(`app.js: Initializing database for user: ${userId}`, 'info');
        }
        
        // Set the user ID for database API
        if (typeof window.dbAPI?.setCurrentUserId === 'function') {
            window.dbAPI.setCurrentUserId(userId);
        }
        
        if (typeof window.dbAPI?.initDatabaseForUser === 'function') {
            await window.dbAPI.initDatabaseForUser(userId);
            console.log("✅ Database initialized for user:", userId);
            if (typeof window.addDebugLog === 'function') {
                window.addDebugLog('app.js: Database initialized successfully', 'success');
            }
            return true;
        } else if (typeof window.dbAPI?.openUserDatabase === 'function') {
            // Fallback to openUserDatabase if initDatabaseForUser doesn't exist
            await window.dbAPI.openUserDatabase();
            console.log("✅ Using fallback database setup for user:", userId);
            if (typeof window.addDebugLog === 'function') {
                window.addDebugLog('app.js: Using fallback database setup', 'warning');
            }
            return true;
        } else {
            console.error("❌ Database API not available");
            if (typeof window.addDebugLog === 'function') {
                window.addDebugLog('app.js: Database API not available', 'error');
            }
            return false;
        }
    } catch (error) {
        console.error("❌ Database initialization failed:", error);
        if (typeof window.addDebugLog === 'function') {
            window.addDebugLog(`app.js: Database init failed: ${error.message}`, 'error');
        }
        return false;
    }
}

// ==================== AUTHENTICATION FUNCTIONS ====================
async function checkAuth() {
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: checkAuth() called', 'info');
    }
    console.log('🔐 Checking authentication...');
    
    // Load from localStorage
    authToken = localStorage.getItem('auth_token');
    const userStr = localStorage.getItem('auth_user');
    
    if (userStr) {
        try {
            currentUser = JSON.parse(userStr);
            console.log("✅ Found user in localStorage:", currentUser.email);
            if (typeof window.addDebugLog === 'function') {
                window.addDebugLog(`app.js: Found user: ${currentUser.email}`, 'success');
            }
        } catch (e) {
            console.error("❌ Error parsing user data:", e);
            if (typeof window.addDebugLog === 'function') {
                window.addDebugLog('app.js: Error parsing user data', 'error');
            }
        }
    }
    
    const userId = getCurrentUserId();
    console.log({ 
        authToken: !!authToken, 
        currentUser: !!currentUser,
        userId 
    });
    
    if (authToken && currentUser && userId) {
        console.log("✅ User authenticated:", currentUser.email);
        if (typeof window.addDebugLog === 'function') {
            window.addDebugLog('app.js: User authenticated successfully', 'success');
        }
        
        // Initialize database for this user FIRST
        const dbInitialized = await initUserDatabase();
        
        if (!dbInitialized) {
            console.error("Failed to initialize database. Showing auth screen.");
            if (typeof window.addDebugLog === 'function') {
                window.addDebugLog('app.js: Database init failed, showing auth screen', 'error');
            }
            showAuthScreen();
            return;
        }
        
        // Database ready, show app
        document.getElementById("authScreen").style.display = "none";
        document.getElementById("appScreen").style.display = "block";
        document.getElementById("userName").textContent = currentUser.email || currentUser.name || "User";
        document.getElementById("settingsUserEmail").textContent = currentUser.email;
        
        // Initialize user-specific data
        await initUserData();
        initApp();
        
        // Redirect to home page
        showPage('home');
    } else {
        console.log("❌ No valid authentication found");
        if (typeof window.addDebugLog === 'function') {
            window.addDebugLog('app.js: No valid authentication found', 'warning');
        }
        showAuthScreen();
    }
}

function showAuthScreen() {
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: showAuthScreen() called', 'info');
    }
    console.log("Showing auth screen");
    document.getElementById("authScreen").style.display = "block";
    document.getElementById("appScreen").style.display = "none";
    
    // Clear any error messages
    const errorEl = document.getElementById("authError");
    if (errorEl) errorEl.textContent = "";
    
    const statusEl = document.getElementById("authStatus");
    if (statusEl) statusEl.textContent = "";
}

async function login() {
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: login() function called', 'success');
        window.addDebugLog('app.js: login() is defined and accessible', 'success');
    }
    
    const emailField = document.getElementById("authEmail");
    const passwordField = document.getElementById("authPassword");
    
    if (!emailField || !passwordField) {
        console.error("❌ Could not find email or password input fields");
        if (typeof window.addDebugLog === 'function') {
            window.addDebugLog('app.js: Could not find input fields', 'error');
        }
        const errorEl = document.getElementById("authError");
        if (errorEl) errorEl.textContent = "System error: Input fields not found";
        return;
    }
    
    const email = emailField.value.trim();
    const password = passwordField.value;
    const errorEl = document.getElementById("authError");
    const statusEl = document.getElementById("authStatus");
    
    console.log("📧 Email entered:", email);
    console.log("🔑 Password entered (length):", password.length);
    
    if (!email || !password) {
        if (errorEl) errorEl.textContent = "Please enter both email and password";
        return;
    }
    
    if (errorEl) errorEl.textContent = "";
    if (statusEl) statusEl.textContent = "Logging in...";
    
    console.log("🔐 Attempting login for:", email);
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog(`app.js: Attempting login for: ${email}`, 'info');
    }
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        
        console.log("📥 Login response status:", response.status);
        if (typeof window.addDebugLog === 'function') {
            window.addDebugLog(`app.js: Login response status: ${response.status}`, 'info');
        }
        
        const responseText = await response.text();
        console.log("📥 Login response text:", responseText);
        
        let result;
        try {
            result = JSON.parse(responseText);
        } catch (parseError) {
            console.error("❌ JSON parse error:", parseError);
            if (typeof window.addDebugLog === 'function') {
                window.addDebugLog('app.js: JSON parse error in login response', 'error');
            }
            if (errorEl) errorEl.textContent = "Invalid server response";
            if (statusEl) statusEl.textContent = "";
            return;
        }
        
        if (result.success && result.token && result.user) {
            authToken = result.token;
            currentUser = result.user; // ✅ User object contains ID
            
            console.log("✅ Login successful, setting localStorage:", {
                userId: currentUser.id, // ✅ ID is in user object
                userEmail: currentUser.email
            });
            
            if (typeof window.addDebugLog === 'function') {
                window.addDebugLog('app.js: Login successful, setting localStorage', 'success');
            }
            
            localStorage.setItem("auth_token", result.token);
            localStorage.setItem("auth_user", JSON.stringify(result.user));
            
            if (statusEl) statusEl.textContent = "✅ Login successful! Loading app...";
            
            // Clear only shared localStorage, not user-specific IndexedDB
            clearOtherUserData();
            
            // Call checkAuth which will handle database initialization
            setTimeout(() => {
                checkAuth();
            }, 500);
            
        } else {
            if (errorEl) errorEl.textContent = result.message || "Login failed. Please check your credentials.";
            if (statusEl) statusEl.textContent = "";
        }
    } catch (error) {
        console.error("❌ Login error:", error);
        if (typeof window.addDebugLog === 'function') {
            window.addDebugLog(`app.js: Login error: ${error.message}`, 'error');
        }
        if (errorEl) errorEl.textContent = `Login failed: ${error.message}. Please check your network connection.`;
        if (statusEl) statusEl.textContent = "";
    }
}

async function register() {
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: register() function called', 'success');
    }
    
    const emailField = document.getElementById("authEmail");
    const passwordField = document.getElementById("authPassword");
    
    if (!emailField || !passwordField) {
        console.error("❌ Could not find email or password input fields");
        const errorEl = document.getElementById("authError");
        if (errorEl) errorEl.textContent = "System error: Input fields not found";
        return;
    }
    
    const email = emailField.value.trim();
    const password = passwordField.value;
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
    
    if (errorEl) errorEl.textContent = "";
    if (statusEl) statusEl.textContent = "Registering...";
    
    console.log("📝 Attempting registration for:", email);
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog(`app.js: Attempting registration for: ${email}`, 'info');
    }
    
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ 
                email, 
                password,
                name: email.split("@")[0]
            })
        });
        
        console.log("📥 Register response status:", response.status);
        if (typeof window.addDebugLog === 'function') {
            window.addDebugLog(`app.js: Register response status: ${response.status}`, 'info');
        }
        
        const responseText = await response.text();
        console.log("📥 Register response text:", responseText);
        
        let result;
        try {
            result = JSON.parse(responseText);
        } catch (parseError) {
            console.error("❌ JSON parse error:", parseError);
            if (typeof window.addDebugLog === 'function') {
                window.addDebugLog('app.js: JSON parse error in register response', 'error');
            }
            if (errorEl) errorEl.textContent = "Invalid server response";
            if (statusEl) statusEl.textContent = "";
            return;
        }
        
        if (result.success && result.token && result.user) {
            authToken = result.token;
            currentUser = result.user; // ✅ User object contains ID
            
            console.log("✅ Registration successful, setting localStorage");
            if (typeof window.addDebugLog === 'function') {
                window.addDebugLog('app.js: Registration successful', 'success');
            }
            
            localStorage.setItem("auth_token", result.token);
            localStorage.setItem("auth_user", JSON.stringify(result.user));
            
            if (statusEl) statusEl.textContent = "✅ Registration successful! Loading app...";
            
            // Clear only shared localStorage, not user-specific IndexedDB
            clearOtherUserData();
            
            // Call checkAuth which will handle database initialization
            setTimeout(() => {
                checkAuth();
            }, 500);
            
        } else {
            if (errorEl) errorEl.textContent = result.message || "Registration failed. User may already exist.";
            if (statusEl) statusEl.textContent = "";
        }
    } catch (error) {
        console.error("❌ Registration error:", error);
        if (typeof window.addDebugLog === 'function') {
            window.addDebugLog(`app.js: Registration error: ${error.message}`, 'error');
        }
        if (errorEl) errorEl.textContent = `Registration failed: ${error.message}`;
        if (statusEl) statusEl.textContent = "";
    }
}

function logout() {
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: logout() function called', 'info');
    }
    
    if (confirm("Are you sure you want to logout?")) {
        const currentUserId = getCurrentUserId();
        
        if (typeof window.dbAPI?.closeDatabase === 'function') {
            window.dbAPI.closeDatabase();
        }
        
        // Clear the current user's IndexedDB database too
        if (currentUserId) {
            const dbName = `AccountsDiaryDB_${currentUserId}`;
            try {
                const deleteRequest = indexedDB.deleteDatabase(dbName);
                deleteRequest.onsuccess = () => {
                    console.log(`✅ Deleted current user database on logout: ${dbName}`);
                };
                deleteRequest.onerror = (error) => {
                    console.error(`❌ Failed to delete database ${dbName}:`, error);
                };
            } catch (error) {
                console.error("Error deleting database on logout:", error);
            }
        }
        
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_user");
        
        // Clear global variables but NOT database data
        authToken = null;
        currentUser = null;
        heads = {};
        tempEntries = [];
        isEditing = false;
        editingEntryId = null;
        
        showAuthScreen();
    }
}

function clearOtherUserData() {
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: clearOtherUserData() called', 'info');
    }
    
    const userId = getCurrentUserId();
    if (!userId) {
        console.error("Cannot clear other user data: No user ID");
        return;
    }
    
    console.log("🧹 Clearing other user data for user:", userId);
    
    // Clear previous user's IndexedDB data
    clearOtherUsersIndexedDB(userId);
    
    // Only clear shared localStorage that doesn't belong to current user
    // Keep auth_token and auth_user for current user
    const allKeys = Object.keys(localStorage);
    allKeys.forEach(key => {
        if (!key.includes(userId) && 
            !key.startsWith('heads_') &&
            key !== 'auth_token' && 
            key !== 'auth_user') {
            localStorage.removeItem(key);
        }
    });
    
    console.log("✅ Other user data cleared successfully");
}

// Helper function to clear other users' IndexedDB databases
async function clearOtherUsersIndexedDB(currentUserId) {
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: clearOtherUsersIndexedDB() called', 'info');
    }
    
    try {
        console.log("🔍 Scanning for other users' IndexedDB databases...");
        
        // Get all database names from IndexedDB
        const databases = await window.indexedDB.databases ? 
            await window.indexedDB.databases() : 
            await getAllDatabaseNames();
        
        if (!databases || databases.length === 0) {
            console.log("ℹ️ No IndexedDB databases found");
            return;
        }
        
        // Filter databases that don't belong to current user
        const currentUserDBPrefix = `AccountsDiaryDB_${currentUserId}`;
        const otherUserDBs = databases.filter(db => 
            db.name && 
            db.name.startsWith('AccountsDiaryDB_') && 
            db.name !== currentUserDBPrefix
        );
        
        console.log(`Found ${otherUserDBs.length} other user databases to clear`);
        
        // Close and delete each other user's database
        for (const dbInfo of otherUserDBs) {
            try {
                // Close the database if it's open
                if (window.dbAPI?.closeDatabase) {
                    window.dbAPI.closeDatabase();
                }
                
                // Delete the database
                const deleteRequest = indexedDB.deleteDatabase(dbInfo.name);
                
                await new Promise((resolve, reject) => {
                    deleteRequest.onsuccess = () => {
                        console.log(`✅ Deleted other user database: ${dbInfo.name}`);
                        resolve();
                    };
                    deleteRequest.onerror = (error) => {
                        console.error(`❌ Failed to delete database ${dbInfo.name}:`, error);
                        reject(error);
                    };
                    deleteRequest.onblocked = () => {
                        console.warn(`⚠️ Database ${dbInfo.name} is blocked (might be open in another tab)`);
                        // Try to close connections
                        if (window.dbAPI?.closeDatabase) {
                            window.dbAPI.closeDatabase();
                        }
                        setTimeout(() => {
                            indexedDB.deleteDatabase(dbInfo.name);
                            resolve();
                        }, 1000);
                    };
                });
                
            } catch (error) {
                console.error(`Error deleting database ${dbInfo.name}:`, error);
            }
        }
        
        console.log("✅ Other users' IndexedDB data cleared");
        
    } catch (error) {
        console.error("❌ Error clearing other users' IndexedDB:", error);
    }
}

// Fallback function to get all database names (for browsers that don't support indexedDB.databases())
async function getAllDatabaseNames() {
    const databases = [];
    
    try {
        // This is a workaround since indexedDB.databases() is not widely supported
        // We'll check for common database names based on our naming convention
        const commonPrefixes = ['AccountsDiaryDB_'];
        
        // We can't list all databases reliably, so we'll rely on localStorage to track
        // which databases have been created
        const allKeys = Object.keys(localStorage);
        const userIdsFromStorage = [];
        
        // Extract user IDs from localStorage keys
        allKeys.forEach(key => {
            if (key === 'auth_user') {
                try {
                    const userData = JSON.parse(localStorage.getItem(key));
                    if (userData && userData.id) {
                        userIdsFromStorage.push(userData.id);
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            }
        });
        
        // Create database info objects for each user ID found
        userIdsFromStorage.forEach(userId => {
            if (userId !== currentUserId) {
                databases.push({ name: `AccountsDiaryDB_${userId}` });
            }
        });
        
    } catch (error) {
        console.error("Error getting database names:", error);
    }
    
    return databases;
}

// ==================== USER-SPECIFIC DATA MANAGEMENT ====================
async function initUserData() {
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: initUserData() called', 'info');
    }
    
    const userId = getCurrentUserId();
    if (!userId) {
        console.error("Cannot init user data: No user ID");
        return;
    }
    
    // Load heads from IndexedDB instead of localStorage
    if (typeof window.dbAPI?.getUserHeads === 'function') {
        heads = await window.dbAPI.getUserHeads();
        console.log("✅ Loaded user heads from IndexedDB for user:", userId);
    } else {
        // Fallback to localStorage (for backward compatibility)
        const userHeadsKey = `heads_${userId}`;
        const storedHeads = localStorage.getItem(userHeadsKey);
        if (storedHeads) {
            heads = JSON.parse(storedHeads);
            console.log("⚠️ Loaded user heads from localStorage (fallback) for user:", userId);
        } else {
            heads = {};
            console.log("ℹ️ No existing heads found for user:", userId);
        }
    }
    
    await preloadCategoriesFromEntries();
}

async function saveUserHeads() {
    const userId = getCurrentUserId();
    if (!userId) {
        console.error("Cannot save heads: No user ID");
        return;
    }
    
    // Save heads to IndexedDB
    if (typeof window.dbAPI?.saveUserHeads === 'function') {
        await window.dbAPI.saveUserHeads(heads);
        console.log("✅ Saved user heads to IndexedDB for user:", userId);
    } else {
        // Fallback to localStorage (for backward compatibility)
        const userHeadsKey = `heads_${userId}`;
        localStorage.setItem(userHeadsKey, JSON.stringify(heads));
        console.log("⚠️ Saved user heads to localStorage (fallback) for user:", userId);
    }
}

async function preloadCategoriesFromEntries() {
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: preloadCategoriesFromEntries() called', 'info');
    }
    
    const userId = getCurrentUserId();
    if (!userId) {
        console.error("Cannot preload categories: No user ID");
        return;
    }
    
    if (!window.dbAPI) {
        console.error("Database API not available");
        return;
    }
    
    getAllEntries(userEntries => {
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

function generateEntryId() {
    const userId = getCurrentUserId();
    if (!userId) {
        console.error("No user ID available for entry generation");
        return 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    return Base61.generateEntryId(userId);
}

// ==================== INITIALIZATION ====================
function initApp() {
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: initApp() called', 'info');
    }
    
    const userId = getCurrentUserId();
    console.log("🚀 Initializing app for user:", currentUser?.email, "ID:", userId);
    
    updateAllDropdowns();
    calcTotal();
    loadSaved();
    updateSettingsUI();
    updateSyncStatus();
    testAPI();
    
    setupEntryScroll();
    updateSyncButtons();
}

async function testAPI() {
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: testAPI() called', 'info');
    }
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

function updateSyncButtons() {
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: updateSyncButtons() called', 'info');
    }
    const quickActions = document.querySelector(".quick-actions");
    if (quickActions) {
        const oldBtn = quickActions.querySelector("#syncBtn");
        if (oldBtn) oldBtn.remove();
        
        if (!quickActions.querySelector("#syncToCloudBtn")) {
            const syncToBtn = document.createElement("button");
            syncToBtn.id = "syncToCloudBtn";
            syncToBtn.className = "primary-btn sync-to-btn";
            syncToBtn.innerHTML = "⬆️ Sync TO Cloud";
            syncToBtn.onclick = syncWithCloud;
            quickActions.appendChild(syncToBtn);
            
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
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: getAllEntries() called', 'info');
    }
    if (typeof window.dbAPI?.getAllEntries === 'function') {
        window.dbAPI.getAllEntries(callback);
    } else {
        console.error("getAllEntries not available in dbAPI");
        callback([]);
    }
}

function saveEntry(entry) {
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: saveEntry() called', 'info');
    }
    if (typeof window.dbAPI?.saveEntry === 'function') {
        return window.dbAPI.saveEntry(entry);
    } else {
        console.error("saveEntry not available in dbAPI");
        return Promise.reject(new Error("Database not available"));
    }
}

function getEntriesNeedingSync() {
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: getEntriesNeedingSync() called', 'info');
    }
    if (typeof window.dbAPI?.getEntriesNeedingSync === 'function') {
        return window.dbAPI.getEntriesNeedingSync();
    } else {
        console.error("getEntriesNeedingSync not available in dbAPI");
        return Promise.resolve([]);
    }
}

function markAsSynced(entryIds) {
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: markAsSynced() called', 'info');
    }
    if (typeof window.dbAPI?.markAsSynced === 'function') {
        return window.dbAPI.markAsSynced(entryIds);
    } else {
        console.error("markAsSynced not available in dbAPI");
        return Promise.resolve({ updatedCount: 0, errors: [] });
    }
}

function getUserEntries(callback) {
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: getUserEntries() called', 'info');
    }
    getAllEntries(callback);
}

// ==================== TEMPORARY ENTRIES RENDER ====================
function renderTemp() {
    try {
        if (typeof window.addDebugLog === 'function') {
            window.addDebugLog('app.js: renderTemp() called', 'info');
        }
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
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: syncFromCloud() called', 'info');
    }
    
    const userId = getCurrentUserId();
    if (!authToken || !userId) {
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
            console.log(`☁️ Found ${data.expenses.length} expenses in cloud for user ${userId}`);
            
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
            
            saveUserHeads();
            updateAllDropdowns();
            
            console.log(`✅ Sync from cloud complete for user ${userId}: ${importedCount} imported`);
            if (typeof window.addDebugLog === 'function') {
                window.addDebugLog(`app.js: Sync FROM Cloud complete for user ${userId}: ${importedCount} imported`, 'success');
            }
            
            let message = `✅ Sync FROM Cloud Complete!\n`;
            if (importedCount > 0) message += `• ${importedCount} entries imported\n`;
            
            alert(message);
            
            loadSaved();
            calcTotal();
            updateSyncStatus();
            
        } else {
            alert("✅ No data found in cloud or cloud is empty.");
        }
        
    } catch (error) {
        console.error("❌ Sync from cloud error:", error);
        if (typeof window.addDebugLog === 'function') {
            window.addDebugLog(`app.js: Sync FROM Cloud error for user ${userId}: ${error.message}`, 'error');
        }
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
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: syncWithCloud() called', 'info');
    }
    
    const userId = getCurrentUserId();
    if (!authToken || !userId) {
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
        const userUnsyncedEntries = await getEntriesNeedingSync();
        
        console.log(`🔄 Found ${userUnsyncedEntries.length} unsynced entries for user ${userId}`);
        if (typeof window.addDebugLog === 'function') {
            window.addDebugLog(`app.js: Found ${userUnsyncedEntries.length} unsynced entries for user ${userId}`, 'info');
        }
        
        if (userUnsyncedEntries.length === 0) {
            alert("✅ All entries are already synced!");
            if (syncBtn) {
                syncBtn.textContent = originalText;
                syncBtn.disabled = false;
            }
            updateSyncStatus();
            return;
        }
        
        const deletedEntries = userUnsyncedEntries.filter(e => e.syncRemarks === "deleted");
        const otherEntries = userUnsyncedEntries.filter(e => e.syncRemarks !== "deleted");
        
        console.log(`📤 Syncing ${otherEntries.length} entries, deleting ${deletedEntries.length} entries for user ${userId}`);
        
        const expensesToSync = otherEntries.map(entry => ({
            id: entry.id,
            date: entry.date,
            description: entry.desc,
            amount: parseFloat(entry.amount),
            main_category: entry.main,
            sub_category: entry.sub,
            syncRemarks: entry.syncRemarks
        }));
        
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
                if (data.errors && data.errors.length > 0) {
                    syncErrors = data.errors;
                    console.warn("⚠️ Some entries failed to sync:", data.errors);
                }
                
                if (data.successes && data.successes.length > 0) {
                    await markAsSynced(data.successes);
                    console.log(`✅ Marked ${data.successes.length} entries as synced for user ${userId}`);
                }
            } else {
                throw new Error(data.message || "Sync failed");
            }
        }
        
        let deletedErrors = [];
        let deletedSuccessCount = 0;
        
        if (deletedEntries.length > 0) {
            console.log(`🗑️ Deleting ${deletedEntries.length} entries from cloud for user ${userId}...`);
            
            for (const deletedEntry of deletedEntries) {
                try {
                    const deleteResponse = await fetch(`/api/expenses?id=${deletedEntry.id}`, {
                        method: "DELETE",
                        headers: {
                            "Authorization": `Bearer ${authToken}`
                        }
                    });
                    
                    if (deleteResponse.ok) {
                        console.log(`✅ Successfully deleted entry ${deletedEntry.id} from cloud for user ${userId}`);
                        deletedSuccessCount++;
                    } else {
                        console.error(`❌ Failed to delete entry ${deletedEntry.id} from cloud for user ${userId}`);
                        deletedErrors.push({ id: deletedEntry.id, error: "Failed to delete from cloud" });
                    }
                } catch (deleteError) {
                    console.error(`❌ Error deleting entry ${deletedEntry.id} for user ${userId}:`, deleteError);
                    deletedErrors.push({ id: deletedEntry.id, error: deleteError.message });
                }
            }
        }
        
        const totalErrors = syncErrors.length + deletedErrors.length;
        
        if (totalErrors === 0) {
            alert(`✅ Sync TO Cloud Complete!\n• ${otherEntries.length} entries synced\n• ${deletedSuccessCount} entries deleted`);
            if (typeof window.addDebugLog === 'function') {
                window.addDebugLog(`app.js: Sync TO Cloud complete successfully for user ${userId}`, 'success');
            }
        } else {
            let errorMessage = `⚠️ Sync TO Cloud Partial Success\n`;
            if (otherEntries.length > 0) errorMessage += `• ${otherEntries.length - syncErrors.length}/${otherEntries.length} entries synced\n`;
            if (deletedEntries.length > 0) errorMessage += `• ${deletedSuccessCount}/${deletedEntries.length} entries deleted\n`;
            errorMessage += `\n❌ ${totalErrors} errors occurred.`;
            
            alert(errorMessage);
        }
        
        calcTotal();
        loadSaved();
        updateSyncStatus();
        
    } catch (error) {
        console.error("❌ Sync error for user:", userId, error);
        if (typeof window.addDebugLog === 'function') {
            window.addDebugLog(`app.js: Sync TO Cloud error for user ${userId}: ${error.message}`, 'error');
        }
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
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: loadDataFromCloudOnLogin() called', 'info');
    }
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
            
            saveUserHeads();
            
            console.log(`✅ Login sync: ${importedCount} entries loaded`);
            if (typeof window.addDebugLog === 'function') {
                window.addDebugLog(`app.js: Login sync loaded ${importedCount} entries`, 'success');
            }
            
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
        if (typeof window.addDebugLog === 'function') {
            window.addDebugLog(`app.js: Error loading from cloud: ${error.message}`, 'error');
        }
        return [];
    }
}

// ==================== FIX SCROLL ISSUES ====================
function setupEntryScroll() {
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: setupEntryScroll() called', 'info');
    }
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
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: exportToCSV() called', 'info');
    }
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
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: importFromCSV() called', 'info');
    }
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        const csvData = e.target.result;
        const lines = csvData.split('\n');
        let rowsToImport = [];
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
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
        
        let imported = 0;
        let errors = 0;
        
        for (let i = 0; i < rowsToImport.length; i++) {
            try {
                const entry = rowsToImport[i];
                entry.id = generateEntryId();
                await saveEntry(entry);
                imported++;
                
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
        
        saveUserHeads();
        event.target.value = '';
        
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
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog(`app.js: showPage() called with id: ${id}`, 'success');
        window.addDebugLog('app.js: showPage() is defined and accessible', 'success');
    }
    
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
            
            if (id === "entry") {
                setTimeout(setupEntryScroll, 100);
            }
            
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
        if (typeof window.addDebugLog === 'function') {
            window.addDebugLog(`app.js: Error in showPage: ${error.message}`, 'error');
        }
    }
}

// ==================== UPDATE SETTINGS UI ====================
function updateSettingsUI() {
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: updateSettingsUI() called', 'info');
    }
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

// ==================== CATEGORY MANAGEMENT ====================
function saveHeads() {
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: saveHeads() called', 'info');
    }
    saveUserHeads();
    renderHeads();
    updateAllDropdowns();
}

function renderHeads() {
    try {
        if (typeof window.addDebugLog === 'function') {
            window.addDebugLog('app.js: renderHeads() called', 'info');
        }
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
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: updateAllDropdowns() called', 'info');
    }
    updateEntryDropdowns();
    updateLedgerCategories();
    updateSearchCategories();
}

// ==================== ENTRY PAGE ====================
function updateEntryDropdowns() {
    try {
        if (typeof window.addDebugLog === 'function') {
            window.addDebugLog('app.js: updateEntryDropdowns() called', 'info');
        }
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
        if (typeof window.addDebugLog === 'function') {
            window.addDebugLog('app.js: updateEntrySubheads() called', 'info');
        }
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
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: addTemp() function called', 'success');
        window.addDebugLog('app.js: addTemp() is defined and accessible', 'success');
    }
    
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
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: editTemp() called', 'info');
    }
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
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: deleteTemp() called', 'info');
    }
    if (confirm("Delete this temporary entry?")) {
        tempEntries.splice(i, 1);
        renderTemp();
    }
}

function clearTemp() {
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: clearTemp() called', 'info');
    }
    if (tempEntries.length > 0 && confirm("Clear all temporary entries?")) {
        tempEntries = [];
        renderTemp();
    }
}

// ==================== SAVE ALL ENTRIES ====================
async function saveAll() {
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: saveAll() function called', 'success');
        window.addDebugLog('app.js: saveAll() is defined and accessible', 'success');
    }
    
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
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: loadSaved() called', 'info');
    }
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
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: deleteSavedEntry() called', 'info');
    }
    if (!confirm("Delete this entry? This will mark it for deletion and sync with cloud.")) {
        return;
    }
    
    try {
        getUserEntries(async d => {
            const entry = d.find(x => x.id === id);
            if (!entry) return;
            
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

function editSavedEntryFromOtherPage(id) {
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: editSavedEntryFromOtherPage() called', 'info');
    }
    showPage('entry');
    
    setTimeout(() => {
        editSavedEntry(id);
    }, 100);
}

function cancelEdit() {
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: cancelEdit() function called', 'success');
        window.addDebugLog('app.js: cancelEdit() is defined and accessible', 'success');
    }
    
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
        if (typeof window.addDebugLog === 'function') {
            window.addDebugLog('app.js: resetEntryForm() called', 'info');
        }
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
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: calcTotal() called', 'info');
    }
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
        if (typeof window.addDebugLog === 'function') {
            window.addDebugLog('app.js: renderBalance() called', 'info');
        }
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
        if (typeof window.addDebugLog === 'function') {
            window.addDebugLog('app.js: loadRecentEntries() called', 'info');
        }
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
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: loadHomeData() called', 'info');
    }
    calcTotal();
}

// ==================== SYNC STATUS ====================
function updateSyncStatus(entries = null) {
    try {
        if (typeof window.addDebugLog === 'function') {
            window.addDebugLog('app.js: updateSyncStatus() called', 'info');
        }
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
        if (typeof window.addDebugLog === 'function') {
            window.addDebugLog('app.js: updateLedgerCategories() called', 'info');
        }
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
        if (typeof window.addDebugLog === 'function') {
            window.addDebugLog('app.js: updateLedgerSubheads() function called', 'success');
            window.addDebugLog('app.js: updateLedgerSubheads() is defined and accessible', 'success');
        }
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
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: loadLedger() called', 'info');
    }
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
        if (typeof window.addDebugLog === 'function') {
            window.addDebugLog('app.js: resetLedgerFilters() called', 'info');
        }
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
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: exportLedger() called', 'info');
    }
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
        if (typeof window.addDebugLog === 'function') {
            window.addDebugLog('app.js: updateSearchCategories() called', 'info');
        }
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
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: performSearch() called', 'info');
    }
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
        if (typeof window.addDebugLog === 'function') {
            window.addDebugLog('app.js: displaySearchResults() called', 'info');
        }
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
        if (typeof window.addDebugLog === 'function') {
            window.addDebugLog('app.js: clearSearch() called', 'info');
        }
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
        if (typeof window.addDebugLog === 'function') {
            window.addDebugLog('app.js: quickSearch() called', 'info');
        }
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
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: addMainHead() function called', 'success');
        window.addDebugLog('app.js: addMainHead() is defined and accessible', 'success');
    }
    
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
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: addSubHead() function called', 'success');
        window.addDebugLog('app.js: addSubHead() is defined and accessible', 'success');
    }
    
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
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: deleteMainHead() called', 'info');
    }
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
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: deleteSubHead() called', 'info');
    }
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

// ==================== GLOBAL FUNCTION EXPOSURE ====================
// EXPOSE ALL FUNCTIONS TO WINDOW OBJECT FOR HTML ACCESS
window.login = login;
window.register = register;
window.logout = logout;
window.checkAuth = checkAuth;
window.showPage = showPage;
window.addTemp = addTemp;
window.editTemp = editTemp;
window.deleteTemp = deleteTemp;
window.clearTemp = clearTemp;
window.saveAll = saveAll;
window.cancelEdit = cancelEdit;
window.addMainHead = addMainHead;
window.addSubHead = addSubHead;
window.deleteMainHead = deleteMainHead;
window.deleteSubHead = deleteSubHead;
window.updateEntrySubheads = updateEntrySubheads;
window.updateLedgerSubheads = updateLedgerSubheads;
window.loadLedger = loadLedger;
window.resetLedgerFilters = resetLedgerFilters;
window.exportLedger = exportLedger;
window.performSearch = performSearch;
window.clearSearch = clearSearch;
window.quickSearch = quickSearch;
window.editSavedEntryFromOtherPage = editSavedEntryFromOtherPage;
window.deleteSavedEntry = deleteSavedEntry;
window.syncWithCloud = syncWithCloud;
window.syncFromCloud = syncFromCloud;
window.exportToCSV = exportToCSV;
window.importFromCSV = importFromCSV;
window.testAPI = testAPI;

// Expose Base61 class
window.Base61 = Base61;

console.log("✅ app.js COMPLETELY LOADED - All functions exposed to global scope");

if (typeof window.addDebugLog === 'function') {
    window.addDebugLog('app.js: COMPLETELY LOADED - All functions exposed to global scope', 'success');
    window.addDebugLog('app.js: login() is now available on window.login', 'success');
    window.addDebugLog('app.js: showPage() is now available on window.showPage', 'success');
    window.addDebugLog('app.js: logout() is now available on window.logout', 'success');
    window.addDebugLog('app.js: checkAuth() is now available on window.checkAuth', 'success');
}

// TEST: Immediately log that functions are available
setTimeout(() => {
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog('app.js: Testing function availability...', 'info');
        window.addDebugLog(`app.js: window.login is ${typeof window.login}`, 
            typeof window.login === 'function' ? 'success' : 'error');
        window.addDebugLog(`app.js: window.showPage is ${typeof window.showPage}`, 
            typeof window.showPage === 'function' ? 'success' : 'error');
        window.addDebugLog(`app.js: window.logout is ${typeof window.logout}`, 
            typeof window.logout === 'function' ? 'success' : 'error');
        window.addDebugLog(`app.js: window.checkAuth is ${typeof window.checkAuth}`, 
            typeof window.checkAuth === 'function' ? 'success' : 'error');
    }
}, 100);
