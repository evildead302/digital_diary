// app.js - UPDATED with authentication

// Global variables
let authToken = localStorage.getItem('auth_token');
let currentUser = JSON.parse(localStorage.getItem('auth_user') || 'null');

// Check authentication
function checkAuth() {
    if (authToken && currentUser) {
        document.getElementById('authScreen').style.display = 'none';
        document.getElementById('appScreen').style.display = 'block';
        document.getElementById('userName').textContent = currentUser.email;
        initApp();
    } else {
        document.getElementById('authScreen').style.display = 'block';
        document.getElementById('appScreen').style.display = 'none';
    }
}

// Login function
async function login() {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem('auth_token', data.token);
            localStorage.setItem('auth_user', JSON.stringify(data.user));
            checkAuth();
        } else {
            document.getElementById('authError').textContent = data.message;
        }
    } catch (error) {
        document.getElementById('authError').textContent = 'Login failed';
    }
}

// Register function
async function register() {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Auto login after registration
            await login();
        } else {
            document.getElementById('authError').textContent = data.message;
        }
    } catch (error) {
        document.getElementById('authError').textContent = 'Registration failed';
    }
}

// Logout function
function logout() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    authToken = null;
    currentUser = null;
    checkAuth();
}

// Initialize app after login
function initApp() {
    // Your existing app initialization code here
    calcTotal();
    loadSaved();
}

// Sync with cloud
async function syncWithCloud() {
    if (!authToken) return;
    
    // Get unsynced entries
    getAllEntries(async (entries) => {
        const unsynced = entries.filter(e => !e.synced);
        
        if (unsynced.length === 0) {
            alert('All entries are already synced!');
            return;
        }
        
        try {
            const response = await fetch('/api/expenses', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ expenses: unsynced })
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Mark as synced
                for (const entry of unsynced) {
                    entry.synced = true;
                    await saveEntry(entry);
                }
                alert(`Synced ${unsynced.length} entries successfully!`);
                loadSaved();
                calcTotal();
            } else {
                alert('Sync failed: ' + data.message);
            }
        } catch (error) {
            alert('Sync error: ' + error.message);
        }
    });
}

// Your existing functions (calcTotal, loadSaved, etc.) remain the same
// Just remove all Google Drive references