// auth.js - COMPLETE client-side authentication functions with enhanced error handling
const API_URL = '/api';

// ==================== AUTHENTICATION FUNCTIONS ====================

// Login function - calls server /api/login endpoint
async function login(email, password) {
    try {
        console.log('🔐 Client: Calling login API...', email);
        console.log('📤 Request body:', JSON.stringify({ email, password }));
        
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        
        console.log('📥 Response status:', response.status);
        console.log('📥 Response headers:', Object.fromEntries(response.headers.entries()));
        
        const responseText = await response.text();
        console.log('📥 Response text:', responseText);
        
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (parseError) {
            console.error('❌ JSON parse error:', parseError);
            throw new Error(`Invalid server response (not JSON): ${responseText.substring(0, 100)}`);
        }
        
        if (!response.ok) {
            console.error('❌ Server error response:', data);
            throw new Error(data.message || `HTTP ${response.status}: ${responseText}`);
        }
        
        console.log('✅ Login successful:', data);
        return data;
    } catch (error) {
        console.error('❌ Login API call failed:', error);
        // Check if it's a network error
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            throw new Error('Network error: Cannot connect to server. Check your internet connection.');
        }
        throw error;
    }
}

// Register function - calls server /api/register endpoint
async function register(email, password, name) {
    try {
        console.log('📝 Client: Calling register API...', email);
        console.log('📤 Request body:', JSON.stringify({ 
            email, 
            password,
            name: name || email.split('@')[0]
        }));
        
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ 
                email, 
                password,
                name: name || email.split('@')[0]
            })
        });
        
        console.log('📥 Response status:', response.status);
        console.log('📥 Response headers:', Object.fromEntries(response.headers.entries()));
        
        const responseText = await response.text();
        console.log('📥 Response text:', responseText);
        
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (parseError) {
            console.error('❌ JSON parse error:', parseError);
            throw new Error(`Invalid server response (not JSON): ${responseText.substring(0, 100)}`);
        }
        
        if (!response.ok) {
            console.error('❌ Server error response:', data);
            throw new Error(data.message || `HTTP ${response.status}: ${responseText}`);
        }
        
        console.log('✅ Registration successful:', data);
        return data;
    } catch (error) {
        console.error('❌ Register API call failed:', error);
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            throw new Error('Network error: Cannot connect to server. Check your internet connection.');
        }
        throw error;
    }
}

// ==================== AUTH HELPER FUNCTIONS ====================

// Check API health
async function checkAPIHealth() {
    try {
        console.log('🔌 Checking API health at:', `${API_URL}/health`);
        const response = await fetch(`${API_URL}/health`);
        console.log('📊 Health check status:', response.status);
        
        const data = await response.json();
        console.log('✅ API Health Response:', data);
        return { 
            success: data.success, 
            message: data.message,
            timestamp: data.timestamp
        };
    } catch (error) {
        console.error('❌ API health check failed:', error);
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
        console.warn('⚠️ No auth token found in localStorage');
        return {
            'Content-Type': 'application/json'
        };
    }
    
    console.log('🔑 Using auth token:', token.substring(0, 20) + '...');
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
    
    console.log('🔍 Checking authentication:', { 
        hasToken: !!token, 
        hasUser: !!user,
        tokenLength: token ? token.length : 0
    });
    
    if (!token || !user) {
        console.log('❌ Missing token or user data');
        return false;
    }
    
    // Check if token is expired (basic check)
    try {
        const tokenParts = token.split('.');
        if (tokenParts.length !== 3) {
            console.log('❌ Invalid token format');
            return false;
        }
        
        const payload = JSON.parse(atob(tokenParts[1]));
        const now = Math.floor(Date.now() / 1000);
        
        console.log('🔍 Token payload:', { 
            exp: payload.exp, 
            now: now,
            userId: payload.userId,
            email: payload.email
        });
        
        if (payload.exp && payload.exp < now) {
            console.log('❌ Token expired');
            localStorage.removeItem('auth_token');
            localStorage.removeItem('auth_user');
            return false;
        }
        
        console.log('✅ Token is valid');
        return true;
    } catch (error) {
        console.error('❌ Token validation error:', error);
        return false;
    }
}

// Get current user
function getCurrentUser() {
    try {
        const userStr = localStorage.getItem('auth_user');
        if (!userStr) {
            console.log('ℹ️ No user data in localStorage');
            return null;
        }
        
        const user = JSON.parse(userStr);
        console.log('👤 Current user:', user);
        return user;
    } catch (error) {
        console.error('❌ Error parsing user data:', error);
        return null;
    }
}

// Load expenses from cloud
async function loadFromCloud() {
    if (!isAuthenticated()) {
        console.log('❌ Not authenticated, skipping cloud load');
        return [];
    }
    
    try {
        console.log('☁️ Loading expenses from cloud...');
        
        const response = await fetch(`${API_URL}/expenses`, {
            headers: getAuthHeaders()
        });
        
        console.log('📥 Cloud response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('📊 Cloud load response:', data);
        
        if (data.success && data.expenses) {
            // Save to local database
            let savedCount = 0;
            for (const expense of data.expenses) {
                try {
                    // This function should be provided by db.js
                    if (typeof window.dbAPI?.saveEntry === 'function') {
                        await window.dbAPI.saveEntry({
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
                    }
                } catch (saveError) {
                    console.error('❌ Error saving expense:', saveError);
                }
            }
            console.log(`✅ Loaded ${savedCount} expenses from cloud`);
            return data.expenses;
        } else {
            console.warn('⚠️ Cloud load unsuccessful:', data.message);
            return [];
        }
    } catch (error) {
        console.error('❌ Error loading from cloud:', error);
        return [];
    }
}

// Verify current token with server
async function verifyToken() {
    if (!isAuthenticated()) {
        console.log('❌ Not authenticated, skipping token verification');
        return false;
    }
    
    try {
        console.log('🔍 Verifying token with server...');
        const response = await fetch(`${API_URL}/verify`, {
            headers: getAuthHeaders()
        });
        
        console.log('📥 Verify response status:', response.status);
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Token verification result:', data);
            return data.success || false;
        }
        
        console.log('❌ Token verification failed with status:', response.status);
        return false;
    } catch (error) {
        console.error('❌ Token verification failed:', error);
        return false;
    }
}

// Logout function
function logout() {
    console.log('🚪 Logging out user...');
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('current_user_id');
    console.log('✅ User logged out, localStorage cleared');
}

// ==================== DEBUG FUNCTIONS ====================

// Debug function to check localStorage
function debugLocalStorage() {
    console.log('📦 localStorage contents:');
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key);
        console.log(`  ${key}:`, value);
    }
}

// Debug function to check all auth state
function debugAuthState() {
    console.log('🔍 DEBUG AUTH STATE:');
    console.log('  API_URL:', API_URL);
    console.log('  auth_token exists:', !!localStorage.getItem('auth_token'));
    console.log('  auth_user exists:', !!localStorage.getItem('auth_user'));
    console.log('  isAuthenticated():', isAuthenticated());
    console.log('  getCurrentUser():', getCurrentUser());
}

// ==================== GLOBAL EXPORTS ====================

// Expose all functions to window object
window.authAPI = {
    login,
    register,
    logout,
    checkAPIHealth,
    getAuthHeaders,
    isAuthenticated,
    getCurrentUser,
    loadFromCloud,
    verifyToken,
    // Debug functions
    debugLocalStorage,
    debugAuthState
};

// Check health on load
window.addEventListener('load', async () => {
    console.log('🚀 Page loaded, initializing auth...');
    
    // Debug info
    console.log('📍 Window location:', window.location.href);
    console.log('📱 User agent:', navigator.userAgent);
    
    // Check health
    const health = await checkAPIHealth();
    
    if (!health.success) {
        console.warn('⚠️ API connection issue:', health.message);
        
        // Show warning to user
        const authError = document.getElementById('authError');
        if (authError) {
            authError.textContent = '⚠️ Cannot connect to server. Please check your internet connection.';
            authError.style.color = 'orange';
            authError.style.padding = '10px';
            authError.style.margin = '10px 0';
            authError.style.backgroundColor = '#fff3cd';
            authError.style.border = '1px solid #ffc107';
            authError.style.borderRadius = '4px';
        }
    } else {
        console.log('✅ API is healthy:', health.message);
        
        // Show success message
        const authStatus = document.getElementById('authStatus');
        if (authStatus) {
            authStatus.textContent = '✅ Connected to server';
            authStatus.style.color = 'green';
            setTimeout(() => {
                authStatus.textContent = '';
            }, 3000);
        }
    }
    
    // Check token validity
    if (isAuthenticated()) {
        console.log('🔍 User appears to be authenticated, verifying token...');
        const tokenValid = await verifyToken();
        if (!tokenValid) {
            console.log('❌ Token invalid, logging out...');
            logout();
            // Force page reload to show login screen
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } else {
            console.log('✅ Token verified successfully');
        }
    } else {
        console.log('ℹ️ User is not authenticated');
    }
    
    // Add debug button to page (only in development)
    if (window.location.hostname === 'localhost' || window.location.hostname.includes('vercel')) {
        const debugBtn = document.createElement('button');
        debugBtn.textContent = '🐛 Debug Auth';
        debugBtn.style.position = 'fixed';
        debugBtn.style.bottom = '10px';
        debugBtn.style.right = '10px';
        debugBtn.style.zIndex = '9999';
        debugBtn.style.padding = '5px 10px';
        debugBtn.style.fontSize = '12px';
        debugBtn.style.backgroundColor = '#f0f0f0';
        debugBtn.style.border = '1px solid #ccc';
        debugBtn.style.borderRadius = '3px';
        debugBtn.style.cursor = 'pointer';
        debugBtn.onclick = () => {
            debugAuthState();
            debugLocalStorage();
            alert('Check console for debug info');
        };
        document.body.appendChild(debugBtn);
    }
});

console.log('✅ auth.js loaded - Client-side authentication functions ready');
