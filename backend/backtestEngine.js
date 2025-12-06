// Backtesting Engine - Simulates trading based on historical recommendations

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Cache directory for historical data
const CACHE_DIR = path.join(__dirname, '.cache');

// Default indicator configuration - all parameters can be overridden via config
const DEFAULT_INDICATOR_CONFIG = {
  // Indicator Periods
  rsiPeriod: 14,
  smaShortPeriod: 20,
  smaLongPeriod: 50,
  macdFast: 12,
  macdSlow: 26,
  williamsRPeriod: 14,
  momentumPeriod: 5,

  // RSI Thresholds
  rsiOversold: 30,
  rsiOverbought: 70,
  rsiModerateOversold: 40,
  rsiModerateOverbought: 60,

  // Williams %R Thresholds (range: -100 to 0)
  williamsROverbought: -20,
  williamsRModerateOverbought: -30,
  williamsROversold: -80,
  williamsRModerateOversold: -70,

  // Score Thresholds for Recommendations
  strongBuyThreshold: 75,
  buyThreshold: 60,
  sellThreshold: 45,
  strongSellThreshold: 30,

  // Score Adjustments - RSI
  rsiOversoldScore: 25,
  rsiModerateOversoldScore: 15,
  rsiOverboughtScore: -25,
  rsiModerateOverboughtScore: -15,

  // Score Adjustments - Williams %R
  williamsROverboughtScore: -30,
  williamsRModerateOverboughtScore: -15,
  williamsROversoldScore: 20,
  williamsRModerateOversoldScore: 10,

  // Exit Strategy
  takeProfitPercent: 5,
  stopLossPercent: -8,
  trailingStopActivation: 1.5,
  trailingStopPercent: 1,

  // Volume Filters
  highVolumeRatio: 1.5,
  lowVolumeRatio: 0.7,
  volumeSpikRatio: 2.0,

  // Momentum Thresholds
  bigMoveThreshold: 3,
  smallMoveThreshold: 2,

  // Time Filters
  lateSessionHour: 14,
  lateSessionMinute: 30,
  morningSessionEndHour: 11,

  // Morning Reversal Thresholds
  morningReversalStrong: 0.8,
  morningReversalModerate: 0.5,

  // Consecutive Down Periods
  consecutiveDownStrong: 3,
  consecutiveDownModerate: 2,

  // Resample Interval (minutes) - 0 or null means no resampling
  resampleMinutes: 30
};

/**
 * Resample OHLCV data to a larger interval
 * @param {Array} data - Array of OHLCV data points
 * @param {number} intervalMinutes - Target interval in minutes (e.g., 60 for 1-hour)
 * @returns {Array} Resampled data
 */
function resampleOHLCV(data, intervalMinutes) {
  if (!data.length) return [];

  const resampled = [];
  let currentCandle = null;

  for (const point of data) {
    // Parse timestamp to get the interval bucket
    const [datePart, timePart] = point.datetime.split(' ');
    const [hour, minute] = timePart.split(':').map(Number);
    const totalMinutes = hour * 60 + minute;
    const bucketMinute = Math.floor(totalMinutes / intervalMinutes) * intervalMinutes;
    const bucketHour = Math.floor(bucketMinute / 60);
    const bucketMin = bucketMinute % 60;
    const bucketTime = `${String(bucketHour).padStart(2, '0')}:${String(bucketMin).padStart(2, '0')}:00`;
    const bucketDatetime = `${datePart} ${bucketTime}`;

    if (!currentCandle || currentCandle.datetime !== bucketDatetime) {
      // Start new candle
      if (currentCandle) {
        resampled.push(currentCandle);
      }
      currentCandle = {
        date: datePart,
        datetime: bucketDatetime,
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
        volume: point.volume
      };
    } else {
      // Update existing candle
      currentCandle.high = Math.max(currentCandle.high, point.high);
      currentCandle.low = Math.min(currentCandle.low, point.low);
      currentCandle.close = point.close;
      currentCandle.volume += point.volume;
    }
  }

  // Don't forget the last candle
  if (currentCandle) {
    resampled.push(currentCandle);
  }

  return resampled;
}

/**
 * Load historical data from a CSV file
 * Expected CSV format: timestamp,open,high,low,close,volume
 * @param {string} filePath - Path to the CSV file
 * @param {number} resampleMinutes - Optional: resample to this interval (e.g., 60 for 1-hour)
 * @returns {Array} Historical data array in backtest format
 */
function loadHistoricalDataFromCSV(filePath, resampleMinutes = null) {
  console.log(`  📁 Loading data from CSV file: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`CSV file not found: ${filePath}`);
  }

  const fileContent = fs.readFileSync(filePath, 'utf8');
  const lines = fileContent.trim().split('\n');

  // Skip header line
  const header = lines[0].toLowerCase();
  const hasHeader = header.includes('timestamp') || header.includes('open');
  const dataLines = hasHeader ? lines.slice(1) : lines;

  console.log(`  ✓ Found ${dataLines.length} data rows`);

  let data = dataLines.map((line, index) => {
    const parts = line.split(',');
    if (parts.length < 6) {
      console.warn(`  ⚠️  Skipping malformed line ${index + 1}: ${line}`);
      return null;
    }

    const timestamp = parts[0].trim();
    const datePart = timestamp.split(' ')[0]; // Extract YYYY-MM-DD

    return {
      date: datePart,
      datetime: timestamp,
      open: parseFloat(parts[1]),
      high: parseFloat(parts[2]),
      low: parseFloat(parts[3]),
      close: parseFloat(parts[4]),
      volume: parseInt(parts[5])
    };
  }).filter(item => item !== null);

  // Sort by datetime
  data.sort((a, b) => a.datetime.localeCompare(b.datetime));

  // Resample if requested
  if (resampleMinutes && resampleMinutes > 1) {
    console.log(`  🔄 Resampling to ${resampleMinutes}-minute intervals...`);
    data = resampleOHLCV(data, resampleMinutes);
    console.log(`  ✓ Resampled to ${data.length} candles`);
  }

  console.log(`  ✓ Loaded ${data.length} data points from CSV`);
  console.log(`  ✓ Date range: ${data[0].datetime} to ${data[data.length - 1].datetime}`);

  return data;
}

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  console.log('📁 Created cache directory:', CACHE_DIR);
}

/**
 * Get cache file path for a ticker
 */
function getCacheFilePath(ticker, interval) {
  const sanitizedTicker = ticker.replace(/[^a-zA-Z0-9]/g, '_');
  return path.join(CACHE_DIR, `${sanitizedTicker}_${interval}.json`);
}

/**
 * Get cache metadata file path
 */
function getCacheMetaFilePath(ticker, interval) {
  const sanitizedTicker = ticker.replace(/[^a-zA-Z0-9]/g, '_');
  return path.join(CACHE_DIR, `${sanitizedTicker}_${interval}_meta.json`);
}

/**
 * Check if cached data exists (no time-based expiry)
 */
function cacheExists(cacheFile) {
  return fs.existsSync(cacheFile);
}

/**
 * Get cache metadata (last updated timestamp)
 */
function getCacheMeta(ticker, interval) {
  const metaFile = getCacheMetaFilePath(ticker, interval);
  if (!fs.existsSync(metaFile)) {
    return null;
  }

  try {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    return meta;
  } catch (error) {
    return null;
  }
}

/**
 * Load data from cache
 */
function loadFromCache(cacheFile) {
  try {
    const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    console.log(`  ✓ Loaded ${data.length} data points from cache`);
    return data;
  } catch (error) {
    console.log(`  ⚠️  Cache read error:`, error.message);
    return null;
  }
}

/**
 * Save data to cache with metadata
 */
function saveToCache(cacheFile, data, ticker, interval) {
  try {
    // Save data
    fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2), 'utf8');

    // Save metadata
    const metaFile = getCacheMetaFilePath(ticker, interval);
    const metadata = {
      ticker,
      interval,
      lastUpdated: new Date().toISOString(),
      dataPoints: data.length,
      dateRange: {
        start: data[0]?.datetime || data[0]?.date,
        end: data[data.length - 1]?.datetime || data[data.length - 1]?.date
      }
    };
    fs.writeFileSync(metaFile, JSON.stringify(metadata, null, 2), 'utf8');

    console.log(`  ✓ Saved ${data.length} data points to cache`);
  } catch (error) {
    console.log(`  ⚠️  Cache write error:`, error.message);
  }
}

/**
 * Merge existing and new historical data, keeping all unique data points
 * @param {Array} existingData - Previously cached data
 * @param {Array} newData - Newly fetched data
 * @returns {Array} Merged and deduplicated data, sorted by datetime
 */
function mergeHistoricalData(existingData, newData) {
  // Create a map using datetime as key to deduplicate
  const dataMap = new Map();

  // Add existing data to map
  existingData.forEach(item => {
    dataMap.set(item.datetime, item);
  });

  // Add new data to map (will overwrite any duplicates with fresh data)
  newData.forEach(item => {
    dataMap.set(item.datetime, item);
  });

  // Convert map back to array and sort by datetime
  const mergedArray = Array.from(dataMap.values());
  mergedArray.sort((a, b) => a.datetime.localeCompare(b.datetime));

  return mergedArray;
}

/**
 * Fetch historical intraday data from Alpha Vantage (15min intervals)
 * WITH CUMULATIVE CACHING - new data is merged with existing cache
 * @param {string} ticker - Stock ticker symbol
 * @param {string} apiKey - Alpha Vantage API key
 * @param {string} startDate - Start date for backtest
 * @param {string} endDate - End date for backtest
 * @param {boolean} forceRefresh - Force refresh cache from API
 * @returns {Promise<Array>} Historical intraday data array
 */
async function fetchHistoricalData(ticker, apiKey, startDate, endDate, forceRefresh = false) {
  console.log(`  📡 Fetching 15-minute intraday data for ${ticker}...`);

  const cacheFile = getCacheFilePath(ticker, '15min');
  let existingData = [];

  // Load existing cached data (we'll merge with it)
  if (cacheExists(cacheFile)) {
    const meta = getCacheMeta(ticker, '15min');
    const lastUpdated = meta ? new Date(meta.lastUpdated).toLocaleString() : 'Unknown';
    console.log(`  💾 Found existing cache (last updated: ${lastUpdated}, ${meta?.dataPoints || 0} points)`);
    existingData = loadFromCache(cacheFile) || [];
  }

  if (!forceRefresh && existingData.length > 0) {
    console.log(`  ✓ Using cached data (${existingData.length} data points)`);
    return existingData;
  }

  console.log(`  🔄 Fetching fresh data from API to merge with cache...`);

  // Fetch new data from Alpha Vantage
  const response = await axios.get('https://www.alphavantage.co/query', {
    params: {
      function: 'TIME_SERIES_INTRADAY',
      symbol: ticker,
      interval: '15min',
      apikey: apiKey,
      outputsize: 'full', // Last 1-2 months of 15min data
      extended_hours: false
    }
  });

  if (response.data['Error Message']) {
    throw new Error(`Invalid ticker: ${ticker}`);
  }

  if (response.data['Note']) {
    throw new Error('API rate limit reached - wait 1 minute or upgrade to premium');
  }

  const intradayKey = 'Time Series (15min)';
  const intradayData = response.data[intradayKey];

  if (!intradayData) {
    console.log('  ⚠️  No 15min intraday data available, falling back to daily data');
    return await fetchDailyDataFallback(ticker, apiKey, forceRefresh);
  }

  // Convert to array format with datetime
  const timestamps = Object.keys(intradayData).sort();
  const newData = timestamps.map(timestamp => ({
    date: timestamp.split(' ')[0], // Extract date part
    datetime: timestamp,
    open: parseFloat(intradayData[timestamp]['1. open']),
    high: parseFloat(intradayData[timestamp]['2. high']),
    low: parseFloat(intradayData[timestamp]['3. low']),
    close: parseFloat(intradayData[timestamp]['4. close']),
    volume: parseInt(intradayData[timestamp]['5. volume'])
  }));

  console.log(`  ✓ Fetched ${newData.length} new data points from API`);

  // Merge with existing data (keep all unique data points)
  const mergedData = mergeHistoricalData(existingData, newData);

  console.log(`  ✓ Total data points after merge: ${mergedData.length} (${mergedData.length - existingData.length} new)`);
  console.log(`  ✓ Date range: ${mergedData[0].datetime} to ${mergedData[mergedData.length-1].datetime}`);

  // Save merged data to cache
  saveToCache(cacheFile, mergedData, ticker, '15min');

  return mergedData;
}

/**
 * Fallback to daily data if intraday not available (WITH CUMULATIVE CACHING)
 */
async function fetchDailyDataFallback(ticker, apiKey, forceRefresh = false) {
  const cacheFile = getCacheFilePath(ticker, 'daily');
  let existingData = [];

  // Load existing cached data
  if (cacheExists(cacheFile)) {
    const meta = getCacheMeta(ticker, 'daily');
    const lastUpdated = meta ? new Date(meta.lastUpdated).toLocaleString() : 'Unknown';
    console.log(`  💾 Found existing daily cache (last updated: ${lastUpdated}, ${meta?.dataPoints || 0} points)`);
    existingData = loadFromCache(cacheFile) || [];
  }

  if (!forceRefresh && existingData.length > 0) {
    console.log(`  ✓ Using cached daily data (${existingData.length} data points)`);
    return existingData;
  }

  console.log(`  🔄 Fetching fresh daily data from API to merge with cache...`);

  const response = await axios.get('https://www.alphavantage.co/query', {
    params: {
      function: 'TIME_SERIES_DAILY',
      symbol: ticker,
      apikey: apiKey,
      outputsize: 'full'
    }
  });

  const dailyData = response.data['Time Series (Daily)'];
  if (!dailyData) {
    throw new Error(`No data available for ${ticker}`);
  }

  const dates = Object.keys(dailyData).sort();
  const newData = dates.map(date => ({
    date: date,
    datetime: date + ' 16:00:00', // Market close time
    open: parseFloat(dailyData[date]['1. open']),
    high: parseFloat(dailyData[date]['2. high']),
    low: parseFloat(dailyData[date]['3. low']),
    close: parseFloat(dailyData[date]['4. close']),
    volume: parseInt(dailyData[date]['5. volume'])
  }));

  console.log(`  ✓ Fetched ${newData.length} daily data points from API`);

  // Merge with existing data
  const mergedData = mergeHistoricalData(existingData, newData);

  console.log(`  ✓ Total data points after merge: ${mergedData.length} (${mergedData.length - existingData.length} new)`);

  // Save merged data to cache
  saveToCache(cacheFile, mergedData, ticker, 'daily');

  return mergedData;
}

/**
 * Calculate technical indicators for a specific date
 * (Uses same logic as server.js)
 * @param {Array} historicalData - Array of OHLCV data
 * @param {number} index - Current index in the data
 * @param {Object} config - Indicator configuration (uses DEFAULT_INDICATOR_CONFIG if not provided)
 */
function calculateIndicators(historicalData, index, config = {}) {
  // Merge provided config with defaults
  const cfg = { ...DEFAULT_INDICATOR_CONFIG, ...config };

  // Optimization: Only slice the most recent data we need (based on longest SMA period)
  // This reduces O(n²) complexity to O(n) for large datasets
  const LOOKBACK = Math.max(cfg.smaLongPeriod, cfg.smaShortPeriod, cfg.macdSlow) + 10;
  const startIdx = Math.max(0, index - LOOKBACK + 1);
  const windowData = historicalData.slice(startIdx, index + 1);

  // Build arrays from the window (reversed so index 0 is most recent)
  const prices = [];
  const highs = [];
  const lows = [];
  const volumes = [];
  const dataPoints = []; // Full data objects in reversed order for time-of-day filters
  for (let i = windowData.length - 1; i >= 0; i--) {
    prices.push(windowData[i].close);
    highs.push(windowData[i].high);
    lows.push(windowData[i].low);
    volumes.push(windowData[i].volume);
    dataPoints.push(windowData[i]);
  }

  const currentPrice = prices[0];
  const currentVolume = volumes[0];
  const currentData = dataPoints[0];

  // RSI
  const rsi = calculateRSI(prices, cfg.rsiPeriod);

  // Williams %R (returns -100 to 0; above -20 = overbought, below -80 = oversold)
  const williamsR = calculateWilliamsR(highs, lows, prices, cfg.williamsRPeriod);

  // Moving Averages
  const smaShort = calculateSMA(prices, cfg.smaShortPeriod);
  const smaLong = calculateSMA(prices, cfg.smaLongPeriod);

  // MACD
  const macd = calculateMACD(prices, cfg.macdFast, cfg.macdSlow);

  // NEW STRATEGY: Buy LOW with reversal UP, Sell HIGH with reversal DOWN
  let score = 50;

  // 1. RSI - Strong contrarian signal (MOST IMPORTANT)
  if (rsi < cfg.rsiOversold) {
    // Oversold = price is LOW → Strong BUY signal
    score += cfg.rsiOversoldScore;
  } else if (rsi < cfg.rsiModerateOversold) {
    // Getting oversold → Moderate BUY signal
    score += cfg.rsiModerateOversoldScore;
  } else if (rsi > cfg.rsiOverbought) {
    // Overbought = price is HIGH → Strong SELL signal
    score += cfg.rsiOverboughtScore;
  } else if (rsi > cfg.rsiModerateOverbought) {
    // Getting overbought → Moderate SELL signal
    score += cfg.rsiModerateOverboughtScore;
  }

  // 1b. Williams %R - Confirms RSI overbought/oversold (range: -100 to 0)
  // Above -20 = Overbought, Below -80 = Oversold
  // CRITICAL: Williams %R is a hard gate - strongly overbought BLOCKS buying
  let williamsRBlock = false;
  if (williamsR > cfg.williamsROverbought) {
    // Strongly overbought - price near period high → NEVER BUY
    score += cfg.williamsROverboughtScore;
    williamsRBlock = true; // Flag to enforce hard cap later
  } else if (williamsR > cfg.williamsRModerateOverbought) {
    // Getting overbought → Strong SELL signal
    score += cfg.williamsRModerateOverboughtScore;
  } else if (williamsR < cfg.williamsROversold) {
    // Strongly oversold - price near period low → BUY signal
    score += cfg.williamsROversoldScore;
  } else if (williamsR < cfg.williamsRModerateOversold) {
    // Getting oversold → Moderate BUY signal
    score += cfg.williamsRModerateOversoldScore;
  }

  // 1c. RSI + Williams %R Agreement (strong confirmation)
  // Both overbought = very strong sell signal
  if (rsi > 65 && williamsR > -25) {
    score -= 20; // Additional penalty when both indicators agree on overbought
  }
  // Both oversold = very strong buy signal
  if (rsi < 35 && williamsR < -75) {
    score += 15; // Additional bonus when both indicators agree on oversold
  }

  // 2. Moving Averages - REVERSED (buy when below, sell when above)
  // Price BELOW averages = CHEAP = Good to BUY
  // Price ABOVE averages = EXPENSIVE = Good to SELL
  if (smaShort && smaLong) {
    const distanceFromShort = ((currentPrice - smaShort) / smaShort) * 100;
    const distanceFromLong = ((currentPrice - smaLong) / smaLong) * 100;

    // Below both averages = undervalued (BUY)
    if (currentPrice < smaShort && currentPrice < smaLong) {
      score += 15;
    }
    // Above both averages = overvalued (SELL)
    else if (currentPrice > smaShort && currentPrice > smaLong) {
      score -= 15;
    }

    // Golden Cross (SMA short crosses above SMA long) = Early uptrend reversal
    if (smaShort > smaLong) {
      const crossoverStrength = ((smaShort - smaLong) / smaLong) * 100;
      if (crossoverStrength < 2) { // Recent crossover
        score += 10;
      }
    }
    // Death Cross (SMA short crosses below SMA long) = Early downtrend reversal
    else if (smaShort < smaLong) {
      const crossoverStrength = ((smaLong - smaShort) / smaLong) * 100;
      if (crossoverStrength < 2) { // Recent crossover
        score -= 10;
      }
    }
  }

  // 3. MACD - Look for REVERSALS not just direction
  if (macd !== null) {
    // MACD turning positive from negative = Early reversal UP (BUY)
    if (macd > -0.5 && macd < 0.5) {
      // Near zero = potential reversal point
      if (macd > 0) score += 8; // Just turned positive
      else score += 5; // About to turn positive
    }
    // MACD strongly negative = downtrend but potential reversal (moderate BUY if oversold)
    else if (macd < -1 && rsi < 40) {
      score += 5; // Strong downtrend meeting oversold = reversal opportunity
    }
    // MACD turning negative from positive = Early reversal DOWN (SELL)
    else if (macd < 0.5 && macd > -0.5) {
      if (macd < 0) score -= 8; // Just turned negative
      else score -= 5; // About to turn negative
    }
    // MACD strongly positive = uptrend but potential reversal (moderate SELL if overbought)
    else if (macd > 1 && rsi > 60) {
      score -= 5; // Strong uptrend meeting overbought = reversal opportunity
    }
  }

  // 4. Recent Momentum - Look for EXHAUSTION not continuation
  const recentPrices = prices.slice(0, 5);
  const momentum = ((recentPrices[0] - recentPrices[4]) / recentPrices[4]) * 100;

  // After big DROP + oversold = BUY opportunity (price is LOW)
  if (momentum < -3 && rsi < 40) {
    score += 12; // Price dropped and oversold = reversal opportunity
  }
  // After big RISE + overbought = SELL opportunity (price is HIGH)
  else if (momentum > 3 && rsi > 60) {
    score -= 12; // Price rose and overbought = reversal opportunity
  }
  // Small negative momentum = potential bottom forming
  else if (momentum < 0 && momentum > -2) {
    score += 5;
  }
  // Small positive momentum = potential top forming
  else if (momentum > 0 && momentum < 2) {
    score -= 5;
  }

  // ============================================
  // 5. FALLING KNIFE PROTECTION FILTERS
  // Prevent buying into continued downtrends
  // ============================================

  // 5a. SELLING PRESSURE FILTER
  // Don't buy on high volume down days - indicates panic selling not exhaustion
  const avgVolume20 = volumes.length >= 20
    ? volumes.slice(0, 20).reduce((a, b) => a + b, 0) / 20
    : currentVolume;
  const volumeRatio = currentVolume / avgVolume20;
  const priceDropToday = dataPoints.length >= 2
    ? ((currentPrice - dataPoints[1].close) / dataPoints[1].close) * 100
    : 0;

  // High volume (1.5x+ average) combined with price drop = selling pressure, reduce buy signal
  if (volumeRatio > 1.5 && priceDropToday < -1) {
    const penaltyFactor = Math.min(volumeRatio - 1, 2); // Cap penalty at 2x
    score -= Math.round(15 * penaltyFactor); // Significant penalty for high volume selling
  }

  // 5b. CONSECUTIVE DOWN PERIODS FILTER
  // Don't buy if we've had 3+ consecutive down periods (catching falling knife)
  let consecutiveDownPeriods = 0;
  for (let i = 0; i < Math.min(5, prices.length - 1); i++) {
    if (prices[i] < prices[i + 1]) {
      consecutiveDownPeriods++;
    } else {
      break; // Stop counting on first up period
    }
  }

  if (consecutiveDownPeriods >= 3) {
    score -= 20; // Strong penalty for buying into sustained downtrend
  } else if (consecutiveDownPeriods === 2) {
    score -= 10; // Moderate penalty
  }

  // 5c. TIME-OF-DAY FILTER (for intraday data)
  // Avoid buying in the last 2 hours of a heavy down day
  const datetime = currentData.datetime || '';
  const timeMatch = datetime.match(/(\d{2}):(\d{2}):\d{2}$/);
  let isMorningSession = false;
  if (timeMatch) {
    const hour = parseInt(timeMatch[1]);
    const minute = parseInt(timeMatch[2]);
    const isLateDay = hour >= 14 || (hour === 13 && minute >= 30); // After 2:30 PM
    isMorningSession = hour < 11; // Before 11 AM

    // If it's late in the day AND we're down significantly today, reduce buy signal
    if (isLateDay && priceDropToday < -1.5) {
      score -= 15; // Late-day sells often continue into next morning
    }
  }

  // 5d. MORNING REVERSAL / GAP-AND-FADE FILTER
  // Detect when price spiked at open but is now falling - classic bull trap
  // Look for: high in first 30 min of day significantly above current price
  let morningReversalBlock = false;
  let dropFromTodayHigh = 0;

  if (isMorningSession && dataPoints.length >= 3) {
    // Find today's high so far (look back up to 6 periods = 1.5 hours of 15-min data)
    const todayDate = currentData.date;
    let todayHigh = currentData.high;
    let periodsToday = 0;

    for (let i = 0; i < Math.min(6, dataPoints.length); i++) {
      if (dataPoints[i].date === todayDate) {
        todayHigh = Math.max(todayHigh, dataPoints[i].high);
        periodsToday++;
      } else {
        break;
      }
    }

    // If we're in morning session and price has dropped significantly from today's high
    dropFromTodayHigh = ((todayHigh - currentPrice) / todayHigh) * 100;

    if (dropFromTodayHigh > 0.8) {
      // Price dropped more than 0.8% from today's high - morning reversal in progress
      // This is a HARD BLOCK - never buy during active morning reversal
      morningReversalBlock = true;
      score -= 30;
    } else if (dropFromTodayHigh > 0.5) {
      // Price dropped more than 0.5% from today's high
      score -= 15;
    }

    // Extra penalty if it's a gap-up day that's fading (opened higher than yesterday's close)
    if (dataPoints.length > periodsToday) {
      const yesterdayClose = dataPoints[periodsToday]?.close;
      // Gap up: today's high > yesterday close by any meaningful amount
      // Fading: current price below today's high (any amount counts)
      if (yesterdayClose && todayHigh > yesterdayClose * 1.005 && currentPrice < todayHigh * 0.995) {
        // Gapped up but now fading - classic bull trap
        // This is also a HARD BLOCK
        morningReversalBlock = true;
        score -= 20;
      }
    }
  }

  score = Math.max(0, Math.min(100, score));

  // HARD CAP: If Williams %R is strongly overbought (> -20), NEVER allow BUY signal
  // Cap score at 55 maximum (below BUY threshold of 60)
  if (williamsR > -20) {
    score = Math.min(score, 55);
  }
  // Also cap at 58 if moderately overbought (> -30)
  else if (williamsR > -30) {
    score = Math.min(score, 58);
  }

  // HARD CAP: Morning reversal in progress - NEVER buy
  // Cap score at 50 maximum (well below BUY threshold)
  if (morningReversalBlock) {
    score = Math.min(score, 50);
  }

  return {
    technicalScore: Math.round(score),
    rsi,
    williamsR,
    sma20: smaShort,  // Keep sma20/sma50 names for backward compatibility
    sma50: smaLong,
    macd,
    currentPrice,
    // Falling knife filter data
    volumeRatio,
    priceDropToday,
    consecutiveDownPeriods,
    williamsRBlock: williamsR > cfg.williamsROverbought,
    morningReversalBlock,
    dropFromTodayHigh
  };
}

// Technical indicator helper functions (copied from server.js)
function calculateRSI(prices, period = 14) {
  if (prices.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateSMA(prices, period) {
  if (prices.length < period) return null;
  const sum = prices.slice(0, period).reduce((a, b) => a + b, 0);
  return sum / period;
}

function calculateMACD(prices, fastPeriod = 12, slowPeriod = 26) {
  const emaFast = calculateEMA(prices, fastPeriod);
  const emaSlow = calculateEMA(prices, slowPeriod);
  if (!emaFast || !emaSlow) return null;
  return emaFast - emaSlow;
}

function calculateEMA(prices, period) {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < Math.min(prices.length, period + 10); i++) {
    ema = (prices[i] * k) + (ema * (1 - k));
  }

  return ema;
}

/**
 * Calculate Williams %R
 * Returns value from -100 to 0
 * Above -20 = Overbought (SELL signal)
 * Below -80 = Oversold (BUY signal)
 */
function calculateWilliamsR(highs, lows, closes, period = 14) {
  if (highs.length < period || lows.length < period || closes.length < period) {
    return -50; // Neutral if not enough data
  }

  const highestHigh = Math.max(...highs.slice(0, period));
  const lowestLow = Math.min(...lows.slice(0, period));
  const currentClose = closes[0];

  if (highestHigh === lowestLow) return -50; // Avoid division by zero

  // Williams %R formula: ((Highest High - Close) / (Highest High - Lowest Low)) * -100
  const williamsR = ((highestHigh - currentClose) / (highestHigh - lowestLow)) * -100;

  return williamsR;
}

/**
 * Generate recommendation based on master score
 * For backtesting, we use technical score only (sentiment/fundamental not available historically)
 * @param {number} technicalScore - The calculated technical score
 * @param {Object} config - Indicator configuration with threshold values
 */
function generateRecommendation(technicalScore, config = {}) {
  const cfg = { ...DEFAULT_INDICATOR_CONFIG, ...config };
  if (technicalScore >= cfg.strongBuyThreshold) return 'STRONG BUY';
  if (technicalScore >= cfg.buyThreshold) return 'BUY';
  if (technicalScore < cfg.sellThreshold && technicalScore >= cfg.strongSellThreshold) return 'SELL';
  if (technicalScore < cfg.strongSellThreshold) return 'STRONG SELL';
  return 'HOLD';
}

/**
 * Generate human-readable rationale for trade decision (PROFIT-AWARE REVERSAL STRATEGY)
 */
function generateRationale(recommendation, indicators, currentPrice, action, profitPercent) {
  const reasons = [];

  // For SELL trades, lead with profit/loss context
  if (action === 'SELL') {
    if (profitPercent >= 3) {
      reasons.push(`locking in ${profitPercent.toFixed(1)}% profit`);
    } else if (profitPercent <= -8) {
      reasons.push(`triggering stop-loss to limit ${Math.abs(profitPercent).toFixed(1)}% loss`);
    } else if (profitPercent > 0) {
      reasons.push(`taking ${profitPercent.toFixed(1)}% profit`);
    } else {
      reasons.push(`cutting ${Math.abs(profitPercent).toFixed(1)}% loss (emergency exit)`);
    }
  }

  // RSI reasoning - CONTRARIAN
  if (indicators.rsi < 30) {
    reasons.push('stock is deeply oversold (RSI below 30) - price has dropped significantly and shows reversal potential');
  } else if (indicators.rsi < 40) {
    reasons.push('stock is oversold (RSI below 40) - price is low and approaching reversal zone');
  } else if (indicators.rsi > 70) {
    reasons.push('stock is overbought (RSI above 70) - price has risen significantly and shows reversal risk');
  } else if (indicators.rsi > 60) {
    reasons.push('stock is getting overbought (RSI above 60) - price is elevated and approaching reversal zone');
  }

  // Williams %R reasoning (range: -100 to 0)
  if (indicators.williamsR !== undefined) {
    if (indicators.williamsR > -20) {
      reasons.push(`Williams %R at ${indicators.williamsR.toFixed(0)} (strongly overbought - price near 14-day high)`);
    } else if (indicators.williamsR > -30) {
      reasons.push(`Williams %R at ${indicators.williamsR.toFixed(0)} (getting overbought)`);
    } else if (indicators.williamsR < -80) {
      reasons.push(`Williams %R at ${indicators.williamsR.toFixed(0)} (strongly oversold - price near 14-day low)`);
    } else if (indicators.williamsR < -70) {
      reasons.push(`Williams %R at ${indicators.williamsR.toFixed(0)} (getting oversold)`);
    }
  }

  // Moving average reasoning - REVERSED (buy when below = cheap, sell when above = expensive)
  if (indicators.sma20 && indicators.sma50) {
    if (currentPrice < indicators.sma20 && currentPrice < indicators.sma50) {
      const pctBelow = Math.abs(((currentPrice - indicators.sma50) / indicators.sma50) * 100);
      reasons.push(`price is ${pctBelow.toFixed(1)}% below moving averages (undervalued)`);
    } else if (currentPrice > indicators.sma20 && currentPrice > indicators.sma50) {
      const pctAbove = ((currentPrice - indicators.sma50) / indicators.sma50) * 100;
      reasons.push(`price is ${pctAbove.toFixed(1)}% above moving averages (overvalued)`);
    }

    // Golden/Death Cross
    if (indicators.sma20 > indicators.sma50) {
      const crossover = ((indicators.sma20 - indicators.sma50) / indicators.sma50) * 100;
      if (crossover < 2) {
        reasons.push('golden cross detected (early uptrend reversal)');
      }
    } else if (indicators.sma20 < indicators.sma50) {
      const crossover = ((indicators.sma50 - indicators.sma20) / indicators.sma50) * 100;
      if (crossover < 2) {
        reasons.push('death cross detected (early downtrend reversal)');
      }
    }
  }

  // MACD reasoning - REVERSALS
  if (indicators.macd !== null) {
    if (indicators.macd > -0.5 && indicators.macd < 0.5) {
      if (indicators.macd > 0) {
        reasons.push('MACD just turned positive (early momentum reversal up)');
      } else {
        reasons.push('MACD near zero turning positive (impending upward reversal)');
      }
    } else if (indicators.macd < -1 && indicators.rsi < 40) {
      reasons.push('strong downtrend + oversold = high-probability reversal setup');
    } else if (indicators.macd > 1 && indicators.rsi > 60) {
      reasons.push('strong uptrend + overbought = momentum exhaustion');
    }
  }

  // Falling knife filter reasoning (for HOLD signals that could have been BUY)
  if (action === 'BUY' || recommendation === 'HOLD') {
    if (indicators.volumeRatio > 1.5 && indicators.priceDropToday < -1) {
      reasons.push(`high selling pressure detected (${indicators.volumeRatio.toFixed(1)}x avg volume on ${Math.abs(indicators.priceDropToday).toFixed(1)}% drop)`);
    }
    if (indicators.consecutiveDownPeriods >= 3) {
      reasons.push(`${indicators.consecutiveDownPeriods} consecutive down periods (falling knife risk)`);
    } else if (indicators.consecutiveDownPeriods === 2) {
      reasons.push('2 consecutive down periods (caution advised)');
    }
  }

  // Build summary sentence
  if (reasons.length === 0) {
    return `Technical indicators suggest a ${recommendation} position - waiting for clearer signals.`;
  }

  return `${reasons[0].charAt(0).toUpperCase() + reasons[0].slice(1)}${reasons.length > 1 ? ', and ' + reasons.slice(1).join(', and ') : ''}.`;
}

/**
 * Run backtest simulation
 * @param {Object} config - Backtest configuration
 * @param {Object} config.dataSource - Optional data source: { type: 'file', path: '/path/to/file.csv', resampleMinutes: 30 } or { type: 'api' }
 * @param {Object} config.indicatorConfig - Optional indicator configuration (overrides DEFAULT_INDICATOR_CONFIG)
 */
async function runBacktest(config) {
  const {
    tickers,
    startDate,
    endDate,
    initialInvestment, // Per stock
    buyPercentages, // { 'STRONG BUY': 100, 'BUY': 100, 'SELL': 100, 'STRONG SELL': 100 }
    apiKey,
    forceRefresh = false,
    dataSource = { type: 'api' }, // Default to API if not specified
    indicatorConfig = {} // User-provided indicator config overrides
  } = config;

  // Merge user config with defaults
  const indConfig = { ...DEFAULT_INDICATOR_CONFIG, ...indicatorConfig };

  console.log(`\n🔄 Starting backtest for ${tickers.length} stocks...`);
  console.log(`📅 Period: ${startDate} to ${endDate}`);
  console.log(`💰 Initial investment per stock: £${initialInvestment}`);
  console.log(`📁 Data source: ${dataSource.type === 'file' ? `CSV file (${dataSource.path})` : 'API/Cache'}`);
  if (forceRefresh && dataSource.type === 'api') {
    console.log(`🔄 Force refresh: Fetching fresh data from API`);
  }

  const results = [];

  for (const ticker of tickers) {
    console.log(`\n📊 Processing ${ticker}...`);

    try {
      // Fetch historical data based on data source type
      let historicalData;
      if (dataSource.type === 'file') {
        historicalData = loadHistoricalDataFromCSV(dataSource.path, dataSource.resampleMinutes);
      } else {
        historicalData = await fetchHistoricalData(ticker, apiKey, startDate, endDate, forceRefresh);
      }

      // Filter by date range
      const filteredData = historicalData.filter(d => {
        return d.date >= startDate && d.date <= endDate;
      });

      if (filteredData.length === 0) {
        throw new Error(`No data in range for ${ticker}`);
      }

      console.log(`  ✓ Filtered to ${filteredData.length} data points in backtest range`);

      // Run simulation
      const simulation = simulateTrades(ticker, filteredData, historicalData, initialInvestment, buyPercentages, indConfig);
      results.push(simulation);

      console.log(`  ✓ Final value: £${simulation.finalValue.toFixed(2)} (${simulation.returnPercent >= 0 ? '+' : ''}${simulation.returnPercent.toFixed(2)}%)`);

    } catch (error) {
      console.error(`  ❌ Error processing ${ticker}:`, error.message);
      results.push({
        ticker,
        error: error.message
      });
    }
  }

  // Calculate portfolio summary
  const summary = calculatePortfolioSummary(results, initialInvestment);

  return {
    config,
    results,
    summary,
    completedAt: new Date().toISOString()
  };
}

/**
 * Simulate trades for a single stock
 * @param {Object} indConfig - Indicator configuration
 */
function simulateTrades(ticker, tradingData, fullHistoricalData, initialInvestment, buyPercentages, indConfig = {}) {
  let cash = initialInvestment;
  let shares = 0;
  let averageBuyPrice = 0; // Track our entry price
  const trades = [];

  // For buy-and-hold comparison
  const startPrice = tradingData[0].close;
  const endPrice = tradingData[tradingData.length - 1].close;
  const buyAndHoldShares = initialInvestment / startPrice;
  const buyAndHoldValue = buyAndHoldShares * endPrice;

  // Enhanced exit tracking variables
  let highestPriceSinceEntry = 0;  // For trailing stop-loss
  let currentDayHigh = 0;          // For intraday reversal detection
  let currentDay = null;           // Track day changes

  // Simulate intraday checks (every 15 minutes)
  for (let i = 0; i < tradingData.length; i++) {
    const currentDatetime = tradingData[i].datetime;
    const currentDate = tradingData[i].date;
    const currentPrice = tradingData[i].close;
    const currentHigh = tradingData[i].high;
    const currentVolume = tradingData[i].volume;

    // Reset intraday high on new day
    if (currentDate !== currentDay) {
      currentDay = currentDate;
      currentDayHigh = currentHigh;
    } else {
      currentDayHigh = Math.max(currentDayHigh, currentHigh);
    }

    // Update highest price since entry (for trailing stop)
    if (shares > 0) {
      highestPriceSinceEntry = Math.max(highestPriceSinceEntry, currentHigh);
    }

    // Find index in full historical data (need lookback for indicators)
    const fullDataIndex = fullHistoricalData.findIndex(d => d.datetime === currentDatetime);

    if (fullDataIndex === -1 || fullDataIndex < 50) continue; // Need enough history for indicators

    // Calculate indicators (now includes volume analysis)
    const indicators = calculateIndicators(fullHistoricalData, fullDataIndex, indConfig);
    const recommendation = generateRecommendation(indicators.technicalScore, indConfig);

    // Calculate profit/loss if we have shares
    const profitPercent = shares > 0 ? ((currentPrice - averageBuyPrice) / averageBuyPrice) * 100 : 0;

    // Calculate volume metrics for enhanced exit signals
    const recentVolumes = fullHistoricalData.slice(Math.max(0, fullDataIndex - 20), fullDataIndex + 1).map(d => d.volume);
    const avgVolume = recentVolumes.length > 0 ? recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length : currentVolume;

    // Get recent price high for volume divergence check
    const recentData = fullHistoricalData.slice(Math.max(0, fullDataIndex - 10), fullDataIndex + 1);
    const recentHigh = Math.max(...recentData.map(d => d.high));

    // Execute trades based on recommendation
    // BUY FILTER: Don't buy when extremely overbought (RSI > 75 AND Williams %R > -10)
    // This allows buying during normal uptrends but avoids buying at extreme tops
    const extremelyOverbought = indicators.rsi > 75 && indicators.williamsR && indicators.williamsR > -10;

    if ((recommendation === 'STRONG BUY' || recommendation === 'BUY') && cash > 0 && !extremelyOverbought) {
      const percentage = buyPercentages[recommendation] || 100;
      const investAmount = (cash * percentage) / 100;
      const sharesToBuy = Math.floor(investAmount / currentPrice);

      if (sharesToBuy > 0) {
        const cost = sharesToBuy * currentPrice;

        // Update average buy price
        const totalCost = (shares * averageBuyPrice) + cost;
        shares += sharesToBuy;
        averageBuyPrice = totalCost / shares;
        cash -= cost;

        // Reset trailing stop tracker on new/additional purchase
        highestPriceSinceEntry = currentPrice;

        const rationale = generateRationale(recommendation, indicators, currentPrice, 'BUY', 0);

        trades.push({
          date: currentDate,
          datetime: currentDatetime,
          action: 'BUY',
          recommendation,
          shares: sharesToBuy,
          price: currentPrice,
          cost,
          technicalScore: indicators.technicalScore,
          portfolioValue: cash + (shares * currentPrice),
          rationale,
          indicators: {
            rsi: indicators.rsi.toFixed(2),
            williamsR: indicators.williamsR?.toFixed(2) || 'N/A',
            sma20: indicators.sma20?.toFixed(2) || 'N/A',
            sma50: indicators.sma50?.toFixed(2) || 'N/A',
            macd: indicators.macd?.toFixed(2) || 'N/A',
            price: currentPrice.toFixed(2)
          }
        });
      }
    } else if (shares > 0) {
      // ENHANCED PROFIT-AWARE SELLING LOGIC with 6 exit strategies
      let shouldSell = false;
      let exitReason = '';

      // Only check enhanced exits when we have a SELL/STRONG SELL recommendation OR profit conditions met
      const hasSellSignal = recommendation === 'STRONG SELL' || recommendation === 'SELL';

      // 1. TAKE PROFIT - requires sell signal AND RSI not oversold (don't sell bounces)
      // Raised threshold to 3% and require RSI > 45 to avoid selling during reversals
      if (profitPercent >= 3 && hasSellSignal && indicators.rsi > 45) {
        shouldSell = true;
        exitReason = 'take-profit (3%+ gain)';
      }

      // 2. STOP LOSS (unchanged at -8%) - triggers regardless of signal
      if (profitPercent <= -8) {
        shouldSell = true;
        exitReason = 'stop-loss (-8% loss)';
      }

      // 2b. TAKE PROFIT at higher threshold (5%+) - can trigger without sell signal
      // But don't sell if RSI is deeply oversold (< 35) - could be a major reversal
      if (profitPercent >= 5 && indicators.rsi > 35) {
        shouldSell = true;
        exitReason = 'take-profit (5%+ gain)';
      }

      // 3. TRAILING STOP-LOSS (activates at 1.5% profit, trails 1% below highest)
      if (profitPercent > 1.5 && highestPriceSinceEntry > 0) {
        const trailingStop = highestPriceSinceEntry * 0.99; // 1% below highest
        if (currentPrice < trailingStop) {
          shouldSell = true;
          exitReason = `trailing stop (price fell below ${trailingStop.toFixed(2)})`;
        }
      }

      // 4. RSI-BASED PROFIT TAKING
      // Only trigger if Williams %R also confirms overbought (not oversold)
      const williamsRConfirmsOverbought = indicators.williamsR > -50; // Not in oversold territory
      if (indicators.rsi > 70 && profitPercent > 0 && williamsRConfirmsOverbought) {
        shouldSell = true;
        exitReason = `RSI overbought (${indicators.rsi.toFixed(1)}) + in profit`;
      } else if (indicators.rsi > 65 && profitPercent > 1 && williamsRConfirmsOverbought) {
        shouldSell = true;
        exitReason = `RSI elevated (${indicators.rsi.toFixed(1)}) + 1%+ profit`;
      }

      // 5. VOLUME DIVERGENCE (declining volume at price highs)
      // Only trigger with stronger confirmation: RSI > 55, profit > 2%, and MACD turning negative
      const volumeDecreasing = currentVolume < avgVolume * 0.6; // More significant volume drop
      const priceNearHigh = currentPrice > recentHigh * 0.995;
      const rsiElevated = indicators.rsi > 55; // Higher RSI threshold
      const macdWeakening = indicators.macd !== null && indicators.macd < 0.5;
      if (volumeDecreasing && priceNearHigh && profitPercent > 2 && hasSellSignal && rsiElevated && macdWeakening) {
        shouldSell = true;
        exitReason = 'volume divergence (low volume at highs)';
      }

      // 6. INTRADAY REVERSAL (1.5% drop from day's high)
      // Require: larger drop (1.5%), RSI not oversold (> 45), and some profit (> 0.5%)
      const dropFromDayHigh = currentDayHigh > 0 ? ((currentDayHigh - currentPrice) / currentDayHigh) * 100 : 0;
      const rsiAllowsIntradaySell = indicators.rsi > 45;
      if (dropFromDayHigh > 1.5 && profitPercent > 0.5 && hasSellSignal && rsiAllowsIntradaySell) {
        shouldSell = true;
        exitReason = `intraday reversal (${dropFromDayHigh.toFixed(1)}% drop from day high)`;
      }

      // 7. VOLUME SPIKE DETECTION (distribution signal)
      // Only trigger when RSI is elevated (> 60) AND Williams %R confirms overbought
      // This avoids selling during oversold bounces with high volume
      const volumeSpike = currentVolume > avgVolume * 2.5; // Higher threshold
      const nearRecentHigh = currentPrice > recentHigh * 0.98;
      const rsiOverbought = indicators.rsi > 60;
      const williamsConfirms = indicators.williamsR && indicators.williamsR > -40;
      if (volumeSpike && nearRecentHigh && profitPercent > 1.5 && hasSellSignal && rsiOverbought && williamsConfirms) {
        shouldSell = true;
        exitReason = 'distribution volume spike at highs';
      }

      // 8. EMERGENCY EXIT - only when multiple indicators confirm overbought
      // Require: STRONG SELL + RSI > 75 + Williams %R confirms (not oversold)
      // Do NOT trigger if: Williams %R is oversold OR price is undervalued (below MAs)
      const priceUndervalued = indicators.sma50 && currentPrice < indicators.sma50;
      const williamsROversold = indicators.williamsR < -70;

      if (recommendation === 'STRONG SELL' && indicators.rsi > 75 &&
          !williamsROversold && !priceUndervalued) {
        shouldSell = true;
        exitReason = 'emergency exit (STRONG SELL + RSI > 75 + confirmed)';
      }

      // Determine if this is an unconditional exit (stop-loss or high take-profit)
      const isUnconditionalExit = exitReason.includes('stop-loss') || exitReason.includes('5%+ gain');

      if (shouldSell && (hasSellSignal || isUnconditionalExit)) {
        // For unconditional exits, sell 100%; for signal-based exits, use configured percentage
        const percentage = isUnconditionalExit ? 100 : (buyPercentages[recommendation] || 100);
        const sharesToSell = Math.floor(shares * percentage / 100);

        if (sharesToSell > 0) {
          const proceeds = sharesToSell * currentPrice;
          const sellProfit = (currentPrice - averageBuyPrice) * sharesToSell;
          const sellProfitPercent = ((currentPrice - averageBuyPrice) / averageBuyPrice) * 100;

          shares -= sharesToSell;
          cash += proceeds;

          // Reset tracking variables if position fully closed
          if (shares === 0) {
            averageBuyPrice = 0;
            highestPriceSinceEntry = 0;
          }

          // Generate rationale with exit reason
          const baseRationale = generateRationale(recommendation, indicators, currentPrice, 'SELL', sellProfitPercent);
          const rationale = `Exit: ${exitReason}. ${baseRationale}`;

          trades.push({
            date: currentDate,
            datetime: currentDatetime,
            action: 'SELL',
            recommendation,
            exitReason, // New field to track which exit strategy triggered
            shares: sharesToSell,
            price: currentPrice,
            proceeds,
            profit: sellProfit,
            profitPercent: sellProfitPercent,
            technicalScore: indicators.technicalScore,
            portfolioValue: cash + (shares * currentPrice),
            rationale,
            indicators: {
              rsi: indicators.rsi.toFixed(2),
              sma20: indicators.sma20?.toFixed(2) || 'N/A',
              sma50: indicators.sma50?.toFixed(2) || 'N/A',
              macd: indicators.macd?.toFixed(2) || 'N/A',
              price: currentPrice.toFixed(2)
            }
          });
        }
      }
    }
  }

  // Final portfolio value
  const finalValue = cash + (shares * endPrice);
  const returnPercent = ((finalValue - initialInvestment) / initialInvestment) * 100;
  const buyAndHoldReturn = ((buyAndHoldValue - initialInvestment) / initialInvestment) * 100;

  // Sample price history for charting (max 500 data points to keep response size manageable)
  const maxChartPoints = 500;
  const sampleInterval = Math.max(1, Math.floor(tradingData.length / maxChartPoints));
  const priceHistory = [];

  for (let i = 0; i < tradingData.length; i += sampleInterval) {
    const d = tradingData[i];
    priceHistory.push({
      datetime: d.datetime || d.date,
      close: d.close,
      high: d.high,
      low: d.low
    });
  }

  // Ensure we include the last data point
  if (priceHistory.length > 0 && priceHistory[priceHistory.length - 1].datetime !== tradingData[tradingData.length - 1].datetime) {
    const lastData = tradingData[tradingData.length - 1];
    priceHistory.push({
      datetime: lastData.datetime || lastData.date,
      close: lastData.close,
      high: lastData.high,
      low: lastData.low
    });
  }

  return {
    ticker,
    initialInvestment,
    finalValue,
    returnPercent,
    totalTrades: trades.length,
    buyTrades: trades.filter(t => t.action === 'BUY').length,
    sellTrades: trades.filter(t => t.action === 'SELL').length,
    finalCash: cash,
    finalShares: shares,
    finalShareValue: shares * endPrice,
    trades,
    priceHistory, // Added for charting
    buyAndHold: {
      finalValue: buyAndHoldValue,
      returnPercent: buyAndHoldReturn,
      shares: buyAndHoldShares
    },
    outperformance: returnPercent - buyAndHoldReturn
  };
}

/**
 * Calculate overall portfolio summary
 */
function calculatePortfolioSummary(results, initialInvestmentPerStock) {
  const successfulResults = results.filter(r => !r.error);

  if (successfulResults.length === 0) {
    return { error: 'No successful backtests' };
  }

  const totalInitial = initialInvestmentPerStock * successfulResults.length;
  const totalFinal = successfulResults.reduce((sum, r) => sum + r.finalValue, 0);
  const totalReturn = ((totalFinal - totalInitial) / totalInitial) * 100;

  const totalBuyAndHold = successfulResults.reduce((sum, r) => sum + r.buyAndHold.finalValue, 0);
  const buyAndHoldReturn = ((totalBuyAndHold - totalInitial) / totalInitial) * 100;

  const totalTrades = successfulResults.reduce((sum, r) => sum + r.totalTrades, 0);

  return {
    totalStocks: successfulResults.length,
    totalInitialInvestment: totalInitial,
    totalFinalValue: totalFinal,
    totalReturnPercent: totalReturn,
    totalProfit: totalFinal - totalInitial,
    totalTrades,
    buyAndHold: {
      finalValue: totalBuyAndHold,
      returnPercent: buyAndHoldReturn,
      profit: totalBuyAndHold - totalInitial
    },
    outperformance: totalReturn - buyAndHoldReturn,
    bestPerformer: successfulResults.reduce((best, r) =>
      r.returnPercent > best.returnPercent ? r : best
    ),
    worstPerformer: successfulResults.reduce((worst, r) =>
      r.returnPercent < worst.returnPercent ? r : worst
    )
  };
}

module.exports = {
  runBacktest,
  fetchHistoricalData,
  loadHistoricalDataFromCSV,
  DEFAULT_INDICATOR_CONFIG
};
