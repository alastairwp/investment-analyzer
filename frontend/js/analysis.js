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

  // Stock Info - with null checks for robustness
  const tickerEl = document.getElementById('stockTicker');
  const priceEl = document.getElementById('stockPrice');
  const changeEl = document.getElementById('stockChange');
  const lastUpdatedEl = document.getElementById('lastUpdated');

  if (tickerEl) tickerEl.textContent = data.ticker;
  if (priceEl) priceEl.textContent = `${data.currentPrice.toFixed(2)}`;

  const change = parseFloat(data.change);
  if (changeEl) {
    changeEl.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)} (${data.changePercent})`;
    changeEl.className = `text-lg font-semibold ${change >= 0 ? 'text-green-600' : 'text-red-600'}`;
  }

  if (lastUpdatedEl) {
    lastUpdatedEl.textContent = `Last updated: ${new Date(data.lastUpdated).toLocaleString()}`;
  }

  // Update "Add to Watchlist" button
  updateWatchlistButton(data.ticker);

  // Display timeframe recommendations (Short, Mid, Long term)
  if (data.timeframes) {
    renderTimeframeRecommendations(data.timeframes);
  }

  // Summary based on mid-term recommendation (most relevant for typical investors)
  const midTermRec = data.timeframes?.midTerm?.recommendation || 'HOLD';
  displaySummary(midTermRec);

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
 * Render timeframe recommendations (Short, Mid, Long term)
 * @param {Object} timeframes - Timeframes object with shortTerm, midTerm, longTerm
 */
function renderTimeframeRecommendations(timeframes) {
  const { shortTerm, midTerm, longTerm } = timeframes;

  // Render each timeframe box
  renderTimeframeBox('shortTerm', shortTerm);
  renderTimeframeBox('midTerm', midTerm);
  renderTimeframeBox('longTerm', longTerm);
}

/**
 * Render a single timeframe box
 * @param {string} prefix - DOM element prefix (shortTerm, midTerm, longTerm)
 * @param {Object} data - Timeframe data
 */
function renderTimeframeBox(prefix, data) {
  if (!data) return;

  const box = document.getElementById(`${prefix}Box`);
  const scoreCircle = document.getElementById(`${prefix}ScoreCircle`);
  const scoreEl = document.getElementById(`${prefix}Score`);
  const recEl = document.getElementById(`${prefix}Rec`);
  const confidenceEl = document.getElementById(`${prefix}Confidence`);
  const signalsEl = document.getElementById(`${prefix}Signals`);
  const periodEl = document.getElementById(`${prefix}Period`);

  // Set period
  if (periodEl && data.period) {
    periodEl.textContent = data.period;
  }

  // Set score
  if (scoreEl) {
    scoreEl.textContent = data.score;
  }

  // Style score circle based on score
  if (scoreCircle) {
    scoreCircle.className = `w-12 h-12 rounded-full flex items-center justify-center ${getTimeframeScoreCircleColor(data.score)}`;
  }

  // Style box based on recommendation
  if (box) {
    box.className = `rounded-lg border-2 p-4 transition-all ${getTimeframeBoxStyle(data.recommendation)}`;
  }

  // Set recommendation with color
  if (recEl) {
    recEl.textContent = data.recommendation;
    recEl.className = `text-xl font-bold ${getTimeframeRecColor(data.recommendation)}`;
  }

  // Set confidence
  if (confidenceEl) {
    confidenceEl.textContent = data.confidence ? `(${data.confidence} confidence)` : '';
  }

  // Render signals
  if (signalsEl && data.signals) {
    signalsEl.innerHTML = data.signals.map(signal => {
      const icon = signal.type === 'bullish' ? '↑' : signal.type === 'bearish' ? '↓' : '→';
      const textColor = signal.type === 'bullish' ? 'text-green-600 dark:text-green-400' :
                        signal.type === 'bearish' ? 'text-red-600 dark:text-red-400' :
                        'text-gray-600 dark:text-gray-400';
      return `<div class="${textColor}"><span class="font-bold">${icon}</span> ${signal.message}</div>`;
    }).join('');
  }
}

/**
 * Get score circle background color class
 * @param {number} score - Score (0-100)
 * @returns {string} Tailwind background class
 */
function getTimeframeScoreCircleColor(score) {
  if (score >= 75) return 'bg-green-500';
  if (score >= 60) return 'bg-green-400';
  if (score >= 45) return 'bg-yellow-500';
  if (score >= 30) return 'bg-orange-500';
  return 'bg-red-500';
}

/**
 * Get box border and background style based on recommendation
 * @param {string} recommendation - Recommendation text
 * @returns {string} Tailwind classes
 */
function getTimeframeBoxStyle(recommendation) {
  switch (recommendation) {
    case 'STRONG BUY':
      return 'border-green-400 bg-green-50 dark:bg-green-900/20 dark:border-green-600';
    case 'BUY':
      return 'border-green-300 bg-green-50/50 dark:bg-green-900/10 dark:border-green-700';
    case 'HOLD':
      return 'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-600';
    case 'SELL':
      return 'border-red-300 bg-red-50/50 dark:bg-red-900/10 dark:border-red-700';
    case 'STRONG SELL':
      return 'border-red-400 bg-red-50 dark:bg-red-900/20 dark:border-red-600';
    default:
      return 'border-gray-300 bg-gray-50 dark:bg-gray-700 dark:border-gray-600';
  }
}

/**
 * Get recommendation text color
 * @param {string} recommendation - Recommendation text
 * @returns {string} Tailwind color class
 */
function getTimeframeRecColor(recommendation) {
  switch (recommendation) {
    case 'STRONG BUY':
      return 'text-green-600 dark:text-green-400';
    case 'BUY':
      return 'text-green-500 dark:text-green-400';
    case 'HOLD':
      return 'text-yellow-600 dark:text-yellow-400';
    case 'SELL':
      return 'text-red-500 dark:text-red-400';
    case 'STRONG SELL':
      return 'text-red-600 dark:text-red-400';
    default:
      return 'text-gray-600 dark:text-gray-400';
  }
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
  const summaryEl = document.getElementById('summary');
  if (!summaryEl) return;

  const sentiment = ['STRONG BUY', 'BUY'].includes(recommendation) ? 'bullish' :
                   recommendation === 'HOLD' ? 'neutral' : 'bearish';
  summaryEl.textContent =
    ` Based on technical indicators including RSI, moving averages, and MACD, this stock shows ${sentiment} signals. Review the specific indicators and signals below before making decisions.`;
}

/**
 * Display technical indicators
 * @param {Object} indicators - Technical indicators object
 */
function displayIndicators(indicators) {
  const indicatorsEl = document.getElementById('indicators');
  if (!indicatorsEl) return;

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