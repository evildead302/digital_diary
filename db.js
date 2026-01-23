// db.js - IndexedDB for Accounts Diary WITH USER ISOLATION
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
        const req = indexedDB.open(dbName, 4); // Version 4 for user isolation
        
        req.onupgradeneeded = e => {
            db = e.target.result;
            console.log("Upgrading database to version:", e.newVersion);
            
            // Create object stores if they don't exist
            if (!db.objectStoreNames.contains("entries")) {
                const store = db.createObjectStore("entries", { keyPath: "id" });
                
                store.createIndex("date", "date", { unique: false });
                store.createIndex("main", "main", { unique: false });
                store.createIndex("sub", "sub", { unique: false });
                store.createIndex("amount", "amount", { unique: false });
                store.createIndex("synced", "synced", { unique: false });
                store.createIndex("syncRemarks", "syncRemarks", { unique: false });
                store.createIndex("userId", "userId", { unique: false }); // New index for user isolation
                store.createIndex("created_at", "created_at", { unique: false });
                store.createIndex("updated_at", "updated_at", { unique: false });
            }
            
            if (!db.objectStoreNames.contains("syncMeta")) {
                db.createObjectStore("syncMeta", { keyPath: "key" });
            }
            
            if (!db.objectStoreNames.contains("userSettings")) {
                db.createObjectStore("userSettings", { keyPath: "key" });
            }
        };
        
        req.onsuccess = e => {
            db = e.target.result;
            console.log("User database opened successfully for:", currentUserId);
            
            // Initialize with user's data
            initializeUserData().then(() => {
                resolve(db);
            }).catch(error => {
                console.error("Error initializing user data:", error);
                resolve(db); // Still resolve even if initialization fails
            });
        };
        
        req.onerror = e => {
            console.error("Failed to open user database:", e.target.error);
            reject(e.target.error);
        };
    });
}

// Initialize user-specific data
async function initializeUserData() {
    if (!db || !currentUserId) return;
    
    // Migrate old shared data to this user's database (if needed)
    await migrateOldDataToUser();
    
    // Load user settings
    await loadUserSettings();
}

// Migrate old shared data to user-specific database
async function migrateOldDataToUser() {
    try {
        // Check if old shared database exists
        const oldDbName = "AccountsDiaryDB";
        const req = indexedDB.open(oldDbName, 3);
        
        return new Promise((resolve) => {
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
                    
                    console.log(`Found ${userEntries.length} entries to migrate for user ${currentUserId}`);
                    
                    // Transfer entries to new user database
                    for (const entry of userEntries) {
                        // Ensure entry has userId
                        entry.userId = currentUserId;
                        await saveEntry(entry);
                    }
                    
                    oldDb.close();
                    
                    // Try to delete old database after migration
                    setTimeout(() => {
                        indexedDB.deleteDatabase(oldDbName);
                        console.log("Old shared database deleted after migration");
                    }, 1000);
                    
                    resolve();
                };
                
                request.onerror = () => {
                    oldDb.close();
                    resolve();
                };
            };
            
            req.onerror = () => {
                resolve(); // Old database doesn't exist
            };
        });
    } catch (error) {
        console.error("Error migrating old data:", error);
    }
}

// Load user settings
async function loadUserSettings() {
    if (!db) return;
    
    try {
        const transaction = db.transaction(["userSettings"], "readonly");
        const store = transaction.objectStore("userSettings");
        const request = store.get("heads");
        
        return new Promise((resolve) => {
            request.onsuccess = () => {
                const settings = request.result;
                if (settings) {
                    console.log("Loaded user settings");
                }
                resolve(settings ? settings.value : null);
            };
            
            request.onerror = () => {
                resolve(null);
            };
        });
    } catch (error) {
        console.error("Error loading user settings:", error);
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
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// Generate unique ID - NOW INCLUDES USER ID
function genID() {
    if (!currentUserId) {
        console.error("No current user ID for ID generation");
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
            console.log("Entry saved for user:", currentUserId, "Entry ID:", completeEntry.id);
            resolve(completeEntry);
        };
        
        request.onerror = () => {
            console.error("Failed to save entry:", request.error);
            reject(request.error);
        };
    });
}

// Get all entries - ONLY FOR CURRENT USER
function getAllEntries(callback) {
    if (!db) {
        console.error("Database not initialized");
        callback([]);
        return;
    }
    
    if (!currentUserId) {
        console.error("No user logged in");
        callback([]);
        return;
    }
    
    const transaction = db.transaction(["entries"], "readonly");
    const store = transaction.objectStore("entries");
    const index = store.index("userId");
    const request = index.getAll(currentUserId);
    
    request.onsuccess = () => {
        const userEntries = request.result || [];
        console.log(`Retrieved ${userEntries.length} entries for user: ${currentUserId}`);
        callback(userEntries);
    };
    
    request.onerror = () => {
        console.error("Failed to get user entries:", request.error);
        callback([]);
    };
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
                console.error("Entry belongs to different user:", entry.userId);
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
            console.log(`Found ${needsSync.length} entries needing sync for user ${currentUserId}`);
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
        const index = store.index("userId");
        const request = index.openCursor(currentUserId);
        
        let deletedCount = 0;
        
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                deletedCount++;
                cursor.continue();
            } else {
                console.log(`Deleted ${deletedCount} entries for user ${currentUserId}`);
                resolve({ deletedCount });
            }
        };
        
        request.onerror = () => {
            console.error("Failed to clear entries:", request.error);
            reject(request.error);
        };
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
        
        // Clear existing entries for this user
        const clearTransaction = db.transaction(["entries"], "readwrite");
        const clearStore = clearTransaction.objectStore("entries");
        const clearIndex = clearStore.index("userId");
        const clearRequest = clearIndex.openCursor(currentUserId);
        
        clearRequest.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            } else {
                // Clear done, now import new data
                importData(jsonData).then(resolve).catch(reject);
            }
        };
        
        clearRequest.onerror = () => {
            reject(clearRequest.error);
        };
    });
}

// Helper function to import data
async function importData(jsonData) {
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
    
    return { importedCount, errors };
}

// Close database
function closeDatabase() {
    if (db) {
        db.close();
        console.log("Database closed for user:", currentUserId);
        db = null;
    }
}

// Delete user database (on logout or account deletion)
function deleteUserDatabase(userId) {
    return new Promise((resolve, reject) => {
        const dbName = `AccountsDiaryDB_${userId}`;
        const request = indexedDB.deleteDatabase(dbName);
        
        request.onsuccess = () => {
            console.log("User database deleted:", dbName);
            resolve();
        };
        
        request.onerror = () => {
            console.error("Failed to delete user database:", request.error);
            reject(request.error);
        };
        
        request.onblocked = () => {
            console.warn("Database deletion blocked - might be in use");
            resolve(); // Still resolve, it will be deleted when not in use
        };
    });
}

// Initialize database for current user
async function initDatabaseForUser(userId) {
    if (!userId) {
        throw new Error("User ID required to initialize database");
    }
    
    // Set current user ID
    setCurrentUserId(userId);
    
    // Open user-specific database
    await openUserDatabase();
    
    return db;
}

// Log database status
function logDatabaseStatus() {
    if (!db) {
        console.log("Database not initialized");
        return;
    }
    
    console.log("Database status:", {
        name: db.name,
        version: db.version,
        objectStores: Array.from(db.objectStoreNames),
        userId: currentUserId
    });
}

// Export database functions
window.dbAPI = {
    setCurrentUserId,
    initDatabaseForUser,
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
    loadUserSettings
};

console.log("✅ db.js loaded with USER ISOLATION support");
