// API module - handles all backend communication

const API_BASE_URL = 'http://localhost:3001/api';

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
