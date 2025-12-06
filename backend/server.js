require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const NodeCache = require('node-cache');
const { analyzeSentiment } = require('./sentiment');
const finnhub = require('./finnhubAdapter');
const { analyzeMock } = require('./mockDataProvider');

const app = express();
const cache = new NodeCache({ stdTTL: 1800 }); // Cache for 30 minutes

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// API Configuration
const DATA_SOURCE = process.env.DATA_SOURCE || 'mock'; // 'alphavantage', 'finnhub', or 'mock'
const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const FINNHUB_KEY = process.env.FINNHUB_API_KEY;
const ALPHA_VANTAGE_BASE = 'https://www.alphavantage.co/query';

console.log('===========================================');
console.log('📊 Investment Analyzer Backend v0.4');
console.log('===========================================');
console.log('Data Source:', DATA_SOURCE.toUpperCase());
console.log('Alpha Vantage Key:', ALPHA_VANTAGE_KEY ? '✓ Configured' : '✗ Missing');
console.log('Finnhub Key:', FINNHUB_KEY ? '✓ Configured' : '✗ Missing');
console.log('Anthropic Key:', process.env.ANTHROPIC_API_KEY ? '✓ Configured' : '✗ Missing');
if (DATA_SOURCE === 'mock') {
  console.log('⚠️  MOCK MODE ENABLED - Using simulated data');
}
console.log('===========================================\n');

// Technical Analysis Functions (same for both sources)
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

function calculateMACD(prices) {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  if (!ema12 || !ema26) return null;
  return ema12 - ema26;
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

function calculateBollingerBands(prices, period = 20, stdDev = 2) {
  if (prices.length < period) return { upper: [], middle: [], lower: [] };
  
  const bands = { upper: [], middle: [], lower: [] };
  
  for (let i = 0; i < period - 1; i++) {
    bands.upper.push(null);
    bands.middle.push(null);
    bands.lower.push(null);
  }
  
  for (let i = period - 1; i < prices.length; i++) {
    const slice = prices.slice(i - period + 1, i + 1);
    const sma = slice.reduce((a, b) => a + b, 0) / period;
    
    const variance = slice.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
    const std = Math.sqrt(variance);
    
    bands.middle.push(sma);
    bands.upper.push(sma + (stdDev * std));
    bands.lower.push(sma - (stdDev * std));
  }
  
  return bands;
}

function calculateMACDFull(prices) {
  if (prices.length < 26) return { macd: [], signal: [], histogram: [] };
  
  const ema12Values = [];
  const ema26Values = [];
  const macdLine = [];
  
  // Calculate EMA 12
  let ema12 = prices.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
  const k12 = 2 / 13;
  
  for (let i = 0; i < 12; i++) {
    ema12Values.push(null);
  }
  ema12Values.push(ema12);
  
  for (let i = 12; i < prices.length; i++) {
    ema12 = (prices[i] * k12) + (ema12 * (1 - k12));
    ema12Values.push(ema12);
  }
  
  // Calculate EMA 26
  let ema26 = prices.slice(0, 26).reduce((a, b) => a + b, 0) / 26;
  const k26 = 2 / 27;
  
  for (let i = 0; i < 26; i++) {
    ema26Values.push(null);
  }
  ema26Values.push(ema26);
  
  for (let i = 26; i < prices.length; i++) {
    ema26 = (prices[i] * k26) + (ema26 * (1 - k26));
    ema26Values.push(ema26);
  }
  
  // Calculate MACD line
  for (let i = 0; i < prices.length; i++) {
    if (ema12Values[i] !== null && ema26Values[i] !== null) {
      macdLine.push(ema12Values[i] - ema26Values[i]);
    } else {
      macdLine.push(null);
    }
  }
  
  // Calculate signal line (9-day EMA of MACD)
  const signalLine = [];
  const validMacd = macdLine.filter(v => v !== null);
  
  if (validMacd.length >= 9) {
    let signal = validMacd.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
    const kSignal = 2 / 10;
    
    for (let i = 0; i < macdLine.length; i++) {
      if (macdLine[i] === null || i < 34) {
        signalLine.push(null);
      } else if (i === 34) {
        signalLine.push(signal);
      } else {
        signal = (macdLine[i] * kSignal) + (signal * (1 - kSignal));
        signalLine.push(signal);
      }
    }
  } else {
    macdLine.forEach(() => signalLine.push(null));
  }
  
  // Calculate histogram
  const histogram = macdLine.map((m, i) => {
    if (m !== null && signalLine[i] !== null) {
      return m - signalLine[i];
    }
    return null;
  });
  
  return { macd: macdLine, signal: signalLine, histogram };
}

function calculateWilliamsR(historicalData, period = 14) {
  const williamsR = [];
  
  for (let i = 0; i < period - 1; i++) {
    williamsR.push(null);
  }
  
  for (let i = period - 1; i < historicalData.length; i++) {
    const slice = historicalData.slice(i - period + 1, i + 1);
    const highest = Math.max(...slice.map(d => d.high || d.price));
    const lowest = Math.min(...slice.map(d => d.low || d.price));
    const close = historicalData[i].price;
    
    const wr = ((highest - close) / (highest - lowest)) * -100;
    williamsR.push(wr);
  }
  
  return williamsR;
}

function analyzeTechnicals(historicalData) {
  const prices = historicalData.map(d => d.price).reverse();
  const currentPrice = prices[0];
  
  const rsi = calculateRSI(prices);
  const sma20 = calculateSMA(prices, 20);
  const sma50 = calculateSMA(prices, 50);
  const macd = calculateMACD(prices);
  
  // Calculate advanced indicators
  const bollingerBands = calculateBollingerBands(prices, 20, 2);
  const macdFull = calculateMACDFull(prices);
  const williamsR = calculateWilliamsR(historicalData.slice().reverse(), 14);
  
  let score = 50;
  
  if (rsi < 30) score += 20;
  else if (rsi > 70) score -= 20;
  else if (rsi >= 40 && rsi <= 60) score += 10;
  
  if (sma20 && currentPrice > sma20) score += 10;
  else if (sma20 && currentPrice < sma20) score -= 10;
  
  if (sma50 && currentPrice > sma50) score += 10;
  else if (sma50 && currentPrice < sma50) score -= 10;
  
  if (macd && macd > 0) score += 10;
  else if (macd && macd < 0) score -= 10;
  
  const recentPrices = prices.slice(0, 5);
  const momentum = ((recentPrices[0] - recentPrices[4]) / recentPrices[4]) * 100;
  if (momentum > 2) score += 10;
  else if (momentum < -2) score -= 10;
  
  score = Math.max(0, Math.min(100, score));
  
  return {
    score: Math.round(score),
    indicators: {
      rsi: rsi.toFixed(2),
      sma20: sma20?.toFixed(2) || 'N/A',
      sma50: sma50?.toFixed(2) || 'N/A',
      macd: macd?.toFixed(2) || 'N/A',
      momentum: momentum.toFixed(2) + '%'
    },
    signals: generateSignals(rsi, currentPrice, sma20, sma50, macd),
    advancedIndicators: {
      bollingerBands: {
        upper: bollingerBands.upper.reverse(),
        middle: bollingerBands.middle.reverse(),
        lower: bollingerBands.lower.reverse()
      },
      macd: {
        macd: macdFull.macd.reverse(),
        signal: macdFull.signal.reverse(),
        histogram: macdFull.histogram.reverse()
      },
      williamsR: williamsR.reverse()
    }
  };
}

function generateSignals(rsi, price, sma20, sma50, macd) {
  const signals = [];
  
  if (rsi < 30) signals.push({ type: 'bullish', message: 'RSI indicates oversold conditions' });
  if (rsi > 70) signals.push({ type: 'bearish', message: 'RSI indicates overbought conditions' });
  
  if (sma20 && sma50 && sma20 > sma50) {
    signals.push({ type: 'bullish', message: 'Golden cross pattern (SMA20 > SMA50)' });
  } else if (sma20 && sma50 && sma20 < sma50) {
    signals.push({ type: 'bearish', message: 'Death cross pattern (SMA20 < SMA50)' });
  }
  
  if (macd && macd > 0) signals.push({ type: 'bullish', message: 'MACD above zero' });
  if (macd && macd < 0) signals.push({ type: 'bearish', message: 'MACD below zero' });
  
  if (sma20 && price > sma20) signals.push({ type: 'bullish', message: 'Price above 20-day average' });
  if (sma20 && price < sma20) signals.push({ type: 'bearish', message: 'Price below 20-day average' });
  
  return signals;
}

function calculateFundamentalScore(fundamentals) {
  let score = 50;
  
  if (fundamentals) {
    const pe = parseFloat(fundamentals.peRatio);
    const marketCap = parseFloat(fundamentals.marketCap);
    
    if (pe > 0 && pe < 15) score += 15;
    else if (pe >= 15 && pe <= 25) score += 10;
    else if (pe > 25 && pe <= 35) score += 5;
    else if (pe > 35) score -= 10;
    
    if (marketCap > 200) score += 15;
    else if (marketCap > 50) score += 10;
    else if (marketCap > 10) score += 5;
  }
  
  return Math.max(0, Math.min(100, Math.round(score)));
}

function calculateMasterScore(technicalScore, sentimentScore, fundamentalScore) {
  return Math.round(
    (technicalScore * 0.4) +
    (sentimentScore * 0.3) +
    (fundamentalScore * 0.3)
  );
}

// ========== MOCK ENDPOINTS ==========

async function analyzeWithMock(ticker) {
  console.log(`[MOCK] Analyzing ${ticker}...`);
  
  const mockData = await analyzeMock(ticker);
  
  // Perform technical analysis on mock data
  const technical = analyzeTechnicals(mockData.historicalData);
  const fundamentalScore = calculateFundamentalScore(mockData.fundamentals);
  const sentimentScore = mockData.sentiment.overallScore;
  const masterScore = calculateMasterScore(technical.score, sentimentScore, fundamentalScore);
  
  let recommendation = 'HOLD';
  let confidence = 'Medium';
  
  if (masterScore >= 75) {
    recommendation = 'STRONG BUY';
    confidence = 'High';
  } else if (masterScore >= 60) {
    recommendation = 'BUY';
  } else if (masterScore < 45 && masterScore >= 30) {
    recommendation = 'SELL';
  } else if (masterScore < 30) {
    recommendation = 'STRONG SELL';
    confidence = 'High';
  }
  
  return {
    ticker,
    currentPrice: mockData.currentPrice,
    change: mockData.change,
    changePercent: mockData.changePercent,
    technicalScore: technical.score,
    sentimentScore: sentimentScore,
    fundamentalScore: fundamentalScore,
    masterScore: masterScore,
    recommendation,
    confidence,
    indicators: technical.indicators,
    signals: technical.signals,
    advancedIndicators: technical.advancedIndicators,
    sentiment: mockData.sentiment,
    historicalData: mockData.historicalData, // Send ALL data (90 days)
    lastUpdated: new Date().toISOString()
  };
}

// ========== FINNHUB ENDPOINTS ==========

async function analyzeWithFinnhub(ticker) {
  console.log(`[Finnhub] Fetching data for ${ticker}...`);
  
  // Get quote
  const quote = await finnhub.getQuote(ticker, FINNHUB_KEY);
  
  // Get historical data
  const historicalData = await finnhub.getHistoricalData(ticker, FINNHUB_KEY, 60);
  
  // Get fundamentals
  let fundamentals = null;
  try {
    const profile = await finnhub.getCompanyProfile(ticker, FINNHUB_KEY);
    const metrics = await finnhub.getBasicFinancials(ticker, FINNHUB_KEY);
    fundamentals = { ...profile, ...metrics };
  } catch (err) {
    console.log('[Finnhub] Could not fetch fundamentals');
  }
  
  // Get news (Finnhub provides this)
  let newsArticles = [];
  let sentimentScore = 50;
  let sentimentData = null;
  
  try {
    newsArticles = await finnhub.getNews(ticker, FINNHUB_KEY);
    const finnhubSentiment = await finnhub.getNewsSentiment(ticker, FINNHUB_KEY);
    
    // Use Finnhub's sentiment or analyze with Claude
    if (process.env.ANTHROPIC_API_KEY && newsArticles.length > 0) {
      sentimentData = await analyzeSentiment(newsArticles);
      sentimentScore = sentimentData.overallScore;
    } else {
      sentimentScore = finnhubSentiment.overallScore;
      sentimentData = {
        overallScore: finnhubSentiment.overallScore,
        sentiment: finnhubSentiment.sentiment,
        articles: newsArticles.map(a => ({
          ...a,
          sentiment: finnhubSentiment.sentiment,
          score: (finnhubSentiment.overallScore - 50) / 50
        }))
      };
    }
  } catch (err) {
    console.log('[Finnhub] Could not fetch news/sentiment');
  }
  
  // Perform technical analysis
  const technical = analyzeTechnicals(historicalData);
  const fundamentalScore = calculateFundamentalScore(fundamentals);
  const masterScore = calculateMasterScore(technical.score, sentimentScore, fundamentalScore);
  
  // Generate recommendation
  let recommendation = 'HOLD';
  let confidence = 'Medium';
  
  if (masterScore >= 75) {
    recommendation = 'STRONG BUY';
    confidence = 'High';
  } else if (masterScore >= 60) {
    recommendation = 'BUY';
  } else if (masterScore < 45 && masterScore >= 30) {
    recommendation = 'SELL';
  } else if (masterScore < 30) {
    recommendation = 'STRONG SELL';
    confidence = 'High';
  }
  
  return {
    ticker,
    currentPrice: quote.currentPrice,
    change: quote.change,
    changePercent: quote.changePercent,
    technicalScore: technical.score,
    sentimentScore: sentimentScore,
    fundamentalScore: fundamentalScore,
    masterScore: masterScore,
    recommendation,
    confidence,
    indicators: technical.indicators,
    signals: technical.signals,
    sentiment: sentimentData,
    historicalData: historicalData.slice(-30),
    lastUpdated: new Date().toISOString()
  };
}

// ========== ALPHA VANTAGE ENDPOINTS (Original) ==========

async function analyzeWithAlphaVantage(ticker) {
  console.log(`[Alpha Vantage] Fetching data for ${ticker}...`);
  
  const dailyResponse = await axios.get(ALPHA_VANTAGE_BASE, {
    params: {
      function: 'TIME_SERIES_DAILY',
      symbol: ticker,
      apikey: ALPHA_VANTAGE_KEY,
      outputsize: 'full'
    }
  });
  
  if (dailyResponse.data['Error Message']) {
    throw new Error('Invalid ticker symbol');
  }
  
  if (dailyResponse.data['Note']) {
    throw new Error('API rate limit reached');
  }
  
  const dailyData = dailyResponse.data['Time Series (Daily)'];
  if (!dailyData) {
    throw new Error('No data available');
  }
  
  console.log(`Alpha Vantage returned ${Object.keys(dailyData).length} days of data`);
  
  const quoteResponse = await axios.get(ALPHA_VANTAGE_BASE, {
    params: {
      function: 'GLOBAL_QUOTE',
      symbol: ticker,
      apikey: ALPHA_VANTAGE_KEY
    }
  });
  
  const quote = quoteResponse.data['Global Quote'];
  const currentPrice = parseFloat(quote['05. price']);
  const change = parseFloat(quote['09. change']);
  const changePercent = quote['10. change percent'];
  
  // Convert Alpha Vantage data to our format
  const dates = Object.keys(dailyData).sort().reverse().slice(0, 2000); // Last ~5 years
  const historicalData = dates.map(date => ({
    date: date,
    price: parseFloat(dailyData[date]['4. close']),
    volume: parseInt(dailyData[date]['5. volume']),
    high: parseFloat(dailyData[date]['2. high']),
    low: parseFloat(dailyData[date]['3. low'])
  })).reverse();
  
  const technical = analyzeTechnicals(historicalData);
  const fundamentalScore = 50; // Alpha Vantage overview would go here
  const sentimentScore = 50; // Would fetch news/sentiment here
  const masterScore = calculateMasterScore(technical.score, sentimentScore, fundamentalScore);
  
  let recommendation = 'HOLD';
  let confidence = 'Medium';
  
  if (masterScore >= 75) {
    recommendation = 'STRONG BUY';
    confidence = 'High';
  } else if (masterScore >= 60) {
    recommendation = 'BUY';
  } else if (masterScore < 45 && masterScore >= 30) {
    recommendation = 'SELL';
  } else if (masterScore < 30) {
    recommendation = 'STRONG SELL';
    confidence = 'High';
  }
  
  return {
    ticker,
    currentPrice,
    change,
    changePercent,
    technicalScore: technical.score,
    sentimentScore,
    fundamentalScore,
    masterScore,
    recommendation,
    confidence,
    indicators: technical.indicators,
    signals: technical.signals,
    advancedIndicators: technical.advancedIndicators,
    sentiment: null,
    historicalData: historicalData, // Send all available data
    lastUpdated: new Date().toISOString()
  };
}

// ========== API ROUTES ==========

app.get('/api/analyze/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    
    const cacheKey = `analysis_${ticker}_${DATA_SOURCE}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`✓ Returning cached data for ${ticker}`);
      return res.json(cached);
    }
    
    let result;
    
    if (DATA_SOURCE === 'mock') {
      result = await analyzeWithMock(ticker);
    } else if (DATA_SOURCE === 'finnhub') {
      result = await analyzeWithFinnhub(ticker);
    } else {
      result = await analyzeWithAlphaVantage(ticker);
    }
    
    cache.set(cacheKey, result);
    console.log(`✓ Analysis complete for ${ticker}`);
    res.json(result);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ 
      error: error.message || 'Failed to fetch stock data'
    });
  }
});

app.get('/api/suggestions', async (req, res) => {
  try {
    const tickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'JPM', 'V', 'JNJ'];
    const suggestions = [];
    
    for (const ticker of tickers) {
      try {
        const response = await axios.get(`http://localhost:3001/api/analyze/${ticker}`);
        const data = response.data;
        
        if (data.masterScore >= 60) {
          suggestions.push({
            ticker: data.ticker,
            masterScore: data.masterScore,
            technicalScore: data.technicalScore,
            sentimentScore: data.sentimentScore,
            fundamentalScore: data.fundamentalScore,
            recommendation: data.recommendation,
            currentPrice: data.currentPrice,
            change: data.change,
            changePercent: data.changePercent
          });
        }
      } catch (err) {
        console.log(`Skipping ${ticker}`);
      }
    }
    
    suggestions.sort((a, b) => b.masterScore - a.masterScore);
    res.json({ suggestions: suggestions.slice(0, 10) });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate suggestions' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    dataSource: DATA_SOURCE,
    apiKeys: {
      alphaVantage: ALPHA_VANTAGE_KEY ? 'configured' : 'missing',
      finnhub: FINNHUB_KEY ? 'configured' : 'missing',
      anthropic: process.env.ANTHROPIC_API_KEY ? 'configured' : 'missing'
    }
  });
});

// ========== BACKTEST ENDPOINTS ==========

const { runBacktest, DEFAULT_INDICATOR_CONFIG } = require('./backtestEngine');
const multer = require('multer');
const uploadsDir = path.join(__dirname, 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for CSV uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv') || file.originalname.endsWith('.txt')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Get default indicator config
app.get('/api/backtest/config', (req, res) => {
  res.json(DEFAULT_INDICATOR_CONFIG);
});

// List available CSV datasets
app.get('/api/backtest/datasets', (req, res) => {
  try {
    const datasets = [];

    // Add default dataset
    const defaultDataset = path.join(__dirname, 'dataset_appl_2019.txt');
    if (fs.existsSync(defaultDataset)) {
      datasets.push({
        name: 'AAPL 2019 (1-minute)',
        file: 'dataset_appl_2019.txt',
        path: defaultDataset,
        isDefault: true
      });
    }

    // Add uploaded datasets
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      files.forEach(file => {
        if (file.endsWith('.csv') || file.endsWith('.txt')) {
          datasets.push({
            name: file,
            file: file,
            path: path.join(uploadsDir, file),
            isDefault: false
          });
        }
      });
    }

    res.json({ datasets });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload CSV dataset
app.post('/api/backtest/upload-csv', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Read file to count rows and get date range
    const content = fs.readFileSync(req.file.path, 'utf8');
    const lines = content.trim().split('\n');
    const hasHeader = lines[0].toLowerCase().includes('timestamp') || lines[0].toLowerCase().includes('open');
    const dataLines = hasHeader ? lines.slice(1) : lines;

    // Get date range from first and last lines
    const firstLine = dataLines[0].split(',');
    const lastLine = dataLines[dataLines.length - 1].split(',');
    const startDate = firstLine[0].split(' ')[0];
    const endDate = lastLine[0].split(' ')[0];

    res.json({
      success: true,
      filename: req.file.filename,
      originalName: req.file.originalname,
      path: req.file.path,
      rowCount: dataLines.length,
      dateRange: { start: startDate, end: endDate }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Main backtest endpoint
app.post('/api/backtest', async (req, res) => {
  try {
    const config = req.body;

    // Validate config
    if (!config.tickers || !Array.isArray(config.tickers) || config.tickers.length === 0) {
      return res.status(400).json({ error: 'Tickers array is required' });
    }

    if (!config.startDate || !config.endDate) {
      return res.status(400).json({ error: 'Start and end dates are required' });
    }

    if (!config.initialInvestment || config.initialInvestment <= 0) {
      return res.status(400).json({ error: 'Valid initial investment is required' });
    }

    // Set defaults
    config.apiKey = config.apiKey || ALPHA_VANTAGE_KEY;
    config.buyPercentages = config.buyPercentages || {
      'STRONG BUY': 100,
      'BUY': 100,
      'SELL': 100,
      'STRONG SELL': 100
    };

    // Handle dataSource - resolve file paths
    if (config.dataSource && config.dataSource.type === 'file') {
      // If just filename provided, resolve to full path
      if (config.dataSource.file && !config.dataSource.path) {
        if (config.dataSource.file === 'dataset_appl_2019.txt') {
          config.dataSource.path = path.join(__dirname, config.dataSource.file);
        } else {
          config.dataSource.path = path.join(uploadsDir, config.dataSource.file);
        }
      }
    }

    console.log('\n🎯 Backtest request received');
    console.log('Tickers:', config.tickers.join(', '));
    console.log('Date range:', config.startDate, 'to', config.endDate);
    if (config.dataSource) {
      console.log('Data source:', config.dataSource.type, config.dataSource.path || '');
    }
    if (config.indicatorConfig) {
      console.log('Custom indicator config provided');
    }

    // Run backtest
    const results = await runBacktest(config);

    console.log('✅ Backtest completed successfully\n');
    res.json(results);

  } catch (error) {
    console.error('❌ Backtest error:', error.message);
    res.status(500).json({ error: error.message || 'Failed to run backtest' });
  }
});

const PORT = 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Server running on http://0.0.0.0:${PORT}`);
  console.log(`📡 Using ${DATA_SOURCE.toUpperCase()} as data source\n`);
});