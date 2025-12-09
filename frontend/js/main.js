// Main application initialization and event handlers

// DOM Elements
const tickerInput = document.getElementById('tickerInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const suggestionsBtn = document.getElementById('suggestionsBtn');
const suggestionsModal = document.getElementById('suggestionsModal');
const closeSuggestionsBtn = document.getElementById('closeSuggestionsBtn');
const suggestionsContent = document.getElementById('suggestionsContent');

/**
 * Initialize application on page load
 */
window.addEventListener('load', () => {
  loadWatchlist();
  // Auto-refresh watchlist in mock mode (no API limits!)
  // Comment this out when using real APIs
  refreshWatchlist();
  
  // Check if backend is in mock mode
  checkMockMode();
  
  // Setup time range toggles
  if (typeof window.setupTimeRangeToggles === 'function') {
    window.setupTimeRangeToggles();
  }
});

/**
 * Check if backend is running in mock mode
 */
async function checkMockMode() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    const data = await response.json();
    
    if (data.dataSource === 'mock') {
      document.getElementById('mockModeIndicator').classList.remove('hidden');
    }
  } catch (error) {
    console.log('Could not check backend mode');
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Analyze button click
  analyzeBtn.addEventListener('click', () => {
    const ticker = tickerInput.value.trim();
    analyzeStock(ticker);
  });

  // Enter key in ticker input
  tickerInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const ticker = tickerInput.value.trim();
      analyzeStock(ticker);
    }
  });

  // Auto-uppercase ticker input
  tickerInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
  });

  // Add to watchlist button
  document.getElementById('addToWatchlistBtn').addEventListener('click', () => {
    if (currentAnalysis) {
      addToWatchlist(currentAnalysis.ticker);
    }
  });

  // Suggestions button
  suggestionsBtn.addEventListener('click', showSuggestions);
  closeSuggestionsBtn.addEventListener('click', () => {
    suggestionsModal.classList.add('hidden');
  });

  // Close modal on background click
  suggestionsModal.addEventListener('click', (e) => {
    if (e.target === suggestionsModal) {
      suggestionsModal.classList.add('hidden');
    }
  });
  
  // Toggle indicators button
  const toggleIndicatorsBtn = document.getElementById('toggleIndicators');
  const indicatorToggles = document.getElementById('indicatorToggles');
  
  let indicatorListenersSetup = false;
  
  toggleIndicatorsBtn.addEventListener('click', () => {
    indicatorToggles.classList.toggle('hidden');
    
    // Setup listeners the first time the panel is opened
    if (!indicatorListenersSetup && typeof window.setupIndicatorToggles === 'function') {
      console.log('First time opening indicators panel, setting up listeners...');
      window.setupIndicatorToggles();
      indicatorListenersSetup = true;
    }
  });
}

/**
 * Show stock suggestions modal
 */
async function showSuggestions() {
  suggestionsModal.classList.remove('hidden');
  suggestionsContent.innerHTML = `
    <div class="text-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
      <p class="text-gray-600">Analyzing top stocks...</p>
      <p class="text-sm text-gray-500 mt-2">This may take a minute</p>
    </div>
  `;

  try {
    const response = await fetch(`${API_BASE_URL}/suggestions`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch suggestions');
    }

    displaySuggestions(data.suggestions);
  } catch (error) {
    suggestionsContent.innerHTML = `
      <div class="text-center py-12 text-red-600">
        <p class="font-semibold">Failed to load suggestions</p>
        <p class="text-sm mt-2">${error.message}</p>
      </div>
    `;
  }
}

/**
 * Display stock suggestions
 * @param {Array} suggestions - Array of stock suggestions
 */
function displaySuggestions(suggestions) {
  if (suggestions.length === 0) {
    suggestionsContent.innerHTML = `
      <div class="text-center py-12 text-gray-600">
        <p class="text-xl mb-2">📊</p>
        <p class="font-semibold">No strong recommendations at this time</p>
        <p class="text-sm mt-2">Check back later for new opportunities</p>
      </div>
    `;
    return;
  }

  suggestionsContent.innerHTML = `
    <div class="grid gap-4">
      ${suggestions.map((stock, index) => `
        <div class="border ${getMasterScoreBorder(stock.masterScore)} rounded-lg p-4 hover:shadow-md transition cursor-pointer"
             onclick="selectSuggestion('${stock.ticker}')">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-3 mb-2">
                <span class="text-lg font-bold text-gray-800">#${index + 1}</span>
                <span class="text-xl font-bold text-gray-900">${stock.ticker}</span>
                <span class="px-2 py-1 rounded text-xs font-semibold ${getRecommendationBadge(stock.recommendation)}">
                  ${stock.recommendation}
                </span>
              </div>
              <div class="flex items-baseline gap-3 mb-3">
                <span class="text-2xl font-bold text-gray-900">${stock.currentPrice.toFixed(2)}</span>
                <span class="text-sm ${parseFloat(stock.change) >= 0 ? 'text-green-600' : 'text-red-600'}">
                  ${parseFloat(stock.change) >= 0 ? '+' : ''}${stock.change.toFixed(2)} (${stock.changePercent})
                </span>
              </div>
              <div class="grid grid-cols-4 gap-2 text-xs">
                <div class="bg-blue-50 rounded px-2 py-1">
                  <div class="text-blue-600 font-medium">Master</div>
                  <div class="text-blue-900 font-bold">${stock.masterScore}</div>
                </div>
                <div class="bg-gray-50 rounded px-2 py-1">
                  <div class="text-gray-600 font-medium">Technical</div>
                  <div class="text-gray-900 font-bold">${stock.technicalScore}</div>
                </div>
                <div class="bg-gray-50 rounded px-2 py-1">
                  <div class="text-gray-600 font-medium">Sentiment</div>
                  <div class="text-gray-900 font-bold">${stock.sentimentScore}</div>
                </div>
                <div class="bg-gray-50 rounded px-2 py-1">
                  <div class="text-gray-600 font-medium">Fundamental</div>
                  <div class="text-gray-900 font-bold">${stock.fundamentalScore}</div>
                </div>
              </div>
            </div>
            <div class="ml-4">
              <div class="w-16 h-16 rounded-full ${getMasterScoreColor(stock.masterScore)} flex items-center justify-center">
                <span class="text-2xl font-bold text-white">${stock.masterScore}</span>
              </div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Select a suggestion and analyze it
 * @param {string} ticker - Stock ticker
 */
function selectSuggestion(ticker) {
  suggestionsModal.classList.add('hidden');
  tickerInput.value = ticker;
  analyzeStock(ticker);
}

/**
 * Get master score circle color
 * @param {number} score - Master score
 * @returns {string} Tailwind background class
 */
function getMasterScoreColor(score) {
  if (score >= 75) return 'bg-green-500';
  if (score >= 60) return 'bg-blue-500';
  if (score >= 45) return 'bg-yellow-500';
  return 'bg-red-500';
}

/**
 * Get master score border color
 * @param {number} score - Master score
 * @returns {string} Tailwind border class
 */
function getMasterScoreBorder(score) {
  if (score >= 75) return 'border-green-300 bg-green-50';
  if (score >= 60) return 'border-blue-300 bg-blue-50';
  return 'border-gray-300 bg-gray-50';
}

/**
 * Get recommendation badge style
 * @param {string} recommendation - Recommendation text
 * @returns {string} Tailwind classes
 */
function getRecommendationBadge(recommendation) {
  if (recommendation === 'STRONG BUY') return 'bg-green-600 text-white';
  if (recommendation === 'BUY') return 'bg-green-500 text-white';
  if (recommendation === 'HOLD') return 'bg-yellow-500 text-white';
  if (recommendation === 'SELL') return 'bg-red-500 text-white';
  return 'bg-red-600 text-white';
}

// Initialize event listeners
setupEventListeners();