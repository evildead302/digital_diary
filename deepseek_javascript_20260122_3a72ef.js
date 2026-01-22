// app.js - Main Application with Neon Database & Authentication

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
                name: email.split("@")[0] // Create name from email
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

// Initialize app after login
function initApp() {
    console.log("Initializing app for user:", currentUser.email);
    
    // Initialize any app-specific functionality
    if (typeof calcTotal === "function") {
        calcTotal();
    }
    if (typeof loadSaved === "function") {
        loadSaved();
    }
    
    // Update sync status
    updateSyncStatus();
    
    // Test API connection
    testAPI();
}

// Test API connection
async function testAPI() {
    console.log("Testing API connection...");
    try {
        const response = await fetch("/api/health");
        const data = await response.json();
        console.log("API Health status:", data);
        return data.success;
    } catch (error) {
        console.error("API test failed:", error);
        return false;
    }
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
            page.classList.add("active");
            
            try {
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
                        updateSettingsUI();
                        break;
                }
            } catch (pageError) {
                console.error(`Error initializing page ${id}:`, pageError);
            }
        }
    } catch (error) {
        console.error("Error in showPage:", error);
        const homePage = document.getElementById("home");
        if (homePage) {
            pages.forEach(p => {
                p.classList.remove("active");
                p.style.display = "none";
            });
            homePage.style.display = "block";
            homePage.classList.add("active");
        }
    }
}

// Initialize with home page
showPage("home");

// ==================== CATEGORY MANAGEMENT ====================
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

// Initialize categories
renderHeads();

function updateAllDropdowns() {
    updateEntryDropdowns();
    updateLedgerCategories();
    updateSearchCategories();
}

// ==================== ENTRY PAGE FUNCTIONS ====================
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
        console.error("Error in addTemp:", error);
        alert("Error adding temporary entry: " + error.message);
    }
}

function renderTemp() {
    try {
        const tempList = document.getElementById("tempList");
        if (!tempList) return;
        
        tempList.innerHTML = "";
        
        if (tempEntries.length === 0) {
            tempList.innerHTML = '<div class="no-entries">No temporary entries</div>';
            return;
        }
        
        const tableContainer = document.createElement("div");
        tableContainer.className = "table-container scrollable-table";
        tableContainer.style.maxHeight = "400px";
        tableContainer.style.overflowY = "auto";
        tableContainer.style.overflowX = "auto";
        tableContainer.style.borderRadius = "8px";
        tableContainer.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
        
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
        
        tempEntries.forEach((e, i) => {
            const row = document.createElement("tr");
            row.style.borderLeft = e.amount < 0 ? "4px solid #f44336" : "4px solid #4caf50";
            row.style.transition = "all 0.25s ease";
            
            row.innerHTML = `
                <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 110px;">${e.date}</td>
                <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 130px;">${e.main}</td>
                <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 130px;">${e.sub}</td>
                <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 180px; max-width: 350px; word-wrap: break-word; white-space: normal; line-height: 1.5;">${e.desc}</td>
                <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 130px; text-align: right; font-weight: 700; font-size: 1.05em; color: ${e.amount < 0 ? "#c62828" : "#2e7d32"}">
                    ${e.amount < 0 ? "-" : "+"}PKR ${Math.abs(e.amount).toFixed(2)}
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #eaeaea; min-width: 110px; text-align: center;">
                    <button onclick="editTemp(${i})" class="small-btn edit-btn">✏️</button>
                    <button onclick="deleteTemp(${i})" class="small-btn danger-btn">🗑️</button>
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
        tempList.appendChild(tableContainer);
    } catch (error) {
        console.error("Error in renderTemp:", error);
        const tempList = document.getElementById("tempList");
        if (tempList) {
            tempList.innerHTML = '<div class="no-entries" style="color: #f44336;">Error displaying temporary entries</div>';
        }
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

// ==================== SAVE ALL ENTRIES ====================
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
            
            tempEntries.forEach((e, i) => {
                e.id = genID(i);
                e.synced = false;
                e.syncRemarks = "new";
                saveEntry(e);
            });
            
            tempEntries = [];
            renderTemp();
            
            loadSaved();
            calcTotal();
            
            alert(`✅ Successfully saved ${tempEntries.length} entries!`);
        }
    } catch (error) {
        console.error("Error in saveAll:", error);
        alert("Error saving entries: " + error.message);
    }
}

// ==================== SAVED ENTRIES MANAGEMENT ====================
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
            tableContainer.className = "table-container scrollable-table";
            tableContainer.style.maxHeight = "400px";
            tableContainer.style.overflowY = "auto";
            tableContainer.style.overflowX = "auto";
            tableContainer.style.borderRadius = "8px";
            tableContainer.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
            
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

// ==================== BALANCE CALCULATION ====================
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
        tableContainer.className = "table-container scrollable-table";
        tableContainer.style.maxHeight = "400px";
        tableContainer.style.overflowY = "auto";
        tableContainer.style.overflowX = "auto";
        tableContainer.style.borderRadius = "8px";
        tableContainer.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
        tableContainer.style.marginTop = "15px";
        
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

// ==================== SETTINGS PAGE ====================
function updateSettingsUI() {
    // Just update categories and user info
    renderHeads();
    
    // Show user info if available
    if (currentUser) {
        const userInfo = document.getElementById("userInfo");
        if (userInfo) {
            userInfo.innerHTML = `
                <div class="status-indicator status-connected">
                    <strong>Logged in as:</strong> ${currentUser.email}
                </div>
            `;
        }
    }
}

// ==================== SYNC WITH NEON DATABASE ====================
async function syncWithCloud() {
    if (!authToken) {
        alert("Please login first");
        return;
    }
    
    const syncBtn = document.getElementById("syncBtn");
    const originalText = syncBtn ? syncBtn.textContent : "🔄 Sync with Cloud";
    
    if (syncBtn) {
        syncBtn.textContent = "🔄 Syncing...";
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
            return;
        }
        
        console.log(`Syncing ${unsyncedEntries.length} entries...`);
        
        // Transform entries to match API format
        const expensesToSync = unsyncedEntries.map(entry => ({
            id: entry.id,
            date: entry.date,
            description: entry.desc,
            amount: parseFloat(entry.amount),
            main_category: entry.main,
            sub_category: entry.sub,
            sync_remarks: entry.syncRemarks
        }));
        
        // Send to backend API
        const response = await fetch("/api/expenses", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${authToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ expenses: expensesToSync })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log("Sync response:", data);
        
        if (data.success) {
            // Mark entries as synced
            const entryIds = unsyncedEntries.map(e => e.id);
            const result = await markAsSynced(entryIds);
            
            alert(`✅ Successfully synced ${result.updatedCount} entries to the cloud!`);
            
            // Refresh data
            calcTotal();
            loadSaved();
            updateSyncStatus();
            
        } else {
            throw new Error(data.message || "Sync failed");
        }
        
    } catch (error) {
        console.error("Sync error:", error);
        alert(`❌ Sync failed: ${error.message}`);
    } finally {
        if (syncBtn) {
            syncBtn.textContent = originalText;
            syncBtn.disabled = false;
        }
    }
}

// Load data from cloud on startup
async function loadFromCloud() {
    if (!authToken) return;
    
    try {
        const response = await fetch("/api/expenses", {
            headers: {
                "Authorization": `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.expenses) {
            let importedCount = 0;
            
            for (const expense of data.expenses) {
                try {
                    await saveEntry({
                        id: expense.id,
                        date: expense.date,
                        desc: expense.description,
                        amount: expense.amount,
                        main: expense.main_category,
                        sub: expense.sub_category,
                        synced: true,
                        syncRemarks: "synced"
                    });
                    importedCount++;
                } catch (saveError) {
                    console.error("Error saving expense:", saveError);
                }
            }
            
            console.log(`Loaded ${importedCount} expenses from cloud`);
            
            // Update UI
            calcTotal();
            loadSaved();
            
            return data.expenses;
        }
    } catch (error) {
        console.error("Error loading from cloud:", error);
    }
    return [];
}

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
        tableContainer.className = "table-container scrollable-table";
        tableContainer.style.maxHeight = "400px";
        tableContainer.style.overflowY = "auto";
        tableContainer.style.overflowX = "auto";
        tableContainer.style.borderRadius = "8px";
        tableContainer.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
        
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

// ==================== CATEGORY CRUD OPERATIONS ====================
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

// ==================== INITIALIZATION ====================
window.onload = function() {
    try {
        const today = new Date().toISOString().split("T")[0];
        const dateInput = document.getElementById("date");
        if (dateInput) dateInput.value = today;
        
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

document.addEventListener("keypress", function(e) {
    if (e.key === "Enter") {
        const activePage = document.querySelector(".page.active");
        if (activePage && activePage.id === "search") {
            performSearch();
        }
        
        // Also handle Enter in auth form
        if (activePage && activePage.id === "authScreen") {
            const focused = document.activeElement;
            if (focused && focused.id === "authPassword") {
                login();
            }
        }
    }
});

// ==================== SERVICE WORKER REGISTRATION ====================
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./service-worker.js")
            .then(registration => {
                console.log("✅ Service Worker registered with scope:", registration.scope);
                
                registration.addEventListener("updatefound", () => {
                    const newWorker = registration.installing;
                    console.log("🔄 New Service Worker found:", newWorker);
                    
                    newWorker.addEventListener("statechange", () => {
                        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                            if (confirm("A new version is available. Refresh to update?")) {
                                window.location.reload();
                            }
                        }
                    });
                });
            })
            .catch(error => {
                console.log("❌ Service Worker registration failed:", error);
            });
    });
}

console.log("✅ app.js loaded with Neon database integration");