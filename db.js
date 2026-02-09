// db.js - IndexedDB for Accounts Diary WITH USER ISOLATION - FIXED VERSION
let db;
let currentUserId = null;

// Set current user ID for database operations
function setCurrentUserId(userId) {
    currentUserId = userId;
    console.log("DB: Current user ID set to:", currentUserId);
}

// Open or create IndexedDB database - NOW USER-SPECIFIC
function openUserDatabase() {
    if (!currentUserId) {
        console.error("No user ID provided for database");
        return Promise.reject(new Error("User not logged in"));
    }
    
    // Create user-specific database name
    const dbName = `AccountsDiaryDB_${currentUserId}`;
    console.log("Opening database for user:", dbName);
    
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName, 5); // Version 5 (incremented to force upgrade)
        
        req.onupgradeneeded = e => {
            db = e.target.result;
            console.log("Upgrading database to version:", e.newVersion, "Old version:", e.oldVersion);
            
            // Clean up existing stores if they exist
            if (e.oldVersion > 0) {
                if (db.objectStoreNames.contains("entries")) {
                    db.deleteObjectStore("entries");
                }
                if (db.objectStoreNames.contains("syncMeta")) {
                    db.deleteObjectStore("syncMeta");
                }
                if (db.objectStoreNames.contains("userSettings")) {
                    db.deleteObjectStore("userSettings");
                }
            }
            
            // Create entries store with all indexes
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
            db.createObjectStore("syncMeta", { keyPath: "key" });
            db.createObjectStore("userSettings", { keyPath: "key" });
            
            console.log("✅ Object stores created successfully");
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
    
    // Check if we can access the entries store
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
        throw error;
    }
    
    // Migrate old shared data to this user's database (if needed)
    await migrateOldDataToUser();
    
    // Load user settings
    await loadUserSettings();
}

// Migrate old shared data to user-specific database
async function migrateOldDataToUser() {
    try {
        console.log("🔄 Checking for old shared database to migrate...");
        
        // Check if old shared database exists
        const oldDbName = "AccountsDiaryDB";
        return new Promise((resolve) => {
            const req = indexedDB.open(oldDbName, 3);
            
            req.onsuccess = e => {
                const oldDb = e.target.result;
                
                // Get all entries from old database
                const transaction = oldDb.transaction(["entries"], "readonly");
                const store = transaction.objectStore("entries");
                const request = store.getAll();
                
                request.onsuccess = async () => {
                    const oldEntries = request.result || [];
                    
                    // Filter entries that belong to this user OR have no userId
                    const userEntries = oldEntries.filter(entry => 
                        !entry.userId || entry.userId === currentUserId
                    );
                    
                    console.log(`🔄 Found ${userEntries.length} entries to migrate for user ${currentUserId}`);
                    
                    // Transfer entries to new user database
                    let migratedCount = 0;
                    for (const entry of userEntries) {
                        try {
                            // Ensure entry has userId
                            entry.userId = currentUserId;
                            await saveEntry(entry);
                            migratedCount++;
                        } catch (error) {
                            console.error("❌ Error migrating entry:", entry.id, error);
                        }
                    }
                    
                    oldDb.close();
                    
                    console.log(`✅ Migrated ${migratedCount}/${userEntries.length} entries`);
                    
                    // Try to delete old database after migration
                    setTimeout(() => {
                        indexedDB.deleteDatabase(oldDbName);
                        console.log("🗑️ Old shared database deleted after migration");
                    }, 1000);
                    
                    resolve();
                };
                
                request.onerror = () => {
                    oldDb.close();
                    console.log("ℹ️ No old entries to migrate");
                    resolve();
                };
            };
            
            req.onerror = () => {
                console.log("ℹ️ Old shared database doesn't exist, no migration needed");
                resolve();
            };
        });
    } catch (error) {
        console.error("❌ Error migrating old data:", error);
    }
}

// Load user settings
async function loadUserSettings() {
    if (!db) return null;
    
    try {
        const transaction = db.transaction(["userSettings"], "readonly");
        const store = transaction.objectStore("userSettings");
        const request = store.get("heads");
        
        return new Promise((resolve) => {
            request.onsuccess = () => {
                const settings = request.result;
                if (settings) {
                    console.log("✅ Loaded user settings");
                }
                resolve(settings ? settings.value : null);
            };
            
            request.onerror = () => {
                console.log("ℹ️ No user settings found");
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
    if (!db) return;
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(["userSettings"], "readwrite");
        const store = transaction.objectStore("userSettings");
        const request = store.put({ key, value });
        
        request.onsuccess = () => {
            console.log(`✅ Settings saved: ${key}`);
            resolve();
        };
        
        request.onerror = () => {
            console.error(`❌ Failed to save settings: ${key}`, request.error);
            reject(request.error);
        };
    });
}

// Generate unique ID - NOW INCLUDES USER ID
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
        
        const transaction = db.transaction(["entries"], "readwrite");
        const store = transaction.objectStore("entries");
        const request = store.put(completeEntry);
        
        request.onsuccess = () => {
            console.log("✅ Entry saved for user:", currentUserId, "Entry ID:", completeEntry.id);
            resolve(completeEntry);
        };
        
        request.onerror = () => {
            console.error("❌ Failed to save entry:", request.error);
            reject(request.error);
        };
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
    
    const transaction = db.transaction(["entries"], "readonly");
    const store = transaction.objectStore("entries");
    
    // Use index on userId to get only this user's entries
    if (store.indexNames.contains("userId")) {
        const index = store.index("userId");
        const request = index.getAll(currentUserId);
        
        request.onsuccess = () => {
            const userEntries = request.result || [];
            console.log(`📊 Retrieved ${userEntries.length} entries for user: ${currentUserId}`);
            callback(userEntries);
        };
        
        request.onerror = () => {
            console.error("❌ Failed to get user entries via index:", request.error);
            // Fallback to getAll if index fails
            const allRequest = store.getAll();
            allRequest.onsuccess = () => {
                const allEntries = allRequest.result || [];
                const userEntries = allEntries.filter(e => e.userId === currentUserId);
                console.log(`📊 Retrieved ${userEntries.length} entries via fallback for user: ${currentUserId}`);
                callback(userEntries);
            };
            allRequest.onerror = () => {
                console.error("❌ Failed to get entries via fallback:", allRequest.error);
                callback([]);
            };
        };
    } else {
        // Fallback if index doesn't exist
        const request = store.getAll();
        request.onsuccess = () => {
            const allEntries = request.result || [];
            const userEntries = allEntries.filter(e => e.userId === currentUserId);
            console.log(`📊 Retrieved ${userEntries.length} entries via filter for user: ${currentUserId}`);
            callback(userEntries);
        };
        request.onerror = () => {
            console.error("❌ Failed to get entries:", request.error);
            callback([]);
        };
    }
}

// Get entry by ID - VERIFIES USER OWNERSHIP
function getEntryById(id) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error("Database not initialized"));
            return;
        }
        
        if (!currentUserId) {
            reject(new Error("No user logged in"));
            return;
        }
        
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
    });
}

// Get entries with filters - USER-SPECIFIC
function getEntriesWithFilters(filters = {}) {
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
        if (!db) {
            reject(new Error("Database not initialized"));
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
        if (!db) {
            reject(new Error("Database not initialized"));
            return;
        }
        
        if (!currentUserId) {
            reject(new Error("No user logged in"));
            return;
        }
        
        const transaction = db.transaction(["entries"], "readwrite");
        const store = transaction.objectStore("entries");
        
        let updatedCount = 0;
        let errors = [];
        
        const processNext = (index) => {
            if (index >= entryIds.length) {
                transaction.oncomplete = () => {
                    console.log(`✅ Marked ${updatedCount} entries as synced`);
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
    });
}

// Get database stats - USER-SPECIFIC
function getDatabaseStats() {
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
        if (!db) {
            reject(new Error("Database not initialized"));
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
        
        const transaction = db.transaction(["entries"], "readwrite");
        const store = transaction.objectStore("entries");
        
        // Try to use userId index first
        if (store.indexNames.contains("userId")) {
            const index = store.index("userId");
            const request = index.openKeyCursor(currentUserId);
            
            let deletedCount = 0;
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    store.delete(cursor.primaryKey);
                    deletedCount++;
                    cursor.continue();
                } else {
                    console.log(`🗑️ Deleted ${deletedCount} entries for user ${currentUserId}`);
                    resolve({ deletedCount });
                }
            };
            
            request.onerror = () => {
                console.error("Failed to clear entries via index:", request.error);
                // Fallback to manual deletion
                fallbackClear(store, resolve, reject);
            };
        } else {
            fallbackClear(store, resolve, reject);
        }
        
        function fallbackClear(store, resolve, reject) {
            const request = store.openCursor();
            let deletedCount = 0;
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const entry = cursor.value;
                    if (entry.userId === currentUserId) {
                        cursor.delete();
                        deletedCount++;
                    }
                    cursor.continue();
                } else {
                    console.log(`🗑️ Deleted ${deletedCount} entries for user ${currentUserId} (fallback)`);
                    resolve({ deletedCount });
                }
            };
            
            request.onerror = () => {
                console.error("Failed to clear entries:", request.error);
                reject(request.error);
            };
        }
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
            // Get user settings
            const transaction = db.transaction(["userSettings"], "readonly");
            const store = transaction.objectStore("userSettings");
            const request = store.getAll();
            
            request.onsuccess = () => {
                const settings = request.result.reduce((acc, item) => {
                    acc[item.key] = item.value;
                    return acc;
                }, {});
                
                const exportData = {
                    version: "2.0",
                    userId: currentUserId,
                    exported_at: new Date().toISOString(),
                    entries: entries,
                    settings: settings
                };
                
                resolve(exportData);
            };
            
            request.onerror = () => {
                const exportData = {
                    version: "2.0",
                    userId: currentUserId,
                    exported_at: new Date().toISOString(),
                    entries: entries,
                    settings: {}
                };
                resolve(exportData);
            };
        });
    });
}

// Import database - USER-SPECIFIC
function importDatabase(jsonData) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error("Database not initialized"));
            return;
        }
        
        if (!currentUserId) {
            reject(new Error("No user logged in"));
            return;
        }
        
        if (!confirm("This will replace all current data for this user. Continue?")) {
            reject(new Error("Operation cancelled"));
            return;
        }
        
        // Clear existing entries for this user first
        clearAllEntries().then(async () => {
            // Now import new data
            if (!jsonData.entries || !Array.isArray(jsonData.entries)) {
                throw new Error("Invalid import data format");
            }
            
            let importedCount = 0;
            let errors = [];
            
            // Import entries
            for (const entry of jsonData.entries) {
                try {
                    // Ensure entry has current user ID
                    entry.userId = currentUserId;
                    await saveEntry(entry);
                    importedCount++;
                } catch (error) {
                    errors.push({ id: entry.id, error: error.message });
                }
            }
            
            // Import settings if available
            if (jsonData.settings) {
                for (const [key, value] of Object.entries(jsonData.settings)) {
                    try {
                        await saveUserSettings(key, value);
                    } catch (error) {
                        console.error("Error saving setting:", key, error);
                    }
                }
            }
            
            resolve({ importedCount, errors });
        }).catch(reject);
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

// Delete user database (on logout or account deletion)
function deleteUserDatabase(userId) {
    return new Promise((resolve, reject) => {
        const dbName = `AccountsDiaryDB_${userId}`;
        const request = indexedDB.deleteDatabase(dbName);
        
        request.onsuccess = () => {
            console.log("🗑️ User database deleted:", dbName);
            resolve();
        };
        
        request.onerror = () => {
            console.error("❌ Failed to delete user database:", request.error);
            reject(request.error);
        };
        
        request.onblocked = () => {
            console.warn("⚠️ Database deletion blocked - might be in use");
            resolve(); // Still resolve, it will be deleted when not in use
        };
    });
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

// Log database status
function logDatabaseStatus() {
    if (!db) {
        console.log("❌ Database not initialized");
        return;
    }
    
    console.log("📊 Database status:", {
        name: db.name,
        version: db.version,
        objectStores: Array.from(db.objectStoreNames),
        userId: currentUserId
    });
}

// Test database connection
async function testDatabaseConnection() {
    if (!db) {
        return { success: false, message: "Database not initialized" };
    }
    
    try {
        // Try to access all object stores
        const stores = Array.from(db.objectStoreNames);
        const results = [];
        
        for (const storeName of stores) {
            try {
                const transaction = db.transaction([storeName], "readonly");
                const store = transaction.objectStore(storeName);
                const countRequest = store.count();
                
                await new Promise((resolve, reject) => {
                    countRequest.onsuccess = () => resolve();
                    countRequest.onerror = () => reject(countRequest.error);
                });
                
                results.push({ store: storeName, accessible: true });
            } catch (error) {
                results.push({ store: storeName, accessible: false, error: error.message });
            }
        }
        
        return {
            success: true,
            message: "Database connection test passed",
            stores: results,
            userId: currentUserId
        };
    } catch (error) {
        return {
            success: false,
            message: `Database test failed: ${error.message}`,
            userId: currentUserId
        };
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
    importDatabase,
    closeDatabase,
    deleteUserDatabase,
    logDatabaseStatus,
    saveUserSettings,
    loadUserSettings,
    testDatabaseConnection
};

console.log("✅ db.js loaded with USER ISOLATION support - FIXED VERSION");
console.log("📁 Available methods:", Object.keys(window.dbAPI).join(", "));
