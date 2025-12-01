// Watchlist module - manages watchlist functionality

const MAX_WATCHLIST = 10;
const WATCHLIST_STORAGE_KEY = 'stockWatchlist';

// DOM Elements
const watchlistItems = document.getElementById('watchlistItems');
const emptyWatchlist = document.getElementById('emptyWatchlist');

/**
 * Get watchlist from localStorage
 * @returns {Array} Watchlist items
 */
function getWatchlist() {
  const watchlist = localStorage.getItem(WATCHLIST_STORAGE_KEY);
  return watchlist ? JSON.parse(watchlist) : [];
}

/**
 * Save watchlist to localStorage
 * @param {Array} watchlist - Watchlist items to save
 */
function saveWatchlist(watchlist) {
  localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlist));
}

/**
 * Add current stock to watchlist
 * @param {string} ticker - Stock ticker to add
 */
function addToWatchlist(ticker) {
  const watchlist = getWatchlist();
  
  // Check if already in watchlist
  if (watchlist.some(item => item.ticker === ticker)) {
    alert('Stock already in watchlist!');
    return;
  }

  // Check max limit
  if (watchlist.length >= MAX_WATCHLIST) {
    alert(`Watchlist is full! Maximum ${MAX_WATCHLIST} stocks allowed.`);
    return;
  }

  watchlist.push({
    ticker: ticker,
    addedAt: new Date().toISOString()
  });

  saveWatchlist(watchlist);
  loadWatchlist();
  refreshWatchlist();
}

/**
 * Remove stock from watchlist
 * @param {string} ticker - Stock ticker to remove
 */
function removeFromWatchlist(ticker) {
  if (!confirm(`Remove ${ticker} from watchlist?`)) return;
  
  let watchlist = getWatchlist();
  watchlist = watchlist.filter(item => item.ticker !== ticker);
  saveWatchlist(watchlist);
  loadWatchlist();
}

/**
 * Load and display watchlist UI
 */
function loadWatchlist() {
  const watchlist = getWatchlist();
  
  if (watchlist.length === 0) {
    emptyWatchlist.classList.remove('hidden');
    watchlistItems.innerHTML = '';
    return;
  }

  emptyWatchlist.classList.add('hidden');
}

/**
 * Refresh all watchlist stocks with latest data
 */
async function refreshWatchlist() {
  const watchlist = getWatchlist();
  
  if (watchlist.length === 0) return;

  console.log(`Refreshing watchlist with ${watchlist.length} stocks...`);
  watchlistItems.innerHTML = '<div class="text-center text-sm text-gray-500 py-4">Loading watchlist...</div>';

  // In mock mode, no need to delay between requests
  for (let i = 0; i < watchlist.length; i++) {
    const item = watchlist[i];
    
    try {
      console.log(`Fetching ${item.ticker}...`);
      const data = await fetchStockData(item.ticker);
      console.log(`Received data for ${item.ticker}:`, data);
      renderWatchlistItem(data);
    } catch (error) {
      console.error(`Failed to fetch ${item.ticker}:`, error);
      renderWatchlistError(item.ticker, error.message);
    }
  }
  
  console.log('Watchlist refresh complete');
}

/**
 * Render error for watchlist item
 * @param {string} ticker - Stock ticker
 * @param {string} errorMsg - Error message
 */
function renderWatchlistError(ticker, errorMsg) {
  let itemEl = document.querySelector(`[data-ticker="${ticker}"]`);
  
  if (!itemEl) {
    itemEl = document.createElement('div');
    itemEl.setAttribute('data-ticker', ticker);
    watchlistItems.appendChild(itemEl);
  }
  
  itemEl.className = 'border border-red-200 dark:border-red-800 rounded-lg p-3 bg-red-50 dark:bg-red-900/20';
  itemEl.innerHTML = `
    <div class="flex justify-between items-start">
      <div class="flex-1">
        <div class="font-bold text-gray-800 dark:text-gray-200">${ticker}</div>
        <div class="text-xs text-red-600 dark:text-red-400 mt-1">${errorMsg}</div>
      </div>
      <button onclick="event.stopPropagation(); removeFromWatchlist('${ticker}')"
              class="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 text-xl leading-none">×</button>
    </div>
  `;
}

/**
 * Render a single watchlist item
 * @param {Object} data - Stock data
 */
function renderWatchlistItem(data) {
  const change = parseFloat(data.change);
  const scoreColor = data.technicalScore >= 70 ? 'bg-green-500' : 
                     data.technicalScore >= 50 ? 'bg-yellow-500' : 'bg-red-500';
  const changeColor = change >= 0 ? 'text-green-600' : 'text-red-600';

  // Find or create the item element
  let itemEl = document.querySelector(`[data-ticker="${data.ticker}"]`);
  
  if (!itemEl) {
    itemEl = document.createElement('div');
    itemEl.setAttribute('data-ticker', data.ticker);
    watchlistItems.appendChild(itemEl);
  }

  // Create mini chart
  const miniChartId = `mini-chart-${data.ticker}`;
  
  itemEl.className = 'border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:border-blue-300 dark:hover:border-blue-600 transition cursor-pointer bg-white dark:bg-gray-700';
  itemEl.innerHTML = `
    <div class="flex justify-between items-start mb-2">
      <div class="flex-1" onclick="analyzeStock('${data.ticker}')">
        <div class="font-bold text-gray-800 dark:text-gray-200">${data.ticker}</div>
        <div class="text-lg font-semibold text-gray-900 dark:text-gray-100">${data.currentPrice.toFixed(2)}</div>
        <div class="text-xs ${changeColor}">${change >= 0 ? '+' : ''}${change.toFixed(2)} (${data.changePercent})</div>
      </div>
      <button onclick="event.stopPropagation(); removeFromWatchlist('${data.ticker}')"
              class="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 text-xl leading-none">×</button>
    </div>

    <div class="mb-2">
      <canvas id="${miniChartId}" height="40"></canvas>
    </div>

    <div class="flex items-center gap-2 text-xs">
      <div class="flex-1 bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
        <div class="${scoreColor} h-1.5 rounded-full" style="width: ${data.technicalScore}%"></div>
      </div>
      <span class="font-semibold text-gray-700 dark:text-gray-300">${data.technicalScore}</span>
    </div>

    <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
      ${new Date(data.lastUpdated).toLocaleTimeString()}
    </div>
  `;

  // Draw mini chart after a short delay to ensure canvas is in DOM
  setTimeout(() => {
    if (data.historicalData && data.historicalData.length > 0) {
      drawMiniChart(miniChartId, data.historicalData);
    }
  }, 100);
}

/**
 * Check if ticker is in watchlist
 * @param {string} ticker - Stock ticker to check
 * @returns {boolean} True if in watchlist
 */
function isInWatchlist(ticker) {
  const watchlist = getWatchlist();
  return watchlist.some(item => item.ticker === ticker);
}