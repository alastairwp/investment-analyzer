/**
 * Real-Time Price Monitor Service
 * Fetches live prices from AlphaVantage API every 30 minutes
 * Calculates technical indicators and sends email alerts for buy/sell signals
 */

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Configuration - loaded from environment or config file
const CONFIG_FILE = path.join(__dirname, 'monitor-config.json');
const LOG_FILE = path.join(__dirname, 'monitor.log');
const MAX_LOG_LINES = 1000; // Keep last 1000 log entries

/**
 * Write to log file with timestamp
 */
function writeLog(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...(data && { data })
  };

  const logLine = JSON.stringify(logEntry) + '\n';

  // Append to log file
  fs.appendFileSync(LOG_FILE, logLine);

  // Also log to console
  const consoleMsg = `[${timestamp}] [${level}] ${message}`;
  if (level === 'ERROR') {
    console.error(consoleMsg, data || '');
  } else {
    console.log(consoleMsg, data ? JSON.stringify(data) : '');
  }
}

/**
 * Read log file and return entries
 */
function readLogs(limit = 100) {
  try {
    if (!fs.existsSync(LOG_FILE)) {
      return [];
    }

    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = content.trim().split('\n').filter(line => line);

    // Get last N entries
    const entries = lines.slice(-limit).map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return { raw: line };
      }
    });

    return entries.reverse(); // Most recent first
  } catch (error) {
    console.error('Error reading logs:', error.message);
    return [];
  }
}

/**
 * Clear old log entries to prevent file from growing too large
 */
function trimLogFile() {
  try {
    if (!fs.existsSync(LOG_FILE)) return;

    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = content.trim().split('\n').filter(line => line);

    if (lines.length > MAX_LOG_LINES) {
      const trimmed = lines.slice(-MAX_LOG_LINES).join('\n') + '\n';
      fs.writeFileSync(LOG_FILE, trimmed);
      writeLog('INFO', `Log file trimmed to ${MAX_LOG_LINES} entries`);
    }
  } catch (error) {
    console.error('Error trimming log file:', error.message);
  }
}

// Default configuration
const DEFAULT_CONFIG = {
  tickers: ['AAPL', 'MSFT', 'GOOGL'],
  intervalMinutes: 30,
  alphaVantageApiKey: process.env.ALPHA_VANTAGE_API_KEY || process.env.ALPHAVANTAGE_API_KEY || '',
  email: {
    enabled: false,
    service: 'gmail',
    user: process.env.EMAIL_USER || '',
    password: process.env.EMAIL_PASSWORD || '', // Gmail App Password
    recipient: process.env.EMAIL_RECIPIENT || ''
  },
  // Alert thresholds
  alertOnStrongBuy: true,
  alertOnBuy: true,
  alertOnStrongSell: true,
  alertOnSell: false, // Only alert on strong signals by default
  // Minimum score change to trigger alert (prevents spam)
  minScoreChange: 10
};

// Load or create config
function loadConfig() {
  try {
    const envApiKey = process.env.ALPHA_VANTAGE_API_KEY || process.env.ALPHAVANTAGE_API_KEY || '';
    if (fs.existsSync(CONFIG_FILE)) {
      const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      const config = { ...DEFAULT_CONFIG, ...saved, email: { ...DEFAULT_CONFIG.email, ...saved.email } };
      // Always use env API key if available
      if (envApiKey) {
        config.alphaVantageApiKey = envApiKey;
      }
      return config;
    }
    return { ...DEFAULT_CONFIG, alphaVantageApiKey: envApiKey };
  } catch (err) {
    console.error('Error loading config:', err.message);
  }
  return DEFAULT_CONFIG;
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// In-memory storage for price history and last signals
const priceHistory = {}; // { ticker: [{ datetime, open, high, low, close, volume }] }
const lastSignals = {};  // { ticker: { recommendation, score, datetime } }
const alertHistory = []; // Array of sent alerts

/**
 * Fetch daily prices from AlphaVantage (free tier compatible)
 */
async function fetchDailyPrices(ticker, apiKey) {
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${ticker}&outputsize=compact&apikey=${apiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data['Error Message']) {
      throw new Error(data['Error Message']);
    }

    if (data['Note']) {
      throw new Error('API rate limit reached. Please wait and try again.');
    }

    const timeSeries = data['Time Series (Daily)'];
    if (!timeSeries) {
      throw new Error('No data returned from API');
    }

    // Convert to our format
    const prices = Object.entries(timeSeries).map(([date, values]) => ({
      datetime: date,
      date: date,
      open: parseFloat(values['1. open']),
      high: parseFloat(values['2. high']),
      low: parseFloat(values['3. low']),
      close: parseFloat(values['4. close']),
      volume: parseInt(values['5. volume'])
    })).sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

    return prices;
  } catch (error) {
    console.error(`Error fetching ${ticker}:`, error.message);
    throw error;
  }
}

/**
 * Calculate technical indicators (reusing logic from backtestEngine)
 */
function calculateIndicators(data, index, config = {}) {
  const rsiPeriod = config.rsiPeriod || 14;
  const smaShortPeriod = config.smaShortPeriod || 20;
  const smaLongPeriod = config.smaLongPeriod || 50;
  const macdFast = config.macdFast || 12;
  const macdSlow = config.macdSlow || 26;
  const williamsRPeriod = config.williamsRPeriod || 14;

  // Get price slices
  const prices = data.slice(0, index + 1);
  const closes = prices.map(p => p.close);
  const currentPrice = closes[closes.length - 1];

  // RSI Calculation
  let rsi = 50;
  if (closes.length >= rsiPeriod + 1) {
    const changes = [];
    for (let i = closes.length - rsiPeriod; i < closes.length; i++) {
      changes.push(closes[i] - closes[i - 1]);
    }
    const gains = changes.filter(c => c > 0);
    const losses = changes.filter(c => c < 0).map(c => Math.abs(c));
    const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / rsiPeriod : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / rsiPeriod : 0;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi = 100 - (100 / (1 + rs));
  }

  // Williams %R
  let williamsR = -50;
  if (prices.length >= williamsRPeriod) {
    const recentPrices = prices.slice(-williamsRPeriod);
    const highestHigh = Math.max(...recentPrices.map(p => p.high));
    const lowestLow = Math.min(...recentPrices.map(p => p.low));
    if (highestHigh !== lowestLow) {
      williamsR = ((highestHigh - currentPrice) / (highestHigh - lowestLow)) * -100;
    }
  }

  // SMAs
  const sma20 = closes.length >= smaShortPeriod ?
    closes.slice(-smaShortPeriod).reduce((a, b) => a + b, 0) / smaShortPeriod : null;
  const sma50 = closes.length >= smaLongPeriod ?
    closes.slice(-smaLongPeriod).reduce((a, b) => a + b, 0) / smaLongPeriod : null;

  // MACD (simplified)
  let macd = null;
  if (closes.length >= macdSlow) {
    const emaFast = closes.slice(-macdFast).reduce((a, b) => a + b, 0) / macdFast;
    const emaSlow = closes.slice(-macdSlow).reduce((a, b) => a + b, 0) / macdSlow;
    macd = emaFast - emaSlow;
  }

  // Calculate technical score
  let score = 50;

  // RSI scoring
  if (rsi < 30) score += 25;
  else if (rsi < 40) score += 15;
  else if (rsi > 70) score -= 25;
  else if (rsi > 60) score -= 15;

  // Williams %R scoring
  if (williamsR < -80) score += 20;
  else if (williamsR < -70) score += 10;
  else if (williamsR > -20) score -= 30;
  else if (williamsR > -30) score -= 15;

  // SMA scoring
  if (sma20 && sma50) {
    if (currentPrice < sma20 && currentPrice < sma50) score += 15;
    else if (currentPrice > sma20 && currentPrice > sma50) score -= 15;
    if (sma20 > sma50) score += 5; // Golden cross tendency
    else if (sma20 < sma50) score -= 5; // Death cross tendency
  }

  // MACD scoring
  if (macd !== null) {
    if (macd > 0) score += 10;
    else if (macd < 0) score -= 10;
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  return {
    rsi,
    williamsR,
    sma20,
    sma50,
    macd,
    technicalScore: score,
    price: currentPrice
  };
}

/**
 * Generate recommendation from score
 */
function getRecommendation(score) {
  if (score >= 75) return 'STRONG BUY';
  if (score >= 60) return 'BUY';
  if (score <= 30) return 'STRONG SELL';
  if (score <= 45) return 'SELL';
  return 'HOLD';
}

/**
 * Send email alert
 */
async function sendEmailAlert(config, ticker, signal, indicators) {
  if (!config.email.enabled || !config.email.user || !config.email.password) {
    console.log('Email not configured, skipping alert');
    return false;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: config.email.user,
      pass: config.email.password
    }
  });

  const isPositive = signal.recommendation.includes('BUY');
  const emoji = isPositive ? '🟢' : '🔴';
  const action = isPositive ? 'BUY' : 'SELL';

  const subject = `${emoji} ${signal.recommendation}: ${ticker} @ $${indicators.price.toFixed(2)}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: ${isPositive ? '#10b981' : '#ef4444'};">
        ${emoji} ${signal.recommendation} Signal for ${ticker}
      </h2>

      <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0;">Current Price: $${indicators.price.toFixed(2)}</h3>
        <p><strong>Technical Score:</strong> ${signal.score}/100</p>
        <p><strong>Recommendation:</strong> ${signal.recommendation}</p>
        <p><strong>Time:</strong> ${signal.datetime}</p>
      </div>

      <h3>Technical Indicators</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr style="background: #e5e7eb;">
          <td style="padding: 8px; border: 1px solid #d1d5db;"><strong>RSI</strong></td>
          <td style="padding: 8px; border: 1px solid #d1d5db;">${indicators.rsi.toFixed(1)} ${indicators.rsi < 30 ? '(Oversold)' : indicators.rsi > 70 ? '(Overbought)' : ''}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #d1d5db;"><strong>Williams %R</strong></td>
          <td style="padding: 8px; border: 1px solid #d1d5db;">${indicators.williamsR.toFixed(1)} ${indicators.williamsR < -80 ? '(Oversold)' : indicators.williamsR > -20 ? '(Overbought)' : ''}</td>
        </tr>
        <tr style="background: #e5e7eb;">
          <td style="padding: 8px; border: 1px solid #d1d5db;"><strong>SMA 20</strong></td>
          <td style="padding: 8px; border: 1px solid #d1d5db;">${indicators.sma20 ? '$' + indicators.sma20.toFixed(2) : 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #d1d5db;"><strong>SMA 50</strong></td>
          <td style="padding: 8px; border: 1px solid #d1d5db;">${indicators.sma50 ? '$' + indicators.sma50.toFixed(2) : 'N/A'}</td>
        </tr>
        <tr style="background: #e5e7eb;">
          <td style="padding: 8px; border: 1px solid #d1d5db;"><strong>MACD</strong></td>
          <td style="padding: 8px; border: 1px solid #d1d5db;">${indicators.macd ? indicators.macd.toFixed(3) : 'N/A'}</td>
        </tr>
      </table>

      <div style="margin-top: 20px; padding: 15px; background: ${isPositive ? '#d1fae5' : '#fee2e2'}; border-radius: 8px;">
        <strong>Suggested Action:</strong> Consider ${action.toLowerCase()}ing ${ticker} based on current technical analysis.
        <br><br>
        <small style="color: #6b7280;">This is an automated alert. Always do your own research before trading.</small>
      </div>

      <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
      <p style="color: #9ca3af; font-size: 12px;">
        Investment Analyzer - Real-Time Monitor<br>
        Sent at ${new Date().toISOString()}
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: config.email.user,
      to: config.email.recipient,
      subject,
      html
    });
    console.log(`Email alert sent for ${ticker}: ${signal.recommendation}`);
    return true;
  } catch (error) {
    console.error('Failed to send email:', error.message);
    return false;
  }
}

/**
 * Check if we should send an alert
 */
function shouldAlert(config, ticker, newSignal) {
  const lastSignal = lastSignals[ticker];

  // Check if alert type is enabled
  const alertEnabled = {
    'STRONG BUY': config.alertOnStrongBuy,
    'BUY': config.alertOnBuy,
    'STRONG SELL': config.alertOnStrongSell,
    'SELL': config.alertOnSell,
    'HOLD': false
  };

  if (!alertEnabled[newSignal.recommendation]) {
    return false;
  }

  // If no previous signal, alert on any actionable signal
  if (!lastSignal) {
    return true;
  }

  // Alert if recommendation changed
  if (lastSignal.recommendation !== newSignal.recommendation) {
    return true;
  }

  // Alert if score changed significantly
  if (Math.abs(newSignal.score - lastSignal.score) >= config.minScoreChange) {
    return true;
  }

  return false;
}

/**
 * Monitor a single ticker
 */
async function monitorTicker(ticker, config) {
  writeLog('INFO', `Fetching daily price data for ${ticker}`);

  try {
    // Fetch latest daily prices (free tier compatible)
    const prices = await fetchDailyPrices(ticker, config.alphaVantageApiKey);

    if (prices.length < 50) {
      writeLog('WARN', `Not enough data for ${ticker}`, { dataPoints: prices.length });
      return null;
    }

    // Store in history
    priceHistory[ticker] = prices;

    // Calculate indicators for latest price
    const latestIndex = prices.length - 1;
    const indicators = calculateIndicators(prices, latestIndex);
    const recommendation = getRecommendation(indicators.technicalScore);

    const signal = {
      ticker,
      datetime: prices[latestIndex].datetime,
      recommendation,
      score: indicators.technicalScore,
      price: indicators.price,
      indicators
    };

    // Log price received
    writeLog('PRICE', `${ticker} price received`, {
      ticker,
      price: indicators.price.toFixed(2),
      score: indicators.technicalScore,
      recommendation,
      rsi: indicators.rsi.toFixed(1),
      williamsR: indicators.williamsR.toFixed(1),
      datetime: prices[latestIndex].datetime
    });

    // Check if we should send an alert
    if (shouldAlert(config, ticker, signal)) {
      const alertType = recommendation.includes('BUY') ? 'BUY_SIGNAL' : 'SELL_SIGNAL';
      writeLog(alertType, `${recommendation} signal for ${ticker}`, {
        ticker,
        recommendation,
        price: indicators.price.toFixed(2),
        score: indicators.technicalScore,
        rsi: indicators.rsi.toFixed(1),
        williamsR: indicators.williamsR.toFixed(1)
      });

      await sendEmailAlert(config, ticker, signal, indicators);

      alertHistory.push({
        ...signal,
        alertedAt: new Date().toISOString()
      });
    }

    // Update last signal
    lastSignals[ticker] = signal;

    return signal;
  } catch (error) {
    writeLog('ERROR', `Error monitoring ${ticker}`, { error: error.message });
    return null;
  }
}

/**
 * Run monitoring cycle for all tickers
 */
async function runMonitoringCycle(config) {
  writeLog('INFO', 'Starting monitoring cycle', { tickers: config.tickers });

  // Trim log file periodically
  trimLogFile();

  const results = [];

  for (const ticker of config.tickers) {
    const result = await monitorTicker(ticker, config);
    if (result) {
      results.push(result);
    }

    // Rate limiting: wait 12 seconds between API calls (5 calls/minute limit)
    if (config.tickers.indexOf(ticker) < config.tickers.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 12000));
    }
  }

  return results;
}

/**
 * Get current status (for API endpoint)
 */
function getStatus() {
  return {
    isRunning: !!monitorInterval,
    lastSignals,
    alertHistory: alertHistory.slice(-20), // Last 20 alerts
    config: {
      tickers: loadConfig().tickers,
      intervalMinutes: loadConfig().intervalMinutes
    }
  };
}

/**
 * Get signals for frontend display
 */
function getSignals() {
  return Object.values(lastSignals);
}

/**
 * Get price history for a ticker
 */
function getPriceHistory(ticker) {
  return priceHistory[ticker] || [];
}

// Monitor interval reference
let monitorInterval = null;

/**
 * Start the monitoring service
 */
function startMonitor(customConfig = null) {
  // Load fresh config
  const config = customConfig || loadConfig();

  if (!config.alphaVantageApiKey) {
    writeLog('ERROR', 'AlphaVantage API key not configured');
    return { success: false, error: 'AlphaVantage API key not configured. Set ALPHA_VANTAGE_API_KEY in .env file.' };
  }

  // Stop existing monitor if running
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }

  writeLog('INFO', 'Monitor started', {
    tickers: config.tickers,
    intervalMinutes: config.intervalMinutes,
    emailEnabled: config.email.enabled
  });

  // Run immediately with current config
  runMonitoringCycle(loadConfig());

  // Set up interval - reload config each time so changes take effect
  monitorInterval = setInterval(() => {
    const freshConfig = loadConfig();
    runMonitoringCycle(freshConfig);
  }, config.intervalMinutes * 60 * 1000);

  return { success: true, message: 'Monitor started', tickers: config.tickers, intervalMinutes: config.intervalMinutes };
}

/**
 * Stop the monitoring service
 */
function stopMonitor() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    writeLog('INFO', 'Monitor stopped');
    return { success: true, message: 'Monitor stopped' };
  }
  return { success: true, message: 'Monitor was not running' };
}

/**
 * Update configuration
 */
function updateConfig(newConfig) {
  const config = loadConfig();
  const updated = { ...config, ...newConfig };
  if (newConfig.email) {
    updated.email = { ...config.email, ...newConfig.email };
  }
  saveConfig(updated);
  return updated;
}

/**
 * Get current configuration (for API endpoint)
 */
function getConfig() {
  const config = loadConfig();
  // Don't expose sensitive data in API response
  return {
    ...config,
    alphaVantageApiKey: config.alphaVantageApiKey ? '********' : '',
    email: {
      ...config.email,
      password: config.email.password ? '********' : ''
    }
  };
}

/**
 * Manual check - run one monitoring cycle immediately (for testing)
 */
async function manualCheck() {
  const config = loadConfig();

  if (!config.alphaVantageApiKey) {
    return { error: 'AlphaVantage API key not configured' };
  }

  const results = await runMonitoringCycle(config);
  return {
    success: true,
    checkedAt: new Date().toISOString(),
    signals: results
  };
}

module.exports = {
  startMonitor,
  stopMonitor,
  getStatus,
  getSignals,
  getPriceHistory,
  loadConfig,
  getConfig,
  updateConfig,
  manualCheck,
  runMonitoringCycle,
  monitorTicker,
  readLogs
};

// Run as standalone script
if (require.main === module) {
  startMonitor();
}
