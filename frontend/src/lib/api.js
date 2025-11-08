// frontend/src/lib/api.js
// This connects your React frontend to your Python backend.

// Your new, non-standard port!
const API_BASE_URL = "https://text-guard.onrender.com"; 

/**
 * Calls the backend /moderate endpoint
 * @param {string} text The text to moderate
 * @param {string} mode "comment" or "chat"
 * @returns {Promise<object>} The moderation result (e.g., {action: 'block', ...})
 */
export async function callModerationAPI(text, mode = 'comment') {
  try {
    const response = await fetch(`${API_BASE_URL}/moderate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text,
        mode: mode,
      }),
    });
    
    if (!response.ok) {
      const err = await response.json();
      console.error("Server error:", err);
      return { action: 'review', reason: `Server error: ${err.detail}` };
    }
    
    return await response.json();
    
  } catch (error) {
    console.error('Network or fetch error:', error);
    // This happens if your backend server isn't running
    return { action: 'review', reason: 'Network error. Is backend running?' };
  }
}

/**
 * Fetches the admin logs from the backend /admin/logs endpoint
 * @returns {Promise<object>} The log results (e.g., {results: [], n: 0})
 */
export async function fetchAdminLogs() {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/logs`, {
      method: 'GET',
    });
    
    if (!response.ok) {
      const err = await response.json();
      console.error("Server error:", err);
      return { error: `Server error: ${err.detail}` };
    }
    
    return await response.json();

  } catch (error) {
    console.error('Network or fetch error:', error);
    return { error: 'Network error. Is backend running?' };
  }
}