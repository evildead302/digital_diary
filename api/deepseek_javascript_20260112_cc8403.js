// auth.js - Authentication helper functions

const API_URL = '/api';

// Check API health
async function checkAPIHealth() {
    try {
        const response = await fetch(`${API_URL}/health`);
        const data = await response.json();
        console.log('API Health:', data);
        return data.success;
    } catch (error) {
        console.error('API not reachable');
        return false;
    }
}

// Get auth headers for API calls
function getAuthHeaders() {
    const token = localStorage.getItem('auth_token');
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
}

// Check if user is authenticated
function isAuthenticated() {
    const token = localStorage.getItem('auth_token');
    const user = localStorage.getItem('auth_user');
    return !!(token && user);
}

// Get current user
function getCurrentUser() {
    return JSON.parse(localStorage.getItem('auth_user') || 'null');
}

// Load expenses from cloud
async function loadFromCloud() {
    if (!isAuthenticated()) return [];
    
    try {
        const response = await fetch(`${API_URL}/expenses`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Save to local database
            for (const expense of data.expenses) {
                await saveEntry({
                    id: expense.id,
                    date: expense.date,
                    desc: expense.description,
                    amount: expense.amount,
                    main: expense.main_category,
                    sub: expense.sub_category,
                    synced: true
                });
            }
            return data.expenses;
        }
        return [];
    } catch (error) {
        console.error('Error loading from cloud:', error);
        return [];
    }
}

// Check health on load
window.addEventListener('load', () => {
    checkAPIHealth();
});