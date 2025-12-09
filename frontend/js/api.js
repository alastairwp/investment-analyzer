// API module - handles all backend communication

// Dynamically construct API URL based on current host
// This allows the app to work on any host without hardcoded IPs
const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:3001/api`;

// Make API_BASE_URL available globally
window.API_BASE_URL = API_BASE_URL;

/**
 * Fetch stock analysis data from backend
 * @param {string} ticker - Stock ticker symbol
 * @returns {Promise<Object>} Stock analysis data
 */
async function fetchStockData(ticker) {
  const response = await fetch(`${API_BASE_URL}/analyze/${ticker}`);
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'Failed to fetch data');
  }
  
  return data;
}

/**
 * Check backend health status
 * @returns {Promise<Object>} Health status
 */
async function checkBackendHealth() {
  const response = await fetch(`${API_BASE_URL}/health`);
  return await response.json();
}
