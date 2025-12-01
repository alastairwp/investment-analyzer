// Analysis module - handles stock analysis display

let currentAnalysis = null;
let activeSignalIndex = null;

// DOM Elements
const errorBox = document.getElementById('errorBox');
const errorMessage = document.getElementById('errorMessage');
const loadingBox = document.getElementById('loadingBox');
const resultsBox = document.getElementById('resultsBox');
const addToWatchlistBtn = document.getElementById('addToWatchlistBtn');

// Signal explanations database
const signalExplanations = {
  'RSI indicates oversold conditions': {
    explanation: 'The Relative Strength Index (RSI) is below 30, which typically means the stock has been sold heavily and may be undervalued. This could be a good buying opportunity, though you should confirm with other indicators before making a decision. Oversold conditions often precede price rebounds.',
    learnMoreUrl: 'https://www.investopedia.com/terms/r/rsi.asp'
  },
  'RSI indicates overbought conditions': {
    explanation: 'The RSI is above 70, suggesting the stock may be overvalued after strong buying pressure. This often signals a potential pullback or price correction. Consider waiting for a better entry point or taking profits if you already own the stock.',
    learnMoreUrl: 'https://www.investopedia.com/terms/r/rsi.asp'
  },
  'Golden cross pattern (SMA20 > SMA50)': {
    explanation: 'The 20-day simple moving average has crossed above the 50-day average, forming a "golden cross." This is a strong bullish signal indicating upward momentum is building. Traders often see this as confirmation of a new uptrend and a signal to buy.',
    learnMoreUrl: 'https://www.investopedia.com/terms/g/goldencross.asp'
  },
  'Death cross pattern (SMA20 < SMA50)': {
    explanation: 'The 20-day moving average has fallen below the 50-day average, creating a "death cross." This bearish pattern suggests weakening momentum and potentially signals the start of a downtrend. Many traders use this as a warning to sell or avoid buying.',
    learnMoreUrl: 'https://www.investopedia.com/terms/d/deathcross.asp'
  },
  'MACD above zero': {
    explanation: 'The Moving Average Convergence Divergence (MACD) indicator is positive, showing that short-term price momentum is stronger than long-term momentum. This bullish signal indicates the stock has upward momentum and buyers are gaining strength.',
    learnMoreUrl: 'https://www.investopedia.com/terms/m/macd.asp'
  },
  'MACD below zero': {
    explanation: 'The MACD indicator is negative, meaning short-term momentum is weaker than long-term trends. This bearish signal suggests sellers are in control and the stock may continue declining. Consider waiting for momentum to shift before buying.',
    learnMoreUrl: 'https://www.investopedia.com/terms/m/macd.asp'
  },
  'Price above 20-day average': {
    explanation: 'The current stock price is higher than its average price over the last 20 days. This shows recent upward momentum and suggests buyers are in control. It\'s a bullish signal that often indicates continued strength in the near term.',
    learnMoreUrl: 'https://www.investopedia.com/terms/s/sma.asp'
  },
  'Price below 20-day average': {
    explanation: 'The stock is trading below its 20-day moving average, indicating recent weakness. This bearish signal shows sellers have been dominant and the stock has downward momentum. The price may need to reclaim this level before turning bullish.',
    learnMoreUrl: 'https://www.investopedia.com/terms/s/sma.asp'
  }
};

/**
 * Get explanation for a signal
 * @param {string} message - Signal message
 * @returns {Object} Explanation and learn more URL
 */
function getSignalExplanation(message) {
  return signalExplanations[message] || {
    explanation: 'This technical signal provides insight into the stock\'s current momentum and trend direction. Consider it alongside other indicators for a complete picture.',
    learnMoreUrl: 'https://www.investopedia.com/technical-analysis-4689657'
  };
}

/**
 * Toggle signal accordion
 * @param {number} index - Index of signal to toggle
 */
function toggleSignal(index) {
  const explanationEl = document.getElementById(`signal-explanation-${index}`);
  const arrowEl = document.getElementById(`signal-arrow-${index}`);
  
  // If clicking the same signal, close it
  if (activeSignalIndex === index) {
    explanationEl.style.maxHeight = '0';
    arrowEl.textContent = '▶';
    activeSignalIndex = null;
    return;
  }
  
  // Close previously open signal
  if (activeSignalIndex !== null) {
    const prevExplanation = document.getElementById(`signal-explanation-${activeSignalIndex}`);
    const prevArrow = document.getElementById(`signal-arrow-${activeSignalIndex}`);
    if (prevExplanation) {
      prevExplanation.style.maxHeight = '0';
      prevArrow.textContent = '▶';
    }
  }
  
  // Open clicked signal
  explanationEl.style.maxHeight = explanationEl.scrollHeight + 'px';
  arrowEl.textContent = '▼';
  activeSignalIndex = index;
}

/**
 * Analyze a stock and display results
 * @param {string} ticker - Stock ticker to analyze
 */
async function analyzeStock(ticker) {
  if (!ticker) return;

  // Reset UI
  errorBox.classList.add('hidden');
  resultsBox.classList.add('hidden');
  loadingBox.classList.remove('hidden');
  activeSignalIndex = null;
  
  const analyzeBtn = document.getElementById('analyzeBtn');
  const btnText = document.getElementById('btnText');
  analyzeBtn.disabled = true;
  btnText.textContent = 'Analyzing...';

  try {
    const data = await fetchStockData(ticker);
    currentAnalysis = data;
    displayResults(data);
  } catch (error) {
    showError(error.message);
  } finally {
    loadingBox.classList.add('hidden');
    analyzeBtn.disabled = false;
    btnText.textContent = 'Analyze';
  }
}

/**
 * Show error message
 * @param {string} message - Error message to display
 */
function showError(message) {
  errorMessage.textContent = message;
  errorBox.classList.remove('hidden');
}

/**
 * Display analysis results
 * @param {Object} data - Stock analysis data
 */
function displayResults(data) {
  resultsBox.classList.remove('hidden');

  // Stock Info
  document.getElementById('stockTicker').textContent = data.ticker;
  document.getElementById('stockPrice').textContent = `${data.currentPrice.toFixed(2)}`;
  
  const change = parseFloat(data.change);
  const changeEl = document.getElementById('stockChange');
  changeEl.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)} (${data.changePercent})`;
  changeEl.className = `text-lg font-semibold ${change >= 0 ? 'text-green-600' : 'text-red-600'}`;

  document.getElementById('lastUpdated').textContent = 
    `Last updated: ${new Date(data.lastUpdated).toLocaleString()}`;

  // Recommendation
  const recEl = document.getElementById('recommendation');
  recEl.textContent = data.recommendation;
  const recColor = ['STRONG BUY', 'BUY'].includes(data.recommendation) ? 'text-green-600' :
                    data.recommendation === 'HOLD' ? 'text-yellow-600' : 'text-red-600';
  recEl.className = `text-2xl font-bold ${recColor}`;
  
  document.getElementById('confidence').textContent = `Confidence: ${data.confidence}`;

  // Update "Add to Watchlist" button
  updateWatchlistButton(data.ticker);

  // Display all scores (Technical, Sentiment, Fundamental, Master)
  displayAllScores(data);

  // Summary
  displaySummary(data.recommendation);

  // Trading Signals
  displaySignals(data.signals);

  // News & Sentiment
  displayNewsSection(data.sentiment);

  // Price Chart with indicators overlaid
  drawPriceChart(
    data.historicalData, 
    {
      sma20: data.indicators.sma20 !== 'N/A' ? parseFloat(data.indicators.sma20) : null,
      sma50: data.indicators.sma50 !== 'N/A' ? parseFloat(data.indicators.sma50) : null
    },
    data.advancedIndicators
  );
}

/**
 * Update the "Add to Watchlist" button state
 * @param {string} ticker - Stock ticker
 */
function updateWatchlistButton(ticker) {
  const inWatchlist = isInWatchlist(ticker);
  addToWatchlistBtn.disabled = inWatchlist;
  addToWatchlistBtn.innerHTML = inWatchlist ? 
    '<span>✓</span><span>In Watchlist</span>' : 
    '<span>⭐</span><span>Add to Watchlist</span>';
  addToWatchlistBtn.className = inWatchlist ?
    'px-4 py-2 bg-gray-400 text-white rounded-lg text-sm flex items-center gap-2 cursor-not-allowed' :
    'px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center gap-2';
}

/**
 * Display all scores (Master, Technical, Sentiment, Fundamental)
 * @param {Object} data - Stock analysis data
 */
function displayAllScores(data) {
  const scoresHtml = `
    <div class="grid grid-cols-4 gap-4">
      <div class="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/40 dark:to-blue-800/40 rounded-lg p-4 border-2 border-blue-300 dark:border-blue-700">
        <div class="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">MASTER SCORE</div>
        <div class="text-3xl font-bold text-blue-900 dark:text-blue-100">${data.masterScore}</div>
        <div class="text-xs text-blue-600 dark:text-blue-400 mt-1">Overall Rating</div>
      </div>

      <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
        <div class="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">TECHNICAL (40%)</div>
        <div class="flex items-center gap-2">
          <div class="text-2xl font-bold ${getScoreColor(data.technicalScore)}">${data.technicalScore}</div>
          <div class="flex-1 bg-gray-200 dark:bg-gray-600 rounded-full h-2">
            <div class="${getScoreBarColor(data.technicalScore)} h-2 rounded-full"
                 style="width: ${data.technicalScore}%"></div>
          </div>
        </div>
      </div>

      <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
        <div class="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">SENTIMENT (30%)</div>
        <div class="flex items-center gap-2">
          <div class="text-2xl font-bold ${getScoreColor(data.sentimentScore)}">${data.sentimentScore}</div>
          <div class="flex-1 bg-gray-200 dark:bg-gray-600 rounded-full h-2">
            <div class="${getScoreBarColor(data.sentimentScore)} h-2 rounded-full"
                 style="width: ${data.sentimentScore}%"></div>
          </div>
        </div>
      </div>

      <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
        <div class="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">FUNDAMENTAL (30%)</div>
        <div class="flex items-center gap-2">
          <div class="text-2xl font-bold ${getScoreColor(data.fundamentalScore)}">${data.fundamentalScore}</div>
          <div class="flex-1 bg-gray-200 dark:bg-gray-600 rounded-full h-2">
            <div class="${getScoreBarColor(data.fundamentalScore)} h-2 rounded-full"
                 style="width: ${data.fundamentalScore}%"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('allScores').innerHTML = scoresHtml;
}

/**
 * Get color class for score text
 * @param {number} score - Score (0-100)
 * @returns {string} Tailwind color class
 */
function getScoreColor(score) {
  if (score >= 70) return 'text-green-600';
  if (score >= 50) return 'text-yellow-600';
  return 'text-red-600';
}

/**
 * Get color class for score bar
 * @param {number} score - Score (0-100)
 * @returns {string} Tailwind background class
 */
function getScoreBarColor(score) {
  if (score >= 70) return 'bg-green-500';
  if (score >= 50) return 'bg-yellow-500';
  return 'bg-red-500';
}

/**
 * Display news and sentiment section
 * @param {Object} sentimentData - Sentiment analysis data
 */
function displayNewsSection(sentimentData) {
  const newsEl = document.getElementById('newsSection');
  newsEl.innerHTML = displaySentiment(sentimentData);
}

/**
 * Display analysis summary
 * @param {string} recommendation - Buy/Sell/Hold recommendation
 */
function displaySummary(recommendation) {
  const sentiment = ['STRONG BUY', 'BUY'].includes(recommendation) ? 'bullish' :
                   recommendation === 'HOLD' ? 'neutral' : 'bearish';
  document.getElementById('summary').textContent = 
    ` Based on technical indicators including RSI, moving averages, and MACD, this stock shows ${sentiment} signals. Review the specific indicators and signals below before making decisions.`;
}

/**
 * Display technical indicators
 * @param {Object} indicators - Technical indicators object
 */
function displayIndicators(indicators) {
  const indicatorsEl = document.getElementById('indicators');
  indicatorsEl.innerHTML = Object.entries(indicators).map(([key, value]) => `
    <div class="flex justify-between items-center border-b border-gray-200 pb-2">
      <div class="text-sm text-gray-600 font-medium">${key.toUpperCase()}</div>
      <div class="text-lg font-semibold text-gray-800">${value}</div>
    </div>
  `).join('');
}

/**
 * Display trading signals with accordion
 * @param {Array} signals - Array of signal objects
 */
function displaySignals(signals) {
  const signalsEl = document.getElementById('signals');
  if (signals.length > 0) {
    signalsEl.innerHTML = signals.map((signal, index) => {
      const bgColor = signal.type === 'bullish' ? 'bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30' : 'bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30';
      const borderColor = signal.type === 'bullish' ? 'border-green-200 dark:border-green-800' : 'border-red-200 dark:border-red-800';
      const explanation = getSignalExplanation(signal.message);
      const explanationBg = signal.type === 'bullish' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30';

      return `
        <div class="border ${borderColor} rounded-lg mb-2 overflow-hidden">
          <div class="${bgColor} p-3 cursor-pointer transition-colors" onclick="toggleSignal(${index})">
            <div class="flex items-center gap-3">
              <span id="signal-arrow-${index}" class="text-gray-600 dark:text-gray-400 text-sm">▶</span>
              <span>${signal.type === 'bullish' ? '📈' : '📉'}</span>
              <span class="text-gray-800 dark:text-gray-200 flex-1">${signal.message}</span>
            </div>
          </div>
          <div id="signal-explanation-${index}" class="${explanationBg} px-3 transition-all duration-300 ease-in-out" style="max-height: 0; overflow: hidden;">
            <div class="py-3 border-t ${borderColor}">
              <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-3">${explanation.explanation}</p>
              <a href="${explanation.learnMoreUrl}" target="_blank" class="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline">
                📚 Learn more about this indicator →
              </a>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } else {
    signalsEl.innerHTML = '<p class="text-gray-600 dark:text-gray-400">No significant signals detected.</p>';
  }
}