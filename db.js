// db.js - IndexedDB for Accounts Diary WITH COMPLETE USER ISOLATION
let db;
let currentUserId = null;

// Set current user ID for database operations
function setCurrentUserId(userId) {
    currentUserId = userId;
    console.log("DB: Current user ID set to:", currentUserId);
}

// Open or create IndexedDB database - USER-SPECIFIC
function openUserDatabase() {
    if (!currentUserId) {
        console.error("No user ID provided for database");
        return Promise.reject(new Error("User not logged in"));
    }
    
    // Create user-specific database name
    const dbName = `AccountsDiaryDB_${currentUserId}`;
    console.log("Opening database for user:", dbName);
    
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName, 8); // Version 8 (incremented)
        
        req.onupgradeneeded = e => {
            db = e.target.result;
            console.log("🔄 Upgrading/Creating database to version:", e.newVersion);
            
            // Delete existing stores only if this is a new database for this user
            if (e.oldVersion === 0) {
                console.log("Creating fresh database for user:", currentUserId);
                
                // Create entries store
                console.log("Creating entries store...");
                const entriesStore = db.createObjectStore("entries", { keyPath: "id" });
                entriesStore.createIndex("date", "date", { unique: false });
                entriesStore.createIndex("main", "main", { unique: false });
                entriesStore.createIndex("sub", "sub", { unique: false });
                entriesStore.createIndex("amount", "amount", { unique: false });
                entriesStore.createIndex("synced", "synced", { unique: false });
                entriesStore.createIndex("syncRemarks", "syncRemarks", { unique: false });
                entriesStore.createIndex("userId", "userId", { unique: false });
                entriesStore.createIndex("created_at", "created_at", { unique: false });
                entriesStore.createIndex("updated_at", "updated_at", { unique: false });
                
                // Create other stores
                console.log("Creating syncMeta store...");
                db.createObjectStore("syncMeta", { keyPath: "key" });
                
                console.log("Creating userSettings store...");
                db.createObjectStore("userSettings", { keyPath: "key" });
                
                console.log("✅ All object stores created fresh for user:", currentUserId);
            } else {
                console.log("🔄 Upgrading existing database for user:", currentUserId);
                // Keep existing data, just ensure indexes exist
                if (!db.objectStoreNames.contains("entries")) {
                    const entriesStore = db.createObjectStore("entries", { keyPath: "id" });
                    entriesStore.createIndex("date", "date", { unique: false });
                    entriesStore.createIndex("main", "main", { unique: false });
                    entriesStore.createIndex("sub", "sub", { unique: false });
                    entriesStore.createIndex("amount", "amount", { unique: false });
                    entriesStore.createIndex("synced", "synced", { unique: false });
                    entriesStore.createIndex("syncRemarks", "syncRemarks", { unique: false });
                    entriesStore.createIndex("userId", "userId", { unique: false });
                    entriesStore.createIndex("created_at", "created_at", { unique: false });
                    entriesStore.createIndex("updated_at", "updated_at", { unique: false });
                }
                
                if (!db.objectStoreNames.contains("syncMeta")) {
                    db.createObjectStore("syncMeta", { keyPath: "key" });
                }
                
                if (!db.objectStoreNames.contains("userSettings")) {
                    db.createObjectStore("userSettings", { keyPath: "key" });
                }
            }
        };
        
        req.onsuccess = e => {
            db = e.target.result;
            console.log("✅ User database opened successfully for:", currentUserId);
            console.log("📁 Available object stores:", Array.from(db.objectStoreNames));
            
            // Initialize with user's data
            initializeUserData().then(() => {
                resolve(db);
            }).catch(error => {
                console.error("Error initializing user data:", error);
                resolve(db); // Still resolve even if initialization fails
            });
        };
        
        req.onerror = e => {
            console.error("❌ Failed to open user database:", e.target.error);
            reject(e.target.error);
        };
    });
}

// Initialize user-specific data
async function initializeUserData() {
    if (!db || !currentUserId) return;
    
    console.log("📊 Initializing user data for:", currentUserId);
    
    // Check if entries store exists BEFORE trying to access it
    if (!db.objectStoreNames.contains("entries")) {
        console.log("⚠️ Entries store doesn't exist yet - fresh database");
        return;
    }
    
    try {
        const transaction = db.transaction(["entries"], "readonly");
        const store = transaction.objectStore("entries");
        const request = store.count();
        
        request.onsuccess = () => {
            console.log(`📊 Found ${request.result} existing entries for user ${currentUserId}`);
        };
        
        request.onerror = (error) => {
            console.error("❌ Error counting entries:", error);
        };
    } catch (error) {
        console.error("❌ Error accessing entries store:", error);
        // Don't throw - this is okay for new users
    }
    
    // Load user settings if store exists
    if (db.objectStoreNames.contains("userSettings")) {
        await loadUserSettings();
    }
}

// Load user settings
async function loadUserSettings() {
    if (!db || !db.objectStoreNames.contains("userSettings")) return null;
    
    try {
        const transaction = db.transaction(["userSettings"], "readonly");
        const store = transaction.objectStore("userSettings");
        const request = store.get("heads");
        
        return new Promise((resolve) => {
            request.onsuccess = () => {
                const settings = request.result;
                if (settings) {
                    console.log("✅ Loaded user settings for:", currentUserId);
                }
                resolve(settings ? settings.value : null);
            };
            
            request.onerror = () => {
                console.log("ℹ️ No user settings found for:", currentUserId);
                resolve(null);
            };
        });
    } catch (error) {
        console.error("❌ Error loading user settings:", error);
        return null;
    }
}

// Save user settings
async function saveUserSettings(key, value) {
    if (!db || !db.objectStoreNames.contains("userSettings")) return;
    
    return new Promise((resolve, reject) => {
        try {
            const transaction = db.transaction(["userSettings"], "readwrite");
            const store = transaction.objectStore("userSettings");
            const request = store.put({ key, value });
            
            request.onsuccess = () => {
                console.log(`✅ Settings saved for ${currentUserId}: ${key}`);
                resolve();
            };
            
            request.onerror = () => {
                console.error(`❌ Failed to save settings for ${currentUserId}: ${key}`, request.error);
                reject(request.error);
            };
        } catch (error) {
            console.error(`❌ Transaction error saving settings for ${currentUserId}: ${key}`, error);
            reject(error);
        }
    });
}

// Generate unique ID - INCLUDES USER ID
function genID() {
    if (!currentUserId) {
        console.error("❌ No current user ID for ID generation");
        return 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const ss = String(d.getSeconds()).padStart(2, "0");
    const ms = String(d.getMilliseconds()).padStart(3, "0");
    const random = Math.floor(Math.random() * 1000);
    return `${ymd}${ss}${ms}${random}${currentUserId}`;
}

// Save entry - ALWAYS includes userId
function saveEntry(entry) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error("Database not initialized"));
            return;
        }
        
        if (!currentUserId) {
            reject(new Error("No user logged in"));
            return;
        }
        
        // Check if entries store exists
        if (!db.objectStoreNames.contains("entries")) {
            reject(new Error("Entries store not found - database may be corrupted"));
            return;
        }
        
        // Ensure entry has current user ID
        const completeEntry = {
            id: entry.id || genID(),
            date: entry.date || new Date().toISOString().split('T')[0],
            desc: entry.desc || '',
            amount: entry.amount || 0,
            main: entry.main || '',
            sub: entry.sub || '',
            synced: entry.synced || false,
            syncRemarks: entry.syncRemarks || 'new',
            userId: currentUserId, // ALWAYS set current user ID
            created_at: entry.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        try {
            const transaction = db.transaction(["entries"], "readwrite");
            const store = transaction.objectStore("entries");
            const request = store.put(completeEntry);
            
            request.onsuccess = () => {
                console.log("✅ Entry saved for user:", currentUserId, "Entry ID:", completeEntry.id);
                resolve(completeEntry);
            };
            
            request.onerror = () => {
                console.error("❌ Failed to save entry for user:", currentUserId, request.error);
                reject(request.error);
            };
        } catch (error) {
            console.error("❌ Transaction error in saveEntry for user:", currentUserId, error);
            reject(error);
        }
    });
}

// Get all entries - ONLY FOR CURRENT USER
function getAllEntries(callback) {
    if (!db) {
        console.error("❌ Database not initialized");
        callback([]);
        return;
    }
    
    if (!currentUserId) {
        console.error("❌ No user logged in");
        callback([]);
        return;
    }
    
    // Check if entries store exists
    if (!db.objectStoreNames.contains("entries")) {
        console.log("ℹ️ Entries store doesn't exist - returning empty array");
        callback([]);
        return;
    }
    
    try {
        const transaction = db.transaction(["entries"], "readonly");
        const store = transaction.objectStore("entries");
        
        // Always filter by userId in the application layer
        const request = store.getAll();
        
        request.onsuccess = () => {
            const allEntries = request.result || [];
            // Filter entries to show only current user's data
            const userEntries = allEntries.filter(e => e.userId === currentUserId);
            console.log(`📊 Retrieved ${userEntries.length} entries for user: ${currentUserId} (filtered from ${allEntries.length} total)`);
            callback(userEntries);
        };
        
        request.onerror = () => {
            console.error("❌ Failed to get entries:", request.error);
            callback([]);
        };
    } catch (error) {
        console.error("❌ Transaction error in getAllEntries:", error);
        callback([]);
    }
}

// Get entry by ID - VERIFIES USER OWNERSHIP
function getEntryById(id) {
    return new Promise((resolve, reject) => {
        if (!db || !db.objectStoreNames.contains("entries")) {
            reject(new Error("Database or entries store not found"));
            return;
        }
        
        if (!currentUserId) {
            reject(new Error("No user logged in"));
            return;
        }
        
        try {
            const transaction = db.transaction(["entries"], "readonly");
            const store = transaction.objectStore("entries");
            const request = store.get(id);
            
            request.onsuccess = () => {
                const entry = request.result;
                
                // Verify entry belongs to current user
                if (entry && entry.userId !== currentUserId) {
                    console.error("⚠️ Entry belongs to different user:", entry.userId);
                    resolve(null);
                    return;
                }
                
                resolve(entry);
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        } catch (error) {
            reject(error);
        }
    });
}

// Get entries with filters - USER-SPECIFIC
function getEntriesWithFilters(filters = {}) {
    return new Promise((resolve, reject) => {
        if (!db || !db.objectStoreNames.contains("entries")) {
            reject(new Error("Database or entries store not found"));
            return;
        }
        
        if (!currentUserId) {
            reject(new Error("No user logged in"));
            return;
        }
        
        getAllEntries(entries => {
            let filtered = entries;
            
            // Apply filters
            if (filters.main) {
                filtered = filtered.filter(e => e.main === filters.main);
            }
            
            if (filters.sub) {
                filtered = filtered.filter(e => e.sub === filters.sub);
            }
            
            if (filters.type === "income") {
                filtered = filtered.filter(e => e.amount > 0);
            } else if (filters.type === "expense") {
                filtered = filtered.filter(e => e.amount < 0);
            }
            
            if (filters.fromDate) {
                const from = new Date(filters.fromDate);
                filtered = filtered.filter(e => {
                    const entryDate = new Date(e.date.split("-").reverse().join("-"));
                    return entryDate >= from;
                });
            }
            
            if (filters.toDate) {
                const to = new Date(filters.toDate + "T23:59:59");
                filtered = filtered.filter(e => {
                    const entryDate = new Date(e.date.split("-").reverse().join("-"));
                    return entryDate <= to;
                });
            }
            
            if (!filters.includeDeleted) {
                filtered = filtered.filter(e => e.syncRemarks !== "deleted");
            }
            
            resolve(filtered);
        });
    });
}

// Get entries needing sync - USER-SPECIFIC
function getEntriesNeedingSync() {
    return new Promise((resolve, reject) => {
        if (!db || !db.objectStoreNames.contains("entries")) {
            reject(new Error("Database or entries store not found"));
            return;
        }
        
        if (!currentUserId) {
            reject(new Error("No user logged in"));
            return;
        }
        
        getAllEntries(entries => {
            const needsSync = entries.filter(e => 
                !e.synced || (e.syncRemarks && e.syncRemarks !== "synced")
            );
            console.log(`🔄 Found ${needsSync.length} entries needing sync for user ${currentUserId}`);
            resolve(needsSync);
        });
    });
}

// Mark entries as synced - USER-SPECIFIC
function markAsSynced(entryIds) {
    return new Promise((resolve, reject) => {
        if (!db || !db.objectStoreNames.contains("entries")) {
            reject(new Error("Database or entries store not found"));
            return;
        }
        
        if (!currentUserId) {
            reject(new Error("No user logged in"));
            return;
        }
        
        try {
            const transaction = db.transaction(["entries"], "readwrite");
            const store = transaction.objectStore("entries");
            
            let updatedCount = 0;
            let errors = [];
            
            const processNext = (index) => {
                if (index >= entryIds.length) {
                    transaction.oncomplete = () => {
                        console.log(`✅ Marked ${updatedCount} entries as synced for user ${currentUserId}`);
                        resolve({ updatedCount, errors });
                    };
                    transaction.onerror = () => {
                        reject(transaction.error);
                    };
                    return;
                }
                
                const id = entryIds[index];
                const getRequest = store.get(id);
                
                getRequest.onsuccess = () => {
                    const entry = getRequest.result;
                    
                    // Verify entry belongs to current user
                    if (!entry || entry.userId !== currentUserId) {
                        errors.push({ id, error: "Entry not found or belongs to different user" });
                        processNext(index + 1);
                        return;
                    }
                    
                    entry.synced = true;
                    entry.syncRemarks = "synced";
                    entry.updated_at = new Date().toISOString();
                    
                    const updateRequest = store.put(entry);
                    updateRequest.onsuccess = () => {
                        updatedCount++;
                        processNext(index + 1);
                    };
                    updateRequest.onerror = () => {
                        errors.push({ id, error: updateRequest.error });
                        processNext(index + 1);
                    };
                };
                
                getRequest.onerror = () => {
                    errors.push({ id, error: getRequest.error });
                    processNext(index + 1);
                };
            };
            
            processNext(0);
        } catch (error) {
            reject(error);
        }
    });
}

// Get database statistics - USER-SPECIFIC
function getDatabaseStats() {
    return new Promise((resolve, reject) => {
        if (!db || !db.objectStoreNames.contains("entries")) {
            resolve({
                userId: currentUserId,
                totalEntries: 0,
                activeEntries: 0,
                deletedEntries: 0,
                pendingSync: 0,
                totalIncome: 0,
                totalExpense: 0,
                categories: {},
                syncStatus: {
                    synced: 0,
                    new: 0,
                    edited: 0,
                    deleted: 0
                }
            });
            return;
        }
        
        getAllEntries(entries => {
            const activeEntries = entries.filter(e => e.syncRemarks !== "deleted");
            const deletedEntries = entries.filter(e => e.syncRemarks === "deleted");
            const needsSync = entries.filter(e => !e.synced || (e.syncRemarks && e.syncRemarks !== "synced"));
            
            const stats = {
                userId: currentUserId,
                totalEntries: entries.length,
                activeEntries: activeEntries.length,
                deletedEntries: deletedEntries.length,
                pendingSync: needsSync.length,
                totalIncome: activeEntries.filter(e => e.amount > 0).reduce((sum, e) => sum + e.amount, 0),
                totalExpense: Math.abs(activeEntries.filter(e => e.amount < 0).reduce((sum, e) => sum + e.amount, 0)),
                categories: {},
                syncStatus: {
                    synced: entries.filter(e => e.synced && e.syncRemarks === "synced").length,
                    new: entries.filter(e => e.syncRemarks === "new").length,
                    edited: entries.filter(e => e.syncRemarks === "edited").length,
                    deleted: deletedEntries.length
                }
            };
            
            activeEntries.forEach(e => {
                stats.categories[e.main] = (stats.categories[e.main] || 0) + 1;
            });
            
            resolve(stats);
        });
    });
}

// Clear all entries - USER-SPECIFIC
function clearAllEntries() {
    return new Promise((resolve, reject) => {
        if (!db || !db.objectStoreNames.contains("entries")) {
            reject(new Error("Database or entries store not found"));
            return;
        }
        
        if (!currentUserId) {
            reject(new Error("No user logged in"));
            return;
        }
        
        if (!confirm("This will delete ALL entries for current user. Are you sure?")) {
            reject(new Error("Operation cancelled"));
            return;
        }
        
        // Get all entries for current user first
        getAllEntries(entries => {
            const userEntryIds = entries.map(e => e.id);
            
            try {
                const transaction = db.transaction(["entries"], "readwrite");
                const store = transaction.objectStore("entries");
                
                let deletedCount = 0;
                let errors = [];
                
                const processNext = (index) => {
                    if (index >= userEntryIds.length) {
                        transaction.oncomplete = () => {
                            console.log(`🗑️ Cleared ${deletedCount} entries for user ${currentUserId}`);
                            resolve({ deletedCount });
                        };
                        transaction.onerror = () => {
                            reject(transaction.error);
                        };
                        return;
                    }
                    
                    const id = userEntryIds[index];
                    const request = store.delete(id);
                    
                    request.onsuccess = () => {
                        deletedCount++;
                        processNext(index + 1);
                    };
                    
                    request.onerror = () => {
                        errors.push({ id, error: request.error });
                        processNext(index + 1);
                    };
                };
                
                processNext(0);
            } catch (error) {
                reject(error);
            }
        });
    });
}

// Export database - USER-SPECIFIC
function exportDatabase() {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error("Database not initialized"));
            return;
        }
        
        if (!currentUserId) {
            reject(new Error("No user logged in"));
            return;
        }
        
        getAllEntries(entries => {
            const exportData = {
                version: "2.0",
                userId: currentUserId,
                exported_at: new Date().toISOString(),
                entries: entries,
                settings: {}
            };
            
            resolve(exportData);
        });
    });
}

// Close database
function closeDatabase() {
    if (db) {
        db.close();
        console.log("🔒 Database closed for user:", currentUserId);
        db = null;
        currentUserId = null;
    }
}

// Initialize database for current user
async function initDatabaseForUser(userId) {
    if (!userId) {
        throw new Error("User ID required to initialize database");
    }
    
    console.log("🚀 Initializing database for user:", userId);
    
    // Set current user ID
    setCurrentUserId(userId);
    
    // Open user-specific database
    try {
        await openUserDatabase();
        console.log("✅ Database initialized successfully for user:", userId);
        return db;
    } catch (error) {
        console.error("❌ Failed to initialize database:", error);
        throw error;
    }
}

// Get user-specific heads from IndexedDB
async function getUserHeads() {
    if (!db || !db.objectStoreNames.contains("userSettings")) return {};
    
    try {
        const settings = await loadUserSettings();
        return settings && settings.heads ? settings.heads : {};
    } catch (error) {
        console.error("❌ Error loading user heads:", error);
        return {};
    }
}

// Save user-specific heads to IndexedDB
async function saveUserHeads(headsData) {
    if (!db || !db.objectStoreNames.contains("userSettings")) return;
    
    try {
        await saveUserSettings("heads", headsData);
        console.log("✅ User heads saved for:", currentUserId);
    } catch (error) {
        console.error("❌ Error saving user heads:", error);
    }
}

// Export database functions
window.dbAPI = {
    setCurrentUserId,
    initDatabaseForUser,
    openUserDatabase,
    saveEntry,
    getAllEntries,
    getEntryById,
    getEntriesWithFilters,
    getEntriesNeedingSync,
    markAsSynced,
    getDatabaseStats,
    clearAllEntries,
    exportDatabase,
    closeDatabase,
    saveUserSettings,
    loadUserSettings,
    getUserHeads,
    saveUserHeads
};

console.log("✅ db.js loaded - COMPLETE USER ISOLATION");
console.log("📁 Available methods:", Object.keys(window.dbAPI).join(", "));
