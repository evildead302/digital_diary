// app.js - Complete Fixed Version with All Issues Resolved

// ==================== GLOBAL VARIABLES ====================
const pages = document.querySelectorAll(".page");
let heads = JSON.parse(localStorage.getItem("heads")) || {};
let tempEntries = [];
let isEditing = false;
let editingEntryId = null;
let authToken = localStorage.getItem("auth_token");
let currentUser = JSON.parse(localStorage.getItem("auth_user") || "null");

// ==================== AUTHENTICATION ====================
function checkAuth() {
  console.log('Checking auth...', { authToken, currentUser });
  
  if (authToken && currentUser) {
    document.getElementById("authScreen").style.display = "none";
    document.getElementById("appScreen").style.display = "block";
    document.getElementById("userName").textContent = currentUser.email;
    document.getElementById("settingsUserEmail").textContent = currentUser.email;
    initApp();
  } else {
    document.getElementById("authScreen").style.display = "block";
    document.getElementById("appScreen").style.display = "none";
  }
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
  
  console.log("Attempting login for:", email);
  
  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ email, password })
    });
    
    console.log("Response status:", response.status);
    
    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      console.error("Failed to parse response:", parseError);
      throw new Error(`Server returned invalid JSON (status: ${response.status})`);
    }
    
    console.log("Response data:", data);
    
    if (data.success) {
      authToken = data.token;
      currentUser = data.user;
      localStorage.setItem("auth_token", data.token);
      localStorage.setItem("auth_user", JSON.stringify(data.user));
      
      // Load data from Neon after successful login
      await loadDataFromCloudOnLogin();
      
      checkAuth();
    } else {
      errorEl.textContent = data.message || "Login failed. Please check your credentials.";
    }
  } catch (error) {
    console.error("Login error:", error);
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
  
  console.log("Attempting registration for:", email);
  
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
    
    console.log("Response status:", response.status);
    
    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      console.error("Failed to parse response:", parseError);
      throw new Error(`Server returned invalid JSON (status: ${response.status})`);
    }
    
    console.log("Registration response:", data);
    
    if (data.success) {
      authToken = data.token;
      currentUser = data.user;
      localStorage.setItem("auth_token", data.token);
      localStorage.setItem("auth_user", JSON.stringify(data.user));
      
      checkAuth();
    } else {
      errorEl.textContent = data.message || "Registration failed. User may already exist.";
    }
  } catch (error) {
    console.error("Registration error:", error);
    errorEl.textContent = `Registration failed: ${error.message}`;
  }
}

function logout() {
  if (confirm("Are you sure you want to logout?")) {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    authToken = null;
    currentUser = null;
    checkAuth();
  }
}

// ==================== INITIALIZATION ====================
function initApp() {
  console.log("Initializing app for user:", currentUser.email);
  
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
  console.log("Testing API connection...");
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    console.log("API Health status:", data);
    
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
    console.error("API test failed:", error);
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
    tableContainer.style.border = "1px solid #e0e0e0";
    tableContainer.style.borderRadius = "8px";
    
    const table = document.createElement("table");
    table.className = "fixed-table";
    table.style.width = "100%";
    table.style.minWidth = "800px";
    table.style.borderCollapse = "collapse";
    
    // Create table header
    const thead = document.createElement("thead");
    thead.style.position = "sticky";
    thead.style.top = "0";
    thead.style.zIndex = "10";
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
    
    // Style header cells
    const headerCells = thead.querySelectorAll("th");
    headerCells.forEach(cell => {
      cell.style.backgroundColor = "#4a6fa5";
      cell.style.color = "white";
      cell.style.padding = "14px 12px";
      cell.style.textAlign = "left";
      cell.style.fontWeight = "600";
      cell.style.fontSize = "0.9em";
      cell.style.textTransform = "uppercase";
      cell.style.letterSpacing = "0.5px";
      cell.style.borderBottom = "3px solid #2d4468";
      cell.style.position = "sticky";
      cell.style.top = "0";
    });
    
    table.appendChild(thead);
    
    // Create table body
    const tbody = document.createElement("tbody");
    
    tempEntries.forEach((entry, index) => {
      const row = document.createElement("tr");
      row.style.borderLeft = entry.amount < 0 ? "4px solid #f44336" : "4px solid #4caf50";
      row.style.transition = "all 0.25s ease";
      
      row.innerHTML = `
        <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 110px;">${entry.date}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 130px;">${entry.main}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 130px;">${entry.sub}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 180px; max-width: 350px; word-wrap: break-word; white-space: normal; line-height: 1.5;">${entry.desc}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 130px; text-align: right; font-weight: 700; font-size: 1.05em; color: ${entry.amount < 0 ? "#c62828" : "#2e7d32"}">
          ${entry.amount < 0 ? "-" : "+"}PKR ${Math.abs(entry.amount).toFixed(2)}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 110px; text-align: center;">
          <button onclick="editTemp(${index})" class="small-btn edit-btn">✏️</button>
          <button onclick="deleteTemp(${index})" class="small-btn danger-btn">🗑️</button>
        </td>
      `;
      
      // Alternate row colors
      row.style.backgroundColor = index % 2 === 0 ? "#f8fafc" : "#ffffff";
      
      // Hover effects
      row.addEventListener("mouseenter", () => {
        row.style.backgroundColor = entry.amount < 0 ? "#ffebee" : "#f1f8e9";
        row.style.transform = "translateX(2px)";
      });
      
      row.addEventListener("mouseleave", () => {
        row.style.backgroundColor = index % 2 === 0 ? "#f8fafc" : "#ffffff";
        row.style.transform = "translateX(0)";
      });
      
      tbody.appendChild(row);
    });
    
    table.appendChild(tbody);
    tableContainer.appendChild(table);
    tempList.appendChild(tableContainer);
    
  } catch (error) {
    console.error("Error in renderTemp:", error);
    const tempList = document.getElementById("tempList");
    if (tempList) {
      tempList.innerHTML = '<div class="no-entries" style="color: #f44336;">Error displaying temporary entries</div>';
    }
  }
}

// ==================== SYNC FROM CLOUD ====================
async function syncFromCloud() {
  if (!authToken) {
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
      console.log(`Found ${data.expenses.length} expenses in cloud`);
      
      // Get all local entries including deleted ones
      const allLocalEntries = await new Promise(resolve => {
        getAllEntries(resolve);
      });
      
      // Create a map of local entries by ID
      const localEntriesMap = new Map();
      allLocalEntries.forEach(entry => {
        localEntriesMap.set(entry.id, entry);
      });
      
      let importedCount = 0;
      let updatedCount = 0;
      let skippedDeletedCount = 0;
      
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
          
          const localEntry = localEntriesMap.get(expense.id);
          
          if (localEntry) {
            // If local entry is marked as deleted, skip updating it
            if (localEntry.syncRemarks === "deleted") {
              console.log(`Skipping deleted entry: ${expense.id}`);
              skippedDeletedCount++;
              continue;
            }
            
            // Update existing entry
            await saveEntry(entryData);
            updatedCount++;
          } else {
            // Insert new entry
            await saveEntry(entryData);
            importedCount++;
          }
        } catch (saveError) {
          console.error("Error saving expense:", saveError);
        }
      }
      
      // Check for entries that exist in cloud but not locally (to handle deletions)
      const cloudEntryIds = new Set(data.expenses.map(e => e.id));
      let deletedFromCloudCount = 0;
      
      for (const localEntry of allLocalEntries) {
        // Only process entries that were previously synced
        if (localEntry.synced && localEntry.syncRemarks !== "deleted") {
          if (!cloudEntryIds.has(localEntry.id)) {
            // Entry exists locally but not in cloud - mark as deleted
            localEntry.syncRemarks = "deleted";
            localEntry.synced = false;
            await saveEntry(localEntry);
            deletedFromCloudCount++;
          }
        }
      }
      
      console.log(`Sync from cloud complete: ${importedCount} imported, ${updatedCount} updated, ${skippedDeletedCount} skipped (deleted locally), ${deletedFromCloudCount} marked as deleted`);
      
      let message = `✅ Sync FROM Cloud Complete!\n`;
      if (importedCount > 0) message += `• ${importedCount} new entries imported\n`;
      if (updatedCount > 0) message += `• ${updatedCount} entries updated\n`;
      if (skippedDeletedCount > 0) message += `• ${skippedDeletedCount} entries skipped (deleted locally)\n`;
      if (deletedFromCloudCount > 0) message += `• ${deletedFromCloudCount} entries marked as deleted (removed from cloud)`;
      
      alert(message);
      
      // Refresh UI
      loadSaved();
      calcTotal();
      updateSyncStatus();
      
    } else {
      alert("✅ No data found in cloud or cloud is empty.");
    }
    
  } catch (error) {
    console.error("Sync from cloud error:", error);
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
  if (!authToken) {
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
    // Get unsynced entries
    const unsyncedEntries = await getEntriesNeedingSync();
    
    if (unsyncedEntries.length === 0) {
      alert("✅ All entries are already synced!");
      if (syncBtn) {
        syncBtn.textContent = originalText;
        syncBtn.disabled = false;
      }
      updateSyncStatus();
      return;
    }
    
    console.log(`Syncing ${unsyncedEntries.length} entries to cloud...`);
    
    // Separate deleted entries from others
    const deletedEntries = unsyncedEntries.filter(e => e.syncRemarks === "deleted");
    const otherEntries = unsyncedEntries.filter(e => e.syncRemarks !== "deleted");
    
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
      console.log("Regular sync response:", data);
      
      if (data.success) {
        // Handle partial successes
        if (data.errors && data.errors.length > 0) {
          syncErrors = data.errors;
          console.warn("Some entries failed to sync:", data.errors);
        }
        
        // Mark successful entries as synced
        if (data.successes && data.successes.length > 0) {
          const result = await markAsSynced(data.successes);
          console.log(`Marked ${result.updatedCount} entries as synced`);
        }
      } else {
        throw new Error(data.message || "Sync failed");
      }
    }
    
    // Handle deleted entries
    let deletedErrors = [];
    
    if (deletedEntries.length > 0) {
      console.log(`Deleting ${deletedEntries.length} entries from cloud...`);
      
      for (const deletedEntry of deletedEntries) {
        try {
          const deleteResponse = await fetch(`/api/expenses?id=${deletedEntry.id}`, {
            method: "DELETE",
            headers: {
              "Authorization": `Bearer ${authToken}`
            }
          });
          
          if (!deleteResponse.ok) {
            console.error(`Failed to delete entry ${deletedEntry.id} from cloud`);
            deletedErrors.push({ id: deletedEntry.id, error: "Failed to delete from cloud" });
          } else {
            console.log(`Successfully deleted entry ${deletedEntry.id} from cloud`);
            // Mark deleted entry as synced only after successful deletion
            await markAsSynced([deletedEntry.id]);
          }
        } catch (deleteError) {
          console.error(`Error deleting entry ${deletedEntry.id}:`, deleteError);
          deletedErrors.push({ id: deletedEntry.id, error: deleteError.message });
        }
      }
    }
    
    // Show appropriate message based on results
    const totalErrors = syncErrors.length + deletedErrors.length;
    
    if (totalErrors === 0) {
      alert(`✅ Sync TO Cloud Complete!\n• ${otherEntries.length} entries synced\n• ${deletedEntries.length} entries deleted from cloud`);
    } else {
      let errorMessage = `⚠️ Sync TO Cloud Partial Success\n`;
      if (otherEntries.length > 0) errorMessage += `• ${otherEntries.length - syncErrors.length}/${otherEntries.length} entries synced\n`;
      if (deletedEntries.length > 0) errorMessage += `• ${deletedEntries.length - deletedErrors.length}/${deletedEntries.length} entries deleted\n`;
      errorMessage += `\n❌ ${totalErrors} errors occurred.`;
      
      if (syncErrors.length > 0) {
        errorMessage += `\n\nSync errors:\n${syncErrors.map(e => `  • Entry ${e.id}: ${e.error}`).join('\n')}`;
      }
      if (deletedErrors.length > 0) {
        errorMessage += `\n\nDelete errors:\n${deletedErrors.map(e => `  • Entry ${e.id}: ${e.error}`).join('\n')}`;
      }
      
      alert(errorMessage);
    }
    
    // Refresh UI
    calcTotal();
    loadSaved();
    updateSyncStatus();
    
  } catch (error) {
    console.error("Sync error:", error);
    alert(`❌ Sync TO Cloud failed: ${error.message}\n\nEntries will retry on next sync.`);
  } finally {
    if (syncBtn) {
      syncBtn.textContent = originalText;
      syncBtn.disabled = false;
    }
  }
}

// ==================== HELPER FUNCTIONS ====================
async function getEntriesNeedingSync() {
  return new Promise(resolve => {
    getAllEntries(entries => {
      const unsynced = entries.filter(e => 
        !e.synced || (e.syncRemarks && e.syncRemarks !== 'synced')
      );
      resolve(unsynced);
    });
  });
}

async function markAsSynced(entryIds) {
  return new Promise((resolve, reject) => {
    getAllEntries(async (entries) => {
      let updatedCount = 0;
      for (const id of entryIds) {
        const entry = entries.find(e => e.id === id);
        if (entry) {
          entry.synced = true;
          entry.syncRemarks = 'synced';
          await saveEntry(entry);
          updatedCount++;
        }
      }
      resolve({ updatedCount });
    });
  });
}

function genID(timestamp) {
  return 'id_' + timestamp + '_' + Math.random().toString(36).substr(2, 9);
}

// ==================== LOAD DATA FROM CLOUD ON LOGIN ====================
async function loadDataFromCloudOnLogin() {
  console.log("Loading data from cloud on login...");
  
  try {
    const response = await fetch("/api/expenses", {
      headers: {
        "Authorization": `Bearer ${authToken}`
      }
    });
    
    if (!response.ok) {
      console.log("No data in cloud or error loading");
      return [];
    }
    
    const data = await response.json();
    
    if (data.success && data.expenses && data.expenses.length > 0) {
      console.log(`Found ${data.expenses.length} expenses in cloud`);
      
      // Get existing local entries
      const existingEntries = await new Promise(resolve => {
        getAllEntries(resolve);
      });
      
      const existingIds = new Set(existingEntries.map(e => e.id));
      let importedCount = 0;
      let updatedCount = 0;
      let skippedDeletedCount = 0;
      
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
          
          if (existingIds.has(expense.id)) {
            // Check if existing entry is marked as deleted
            const existingEntry = existingEntries.find(e => e.id === expense.id);
            if (existingEntry && existingEntry.syncRemarks === "deleted") {
              console.log(`Skipping deleted entry on login: ${expense.id}`);
              skippedDeletedCount++;
              continue;
            }
            
            // Update existing
            await saveEntry(entryData);
            updatedCount++;
          } else {
            // Insert new
            await saveEntry(entryData);
            importedCount++;
          }
        } catch (saveError) {
          console.error("Error saving expense:", saveError);
        }
      }
      
      console.log(`Login sync: ${importedCount} new, ${updatedCount} updated, ${skippedDeletedCount} skipped`);
      
      if (importedCount > 0) {
        alert(`✅ Loaded ${importedCount} new entries from cloud`);
      }
      
      return data.expenses;
    } else {
      console.log("No expenses found in cloud response");
      return [];
    }
  } catch (error) {
    console.error("Error loading from cloud:", error);
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
  getAllEntries(entries => {
    const activeEntries = entries.filter(e => e.syncRemarks !== "deleted");
    
    let csv = "ID,Date,Description,Main Category,Sub Category,Amount,Type,Sync Status\n";
    activeEntries.forEach(e => {
      const type = e.amount >= 0 ? "Income" : "Expense";
      const syncStatus = e.synced ? (e.syncRemarks === "edited" ? "Edited" : "Synced") : "Pending";
      csv += `"${e.id}","${e.date}","${e.desc}","${e.main}","${e.sub}",${e.amount},"${type}","${syncStatus}"\n`;
    });
    
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().split("T")[0];
    a.href = url;
    a.download = `accounts_diary_${date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    alert(`✅ Exported ${activeEntries.length} entries to CSV`);
  });
}

function importFromCSV(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    const csvData = e.target.result;
    const lines = csvData.split('\n');
    let imported = 0;
    let skipped = 0;
    
    // Skip header
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Parse CSV line (handle quoted values)
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
            id: genID(Date.now() + imported + skipped),
            date: parts[0],
            desc: parts[1],
            main: parts[2],
            sub: parts[3],
            amount: parseFloat(parts[4]),
            synced: false,
            syncRemarks: "new"
          };
          
          if (!isNaN(entry.amount)) {
            saveEntry(entry);
            imported++;
          } else {
            skipped++;
          }
        } catch (error) {
          console.error("Error parsing CSV row:", error);
          skipped++;
        }
      } else {
        skipped++;
      }
    }
    
    // Clear file input
    event.target.value = '';
    
    // Update UI
    setTimeout(() => {
      loadSaved();
      calcTotal();
      alert(`✅ Imported ${imported} entries, skipped ${skipped} invalid rows`);
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
    console.error("Error in showPage:", error);
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
  
  // CSV buttons are already in index.html, no need to add them here
}

// ==================== INITIALIZATION ON LOAD ====================
window.onload = function() {
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
    checkAuth();
    
  } catch (error) {
    console.error("Error in window.onload:", error);
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

// ==================== REST OF ORIGINAL FUNCTIONS ====================

// CATEGORY MANAGEMENT
function saveHeads() {
  localStorage.setItem("heads", JSON.stringify(heads));
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
    console.error("Error in renderHeads:", error);
  }
}

function updateAllDropdowns() {
  updateEntryDropdowns();
  updateLedgerCategories();
  updateSearchCategories();
}

// ENTRY PAGE
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
    console.error("Error in updateEntryDropdowns:", error);
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
    console.error("Error in updateEntrySubheads:", error);
  }
}

// DATE FUNCTIONS
function formatDate(v) {
  try {
    const d = new Date(v);
    return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth()+1).padStart(2, "0")}-${d.getFullYear()}`;
  } catch (error) {
    const today = new Date();
    return `${String(today.getDate()).padStart(2, "0")}-${String(today.getMonth()+1).padStart(2, "0")}-${today.getFullYear()}`;
  }
}

// TEMPORARY ENTRIES
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
    console.error("Error in addTemp:", error);
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
    console.error("Error in editTemp:", error);
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

// SAVE ALL ENTRIES
function saveAll() {
  try {
    if (tempEntries.length === 0 && !isEditing) {
      alert("No entries to save");
      return;
    }
    
    if (isEditing && editingEntryId) {
      getAllEntries(async d => {
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
            syncRemarks: existingEntry.synced ? "edited" : "new"
          };
          
          await saveEntry(editedEntry);
          
          cancelEdit();
          loadSaved();
          calcTotal();
          loadLedger();
          
          alert("✅ Entry updated successfully!");
        } catch (error) {
          console.error("Error saving edited entry:", error);
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
        e.id = genID(Date.now() + i);
        e.synced = false;
        e.syncRemarks = "new";
        savePromises.push(saveEntry(e));
      });
      
      Promise.all(savePromises).then(() => {
        tempEntries = [];
        renderTemp();
        
        loadSaved();
        calcTotal();
        
        alert(`✅ Successfully saved ${savePromises.length} entries!`);
      }).catch(error => {
        console.error("Error saving entries:", error);
        alert("Error saving entries: " + error.message);
      });
    }
  } catch (error) {
    console.error("Error in saveAll:", error);
    alert("Error saving entries: " + error.message);
  }
}

// SAVED ENTRIES MANAGEMENT
function loadSaved() {
  getAllEntries(d => {
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
      tableContainer.style.border = "1px solid #e0e0e0";
      tableContainer.style.borderRadius = "8px";
      
      const table = document.createElement("table");
      table.className = "fixed-table";
      table.style.width = "100%";
      table.style.minWidth = "800px";
      table.style.borderCollapse = "collapse";
      
      const thead = document.createElement("thead");
      thead.style.position = "sticky";
      thead.style.top = "0";
      thead.style.zIndex = "10";
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
      
      const headerCells = thead.querySelectorAll("th");
      headerCells.forEach(cell => {
        cell.style.backgroundColor = "#4a6fa5";
        cell.style.color = "white";
        cell.style.padding = "14px 12px";
        cell.style.textAlign = "left";
        cell.style.fontWeight = "600";
        cell.style.fontSize = "0.9em";
        cell.style.textTransform = "uppercase";
        cell.style.letterSpacing = "0.5px";
        cell.style.borderBottom = "3px solid #2d4468";
        cell.style.position = "sticky";
        cell.style.top = "0";
      });
      
      table.appendChild(thead);
      
      const tbody = document.createElement("tbody");
      
      recentEntries.forEach((e, i) => {
        const row = document.createElement("tr");
        row.style.borderLeft = e.amount < 0 ? "4px solid #f44336" : "4px solid #4caf50";
        row.style.transition = "all 0.25s ease";
        
        const syncStatus = e.synced ? 
          (e.syncRemarks === "edited" ? "✏️ Edited" : "✅ Synced") : 
          "🔄 Pending";
        
        row.innerHTML = `
          <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 110px;">${e.date}</td>
          <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 130px;">${e.main}</td>
          <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 130px;">${e.sub}</td>
          <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 180px; max-width: 350px; word-wrap: break-word; white-space: normal; line-height: 1.5;">${e.desc}</td>
          <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 130px; text-align: right; font-weight: 700; font-size: 1.05em; color: ${e.amount < 0 ? "#c62828" : "#2e7d32"}">
            ${e.amount < 0 ? "-" : "+"}PKR ${Math.abs(e.amount).toFixed(2)}
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 120px; text-align: center;">
            ${syncStatus}
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 110px; text-align: center;">
            <button onclick="editSavedEntry('${e.id}')" class="small-btn edit-btn">✏️</button>
            <button onclick="markEntryAsDeleted('${e.id}')" class="small-btn danger-btn">🗑️</button>
          </td>
        `;
        
        row.style.backgroundColor = i % 2 === 0 ? "#f8fafc" : "#ffffff";
        
        row.addEventListener("mouseenter", () => {
          row.style.backgroundColor = e.amount < 0 ? "#ffebee" : "#f1f8e9";
          row.style.transform = "translateX(2px)";
        });
        
        row.addEventListener("mouseleave", () => {
          row.style.backgroundColor = i % 2 === 0 ? "#f8fafc" : "#ffffff";
          row.style.transform = "translateX(0)";
        });
        
        tbody.appendChild(row);
      });
      
      table.appendChild(tbody);
      tableContainer.appendChild(table);
      savedEntryList.appendChild(tableContainer);
    } catch (error) {
      console.error("Error in loadSaved:", error);
      const savedEntryList = document.getElementById("savedEntryList");
      if (savedEntryList) {
        savedEntryList.innerHTML = '<div class="no-entries" style="color: #f44336;">Error loading saved entries</div>';
      }
    }
  });
}

function markEntryAsDeleted(id) {
  if (!confirm("Mark this entry as deleted? It will be removed from balance but kept in database.")) {
    return;
  }
  
  getAllEntries(async d => {
    try {
      const entry = d.find(x => x.id === id);
      if (!entry) return;
      
      entry.syncRemarks = "deleted";
      entry.synced = false;
      
      await saveEntry(entry);
      
      loadSaved();
      calcTotal();
      loadLedger();
      
      alert("✅ Entry marked as deleted.");
    } catch (error) {
      console.error("Error marking entry as deleted:", error);
      alert("Error marking entry as deleted: " + error.message);
    }
  });
}

function editSavedEntry(id) {
  try {
    isEditing = true;
    editingEntryId = id;
    
    getAllEntries(d => {
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
        console.error("Error in editSavedEntry:", error);
        alert("Error loading entry for editing: " + error.message);
      }
    });
  } catch (error) {
    console.error("Error in editSavedEntry:", error);
    alert("Error entering edit mode: " + error.message);
  }
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
    console.error("Error in resetEntryForm:", error);
  }
}

// BALANCE CALCULATION
function calcTotal() {
  getAllEntries(d => {
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
      console.error("Error in calcTotal:", error);
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
    console.error("Error in renderBalance:", error);
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
    tableContainer.style.border = "1px solid #e0e0e0";
    tableContainer.style.borderRadius = "8px";
    
    const table = document.createElement("table");
    table.className = "fixed-table";
    table.style.width = "100%";
    table.style.minWidth = "800px";
    table.style.borderCollapse = "collapse";
    
    const thead = document.createElement("thead");
    thead.style.position = "sticky";
    thead.style.top = "0";
    thead.style.zIndex = "10";
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
    
    const headerCells = thead.querySelectorAll("th");
    headerCells.forEach(cell => {
      cell.style.backgroundColor = "#4a6fa5";
      cell.style.color = "white";
      cell.style.padding = "14px 12px";
      cell.style.textAlign = "left";
      cell.style.fontWeight = "600";
      cell.style.fontSize = "0.9em";
      cell.style.textTransform = "uppercase";
      cell.style.letterSpacing = "0.5px";
      cell.style.borderBottom = "3px solid #2d4468";
      cell.style.position = "sticky";
      cell.style.top = "0";
    });
    
    table.appendChild(thead);
    
    const tbody = document.createElement("tbody");
    
    recent.forEach((e, i) => {
      const row = document.createElement("tr");
      row.style.borderLeft = e.amount < 0 ? "4px solid #f44336" : "4px solid #4caf50";
      row.style.transition = "all 0.25s ease";
      
      const syncIcon = e.synced ? "✅" : "🔄";
      
      row.innerHTML = `
        <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 110px;">${e.date}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 130px;">${e.main}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 130px;">${e.sub}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 180px; max-width: 350px; word-wrap: break-word; white-space: normal; line-height: 1.5;">${e.desc}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 130px; text-align: right; font-weight: 700; font-size: 1.05em; color: ${e.amount < 0 ? "#c62828" : "#2e7d32"}">
          ${e.amount < 0 ? "-" : "+"}PKR ${Math.abs(e.amount).toFixed(2)}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 80px; text-align: center;">
          ${syncIcon}
        </td>
      `;
      
      row.style.backgroundColor = i % 2 === 0 ? "#f8fafc" : "#ffffff";
      
      row.addEventListener("mouseenter", () => {
        row.style.backgroundColor = e.amount < 0 ? "#ffebee" : "#f1f8e9";
        row.style.transform = "translateX(2px)";
      });
      
      row.addEventListener("mouseleave", () => {
        row.style.backgroundColor = i % 2 === 0 ? "#f8fafc" : "#ffffff";
        row.style.transform = "translateX(0)";
      });
      
      tbody.appendChild(row);
    });
    
    table.appendChild(tbody);
    tableContainer.appendChild(table);
    recentEntries.appendChild(tableContainer);
  } catch (error) {
    console.error("Error in loadRecentEntries:", error);
    const recentEntries = document.getElementById("recentEntries");
    if (recentEntries) {
      recentEntries.innerHTML = '<div class="no-entries" style="color: #f44336;">Error loading recent entries</div>';
    }
  }
}

function loadHomeData() {
  calcTotal();
}

// SYNC STATUS
function updateSyncStatus(entries = null) {
  try {
    if (!entries) {
      getAllEntries(updateSyncStatus);
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
    console.error("Error in updateSyncStatus:", error);
  }
}

// LEDGER FUNCTIONS
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
    console.error("Error in updateLedgerCategories:", error);
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
    console.error("Error in updateLedgerSubheads:", error);
  }
}

function loadLedger() {
  getAllEntries(d => {
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
      
      const table = document.getElementById("ledgerTable");
      if (table) {
        const headerCells = table.querySelectorAll("thead th");
        headerCells.forEach(cell => {
          cell.style.backgroundColor = "#4a6fa5";
          cell.style.color = "white";
          cell.style.padding = "14px 12px";
          cell.style.textAlign = "left";
          cell.style.fontWeight = "600";
          cell.style.fontSize = "0.9em";
          cell.style.textTransform = "uppercase";
          cell.style.letterSpacing = "0.5px";
          cell.style.borderBottom = "3px solid #2d4468";
          cell.style.position = "sticky";
          cell.style.top = "0";
        });
      }
      
      filtered.forEach((e, i) => {
        const row = document.createElement("tr");
        row.style.borderLeft = e.amount < 0 ? "4px solid #f44336" : "4px solid #4caf50";
        row.style.transition = "all 0.25s ease";
        
        row.innerHTML = `
          <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 110px;">${e.date}</td>
          <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 180px; max-width: 350px; word-wrap: break-word; white-space: normal; line-height: 1.5;">${e.desc}</td>
          <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 130px;">${e.main}</td>
          <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 130px;">${e.sub}</td>
          <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 130px; text-align: right; font-weight: 700; font-size: 1.05em; color: ${e.amount >= 0 ? "#2e7d32" : "#c62828"}">
            ${e.amount >= 0 ? "+" : ""}PKR ${Math.abs(e.amount).toFixed(2)}
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 110px; text-align: center;">
            <button onclick="editSavedEntry('${e.id}')" class="small-btn edit-btn">✏️</button>
            <button onclick="markEntryAsDeleted('${e.id}')" class="small-btn danger-btn">🗑️</button>
          </td>
        `;
        
        row.style.backgroundColor = i % 2 === 0 ? "#f8fafc" : "#ffffff";
        
        row.addEventListener("mouseenter", () => {
          row.style.backgroundColor = e.amount < 0 ? "#ffebee" : "#f1f8e9";
          row.style.transform = "translateX(2px)";
        });
        
        row.addEventListener("mouseleave", () => {
          row.style.backgroundColor = i % 2 === 0 ? "#f8fafc" : "#ffffff";
          row.style.transform = "translateX(0)";
        });
        
        tbody.appendChild(row);
      });
    } catch (error) {
      console.error("Error in loadLedger:", error);
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
    console.error("Error in resetLedgerFilters:", error);
  }
}

function exportLedger() {
  getAllEntries(d => {
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
      console.error("Error in exportLedger:", error);
      alert("Error exporting ledger: " + error.message);
    }
  });
}

// SEARCH FUNCTIONS
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
    console.error("Error in updateSearchCategories:", error);
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
    
    getAllEntries(entries => {
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
        console.error("Error filtering search results:", error);
        alert("Error performing search: " + error.message);
      }
    });
  } catch (error) {
    console.error("Error in performSearch:", error);
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
    tableContainer.style.border = "1px solid #e0e0e0";
    tableContainer.style.borderRadius = "8px";
    
    const table = document.createElement("table");
    table.className = "fixed-table";
    table.style.width = "100%";
    table.style.minWidth = "800px";
    table.style.borderCollapse = "collapse";
    
    const thead = document.createElement("thead");
    thead.style.position = "sticky";
    thead.style.top = "0";
    thead.style.zIndex = "10";
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
    
    const headerCells = thead.querySelectorAll("th");
    headerCells.forEach(cell => {
      cell.style.backgroundColor = "#4a6fa5";
      cell.style.color = "white";
      cell.style.padding = "14px 12px";
      cell.style.textAlign = "left";
      cell.style.fontWeight = "600";
      cell.style.fontSize = "0.9em";
      cell.style.textTransform = "uppercase";
      cell.style.letterSpacing = "0.5px";
      cell.style.borderBottom = "3px solid #2d4468";
      cell.style.position = "sticky";
      cell.style.top = "0";
    });
    
    table.appendChild(thead);
    
    const tbody = document.createElement("tbody");
    
    results.forEach((entry, i) => {
      const row = document.createElement("tr");
      row.style.borderLeft = entry.amount < 0 ? "4px solid #f44336" : "4px solid #4caf50";
      row.style.transition = "all 0.25s ease";
      
      let description = entry.desc;
      if (searchTerm) {
        const regex = new RegExp(`(${searchTerm})`, "gi");
        description = description.replace(regex, "<mark>$1</mark>");
      }
      
      row.innerHTML = `
        <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 110px;">${entry.date}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 130px;">${entry.main}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 130px;">${entry.sub}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 180px; max-width: 350px; word-wrap: break-word; white-space: normal; line-height: 1.5;">${description}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 130px; text-align: right; font-weight: 700; font-size: 1.05em; color: ${entry.amount >= 0 ? "#2e7d32" : "#c62828"}">
          ${entry.amount >= 0 ? "+" : ""}PKR ${Math.abs(entry.amount).toFixed(2)}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 110px; text-align: center;">
          <button onclick="editSavedEntry('${entry.id}')" class="small-btn edit-btn">✏️</button>
          <button onclick="markEntryAsDeleted('${entry.id}')" class="small-btn danger-btn">🗑️</button>
        </td>
      `;
      
      row.style.backgroundColor = i % 2 === 0 ? "#f8fafc" : "#ffffff";
      
      row.addEventListener("mouseenter", () => {
        row.style.backgroundColor = entry.amount < 0 ? "#ffebee" : "#f1f8e9";
        row.style.transform = "translateX(2px)";
      });
      
      row.addEventListener("mouseleave", () => {
        row.style.backgroundColor = i % 2 === 0 ? "#f8fafc" : "#ffffff";
        row.style.transform = "translateX(0)";
      });
      
      tbody.appendChild(row);
    });
    
    table.appendChild(tbody);
    tableContainer.appendChild(table);
    resultsList.appendChild(tableContainer);
  } catch (error) {
    console.error("Error in displaySearchResults:", error);
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
    console.error("Error in clearSearch:", error);
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
    console.error("Error in quickSearch:", error);
  }
}

// CATEGORY CRUD
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
    console.error("Error in addMainHead:", error);
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
    console.error("Error in addSubHead:", error);
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
    console.error("Error in deleteMainHead:", error);
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
    console.error("Error in deleteSubHead:", error);
    alert("Error deleting sub category: " + error.message);
  }
}

console.log("✅ app.js COMPLETE loaded with all fixes");
