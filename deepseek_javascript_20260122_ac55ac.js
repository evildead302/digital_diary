// auth.js - COMPLETE with authentication helper functions

const API_URL = '/api';

// Check API health
async function checkAPIHealth() {
    try {
        console.log('Checking API health at:', API_URL + '/health');
        const response = await fetch(API_URL + '/health');
        const data = await response.json();
        console.log('API Health Response:', data);
        return { 
            success: data.success, 
            message: data.message,
            timestamp: data.timestamp
        };
    } catch (error) {
        console.error('API health check failed:', error);
        return { 
            success: false, 
            message: `Cannot connect to API: ${error.message}`,
            error: error
        };
    }
}

// Get auth headers for API calls
function getAuthHeaders() {
    const token = localStorage.getItem('auth_token');
    if (!token) {
        console.warn('No auth token found');
        return {
            'Content-Type': 'application/json'
        };
    }
    
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };
}

// Check if user is authenticated
function isAuthenticated() {
    const token = localStorage.getItem('auth_token');
    const user = localStorage.getItem('auth_user');
    
    if (!token || !user) {
        return false;
    }
    
    // Check if token is expired (basic check)
    try {
        const tokenParts = token.split('.');
        if (tokenParts.length !== 3) return false;
        
        const payload = JSON.parse(atob(tokenParts[1]));
        const now = Math.floor(Date.now() / 1000);
        
        if (payload.exp && payload.exp < now) {
            console.log('Token expired');
            localStorage.removeItem('auth_token');
            localStorage.removeItem('auth_user');
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('Token validation error:', error);
        return false;
    }
}

// Get current user
function getCurrentUser() {
    try {
        const userStr = localStorage.getItem('auth_user');
        return userStr ? JSON.parse(userStr) : null;
    } catch (error) {
        console.error('Error parsing user data:', error);
        return null;
    }
}

// Load expenses from cloud
async function loadFromCloud() {
    if (!isAuthenticated()) {
        console.log('Not authenticated, skipping cloud load');
        return [];
    }
    
    try {
        console.log('Loading expenses from cloud...');
        
        const response = await fetch(`${API_URL}/expenses`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('Cloud load response:', data);
        
        if (data.success && data.expenses) {
            // Save to local database
            let savedCount = 0;
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
                        syncRemarks: 'synced'
                    });
                    savedCount++;
                } catch (saveError) {
                    console.error('Error saving expense:', saveError);
                }
            }
            console.log(`Loaded ${savedCount} expenses from cloud`);
            return data.expenses;
        } else {
            console.warn('Cloud load unsuccessful:', data.message);
            return [];
        }
    } catch (error) {
        console.error('Error loading from cloud:', error);
        return [];
    }
}

// Verify current token with server
async function verifyToken() {
    if (!isAuthenticated()) {
        return false;
    }
    
    try {
        const response = await fetch(`${API_URL}/verify`, {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const data = await response.json();
            return data.success || false;
        }
        return false;
    } catch (error) {
        console.error('Token verification failed:', error);
        return false;
    }
}

// Check health on load
window.addEventListener('load', async () => {
    console.log('Page loaded, checking API health...');
    const health = await checkAPIHealth();
    
    if (!health.success) {
        console.warn('API connection issue:', health.message);
        
        // Show warning to user (optional)
        const authError = document.getElementById('authError');
        if (authError && !authError.textContent) {
            authError.textContent = '⚠️ API connection issue. Some features may not work.';
            authError.style.color = 'orange';
        }
    } else {
        console.log('API is healthy:', health.message);
    }
    
    // Check token validity
    if (isAuthenticated()) {
        const tokenValid = await verifyToken();
        if (!tokenValid) {
            console.log('Token invalid, logging out...');
            localStorage.removeItem('auth_token');
            localStorage.removeItem('auth_user');
            // Force page reload to show login screen
            window.location.reload();
        }
    }
});