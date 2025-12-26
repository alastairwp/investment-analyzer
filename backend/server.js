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

// ========== TIMEFRAME ANALYSIS FUNCTIONS ==========

/**
 * Analyze short-term outlook (1-5 days)
 * Primary indicators: RSI, Momentum (5-day), Price vs SMA20, Williams %R
 */
function analyzeShortTerm(rsi, price, sma20, momentum, williamsR) {
  let score = 50;
  const signals = [];

  // RSI analysis (high weight for short-term)
  if (rsi < 30) {
    score += 25;
    signals.push({ type: 'bullish', message: 'RSI oversold - likely bounce expected' });
  } else if (rsi < 40) {
    score += 15;
    signals.push({ type: 'bullish', message: 'RSI recovering from low levels' });
  } else if (rsi > 70) {
    score -= 25;
    signals.push({ type: 'bearish', message: 'RSI overbought - pullback risk' });
  } else if (rsi > 60) {
    score -= 15;
    signals.push({ type: 'bearish', message: 'RSI elevated - momentum may slow' });
  }

  // Momentum analysis (critical for short-term)
  if (momentum > 3) {
    score += 20;
    signals.push({ type: 'bullish', message: `Strong momentum (+${momentum.toFixed(1)}% in 5 days)` });
  } else if (momentum > 1) {
    score += 10;
    signals.push({ type: 'bullish', message: `Positive momentum (+${momentum.toFixed(1)}% in 5 days)` });
  } else if (momentum < -3) {
    score -= 20;
    signals.push({ type: 'bearish', message: `Negative momentum (${momentum.toFixed(1)}% in 5 days)` });
  } else if (momentum < -1) {
    score -= 10;
    signals.push({ type: 'bearish', message: `Slight weakness (${momentum.toFixed(1)}% in 5 days)` });
  }

  // Price vs SMA20 (short-term trend)
  if (sma20) {
    if (price > sma20) {
      score += 15;
      signals.push({ type: 'bullish', message: 'Price above 20-day moving average' });
    } else {
      score -= 15;
      signals.push({ type: 'bearish', message: 'Price below 20-day moving average' });
    }
  }

  // Williams %R analysis
  if (williamsR !== null && williamsR !== undefined) {
    if (williamsR < -80) {
      score += 15;
      signals.push({ type: 'bullish', message: 'Williams %R oversold - bounce likely' });
    } else if (williamsR > -20) {
      score -= 15;
      signals.push({ type: 'bearish', message: 'Williams %R overbought - caution' });
    }
  }

  score = Math.max(0, Math.min(100, score));

  return {
    period: '1-5 days',
    score: Math.round(score),
    recommendation: getRecommendation(score),
    confidence: getConfidence(score),
    signals: signals.slice(0, 4) // Max 4 signals
  };
}

/**
 * Analyze mid-term outlook (1-4 weeks)
 * Primary indicators: SMA20 vs SMA50 trend, MACD crossovers, RSI, Bollinger Bands
 */
function analyzeMidTerm(sma20, sma50, sma20Prev, sma50Prev, macd, macdFull, rsi, bollingerBands, price) {
  let score = 50;
  const signals = [];

  // SMA20 vs SMA50 trend analysis
  if (sma20 && sma50) {
    const currentGap = sma20 - sma50;
    const previousGap = (sma20Prev && sma50Prev) ? sma20Prev - sma50Prev : null;

    if (sma20 > sma50) {
      score += 20;
      if (previousGap !== null && previousGap < 0) {
        signals.push({ type: 'bullish', message: 'Recent golden cross - strong buy signal' });
      } else {
        signals.push({ type: 'bullish', message: 'Uptrend confirmed (SMA20 > SMA50)' });
      }
    } else {
      score -= 10;
      if (previousGap !== null && currentGap > previousGap) {
        // Gap narrowing = recovery
        score += 15;
        signals.push({ type: 'bullish', message: 'SMA20 rising towards SMA50 - recovery forming' });
      } else if (previousGap !== null && previousGap > 0) {
        signals.push({ type: 'bearish', message: 'Recent death cross - trend reversal' });
      } else {
        signals.push({ type: 'bearish', message: 'Downtrend (SMA20 < SMA50)' });
      }
    }
  }

  // MACD analysis
  if (macd !== null) {
    if (macd > 0) {
      score += 15;
      signals.push({ type: 'bullish', message: 'MACD positive - bullish momentum' });
    } else {
      score -= 10;
      // Check if MACD is improving (converging toward zero)
      if (macdFull && macdFull.histogram && macdFull.histogram.length > 5) {
        const recentHist = macdFull.histogram.slice(-5).filter(h => h !== null);
        if (recentHist.length >= 2 && recentHist[recentHist.length - 1] > recentHist[0]) {
          score += 10;
          signals.push({ type: 'bullish', message: 'MACD histogram improving - momentum building' });
        } else {
          signals.push({ type: 'bearish', message: 'MACD negative - bearish momentum' });
        }
      }
    }
  }

  // Bollinger Bands position
  if (bollingerBands && bollingerBands.upper.length > 0) {
    const latestUpper = bollingerBands.upper[bollingerBands.upper.length - 1];
    const latestLower = bollingerBands.lower[bollingerBands.lower.length - 1];
    const latestMiddle = bollingerBands.middle[bollingerBands.middle.length - 1];

    if (latestUpper && latestLower && latestMiddle) {
      if (price >= latestUpper * 0.98) {
        score -= 10;
        signals.push({ type: 'bearish', message: 'At upper Bollinger Band - overbought' });
      } else if (price <= latestLower * 1.02) {
        score += 10;
        signals.push({ type: 'bullish', message: 'At lower Bollinger Band - bounce potential' });
      } else if (price > latestMiddle) {
        score += 5;
      }
    }
  }

  // RSI mid-range stability
  if (rsi >= 40 && rsi <= 60) {
    score += 5;
    signals.push({ type: 'neutral', message: 'RSI in healthy range (40-60)' });
  }

  score = Math.max(0, Math.min(100, score));

  return {
    period: '1-4 weeks',
    score: Math.round(score),
    recommendation: getRecommendation(score),
    confidence: getConfidence(score),
    signals: signals.slice(0, 4)
  };
}

/**
 * Analyze long-term outlook (1-6 months)
 * Primary indicators: SMA50 vs SMA200 trend, Overall price trend, Fundamentals
 */
function analyzeLongTerm(sma50, sma200, sma50Prev, sma200Prev, price, fundamentals) {
  let score = 50;
  const signals = [];

  // Technical component (60% weight conceptually)

  // SMA50 vs SMA200 trend (major trend indicator)
  if (sma50 && sma200) {
    const currentGap = sma50 - sma200;
    const previousGap = (sma50Prev && sma200Prev) ? sma50Prev - sma200Prev : null;

    if (sma50 > sma200) {
      score += 20;
      signals.push({ type: 'bullish', message: 'Long-term uptrend (SMA50 > SMA200)' });
    } else {
      score -= 15;
      if (previousGap !== null && currentGap > previousGap) {
        // SMA50 rising towards SMA200 = major recovery
        score += 15;
        signals.push({ type: 'bullish', message: 'SMA50 rising towards SMA200 - major recovery' });
      } else {
        signals.push({ type: 'bearish', message: 'Long-term downtrend (SMA50 < SMA200)' });
      }
    }
  } else if (!sma200) {
    signals.push({ type: 'neutral', message: 'Insufficient data for 200-day SMA' });
  }

  // Price vs SMA200
  if (sma200) {
    if (price > sma200) {
      score += 10;
      signals.push({ type: 'bullish', message: 'Price above 200-day average' });
    } else {
      score -= 10;
      signals.push({ type: 'bearish', message: 'Price below 200-day average' });
    }
  }

  // Fundamental component (40% weight conceptually)
  if (fundamentals) {
    const pe = parseFloat(fundamentals.peRatio);
    const marketCap = parseFloat(fundamentals.marketCap);

    if (pe > 0) {
      if (pe < 15) {
        score += 15;
        signals.push({ type: 'bullish', message: `Attractive P/E ratio (${pe.toFixed(1)})` });
      } else if (pe >= 15 && pe <= 25) {
        score += 10;
        signals.push({ type: 'neutral', message: `Fair P/E ratio (${pe.toFixed(1)})` });
      } else if (pe > 35) {
        score -= 10;
        signals.push({ type: 'bearish', message: `High P/E ratio (${pe.toFixed(1)}) - expensive` });
      }
    }

    if (marketCap > 50) {
      score += 10;
      signals.push({ type: 'bullish', message: 'Large cap - lower volatility risk' });
    }
  }

  score = Math.max(0, Math.min(100, score));

  return {
    period: '1-6 months',
    score: Math.round(score),
    recommendation: getRecommendation(score),
    confidence: getConfidence(score),
    signals: signals.slice(0, 4)
  };
}

/**
 * Get recommendation based on score
 */
function getRecommendation(score) {
  if (score >= 75) return 'STRONG BUY';
  if (score >= 60) return 'BUY';
  if (score >= 45) return 'HOLD';
  if (score >= 30) return 'SELL';
  return 'STRONG SELL';
}

/**
 * Get confidence level based on score distance from neutral
 */
function getConfidence(score) {
  const distance = Math.abs(score - 50);
  if (distance >= 25) return 'High';
  if (distance >= 15) return 'Medium';
  return 'Low';
}

// ========== TECHNICAL ANALYSIS ==========

function analyzeTechnicals(historicalData) {
  const prices = historicalData.map(d => d.price).reverse();
  const currentPrice = prices[0];

  const rsi = calculateRSI(prices);
  const sma20 = calculateSMA(prices, 20);
  const sma50 = calculateSMA(prices, 50);
  const sma200 = calculateSMA(prices, 200);
  const macd = calculateMACD(prices);

  // Calculate SMA values from 5 days ago to determine trend direction
  const pricesPrev = prices.slice(5); // Shift by 5 days
  const sma20Prev = pricesPrev.length >= 20 ? calculateSMA(pricesPrev, 20) : null;
  const sma50Prev = pricesPrev.length >= 50 ? calculateSMA(pricesPrev, 50) : null;
  const sma200Prev = pricesPrev.length >= 200 ? calculateSMA(pricesPrev, 200) : null;

  // Calculate advanced indicators
  const bollingerBands = calculateBollingerBands(prices, 20, 2);
  const macdFull = calculateMACDFull(prices);
  const williamsR = calculateWilliamsR(historicalData.slice().reverse(), 14);

  // Calculate 5-day momentum
  const recentPrices = prices.slice(0, 5);
  const momentum = ((recentPrices[0] - recentPrices[4]) / recentPrices[4]) * 100;
  
  // Get latest Williams %R value
  const latestWilliamsR = williamsR[williamsR.length - 1];

  // Calculate timeframe-specific analyses
  const shortTermAnalysis = analyzeShortTerm(rsi, currentPrice, sma20, momentum, latestWilliamsR);
  const midTermAnalysis = analyzeMidTerm(sma20, sma50, sma20Prev, sma50Prev, macd, macdFull, rsi, bollingerBands, currentPrice);
  const longTermAnalysis = analyzeLongTerm(sma50, sma200, sma50Prev, sma200Prev, currentPrice, null); // fundamentals added later

  // Legacy score calculation (kept for backwards compatibility during transition)
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

  if (momentum > 2) score += 10;
  else if (momentum < -2) score -= 10;

  score = Math.max(0, Math.min(100, score));

  return {
    score: Math.round(score),
    indicators: {
      rsi: rsi.toFixed(2),
      sma20: sma20?.toFixed(2) || 'N/A',
      sma50: sma50?.toFixed(2) || 'N/A',
      sma200: sma200?.toFixed(2) || 'N/A',
      macd: macd?.toFixed(2) || 'N/A',
      momentum: momentum.toFixed(2) + '%',
      williamsR: latestWilliamsR?.toFixed(2) || 'N/A'
    },
    signals: generateSignals(rsi, currentPrice, sma20, sma50, macd, sma20Prev, sma50Prev),
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
    },
    timeframes: {
      shortTerm: shortTermAnalysis,
      midTerm: midTermAnalysis,
      longTerm: longTermAnalysis
    },
    rawIndicators: {
      rsi, sma20, sma50, sma200, macd, momentum, williamsR: latestWilliamsR,
      sma20Prev, sma50Prev, sma200Prev
    }
  };
}

function generateSignals(rsi, price, sma20, sma50, macd, sma20Prev = null, sma50Prev = null) {
  const signals = [];

  if (rsi < 30) signals.push({ type: 'bullish', message: 'RSI indicates oversold conditions' });
  if (rsi > 70) signals.push({ type: 'bearish', message: 'RSI indicates overbought conditions' });

  // SMA Cross analysis with TREND consideration
  if (sma20 && sma50) {
    const currentGap = sma20 - sma50;
    const previousGap = (sma20Prev && sma50Prev) ? sma20Prev - sma50Prev : null;

    if (sma20 > sma50) {
      // Golden cross exists
      if (previousGap !== null && previousGap < 0) {
        // Just crossed - recent golden cross
        signals.push({ type: 'bullish', message: 'Recent golden cross - SMA20 just crossed above SMA50 (strong bullish signal)' });
      } else if (previousGap !== null && currentGap > previousGap) {
        // Gap widening - strengthening uptrend
        signals.push({ type: 'bullish', message: 'Golden cross strengthening - gap between SMA20 and SMA50 widening (bullish momentum)' });
      } else if (previousGap !== null && currentGap < previousGap) {
        // Gap narrowing - weakening uptrend
        signals.push({ type: 'neutral', message: 'Golden cross weakening - SMA20 declining towards SMA50 (momentum slowing)' });
      } else {
        signals.push({ type: 'bullish', message: 'Golden cross pattern (SMA20 > SMA50)' });
      }
    } else if (sma20 < sma50) {
      // Death cross exists - but check the TREND
      if (previousGap !== null && previousGap > 0) {
        // Just crossed - recent death cross
        signals.push({ type: 'bearish', message: 'Recent death cross - SMA20 just crossed below SMA50 (strong bearish signal)' });
      } else if (previousGap !== null && currentGap < previousGap) {
        // Gap widening (more negative) - strengthening downtrend
        signals.push({ type: 'bearish', message: 'Death cross strengthening - gap between SMA20 and SMA50 widening (bearish momentum)' });
      } else if (previousGap !== null && currentGap > previousGap) {
        // Gap narrowing - SMA20 rising towards SMA50 = RECOVERY
        signals.push({ type: 'bullish', message: 'Recovery trend - SMA20 rising towards SMA50, potential golden cross forming (bullish reversal signal)' });
      } else {
        signals.push({ type: 'bearish', message: 'Death cross pattern (SMA20 < SMA50)' });
      }
    }
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

  // Update long-term analysis with fundamentals
  const timeframes = { ...technical.timeframes };
  if (mockData.fundamentals && technical.rawIndicators) {
    timeframes.longTerm = analyzeLongTerm(
      technical.rawIndicators.sma50,
      technical.rawIndicators.sma200,
      technical.rawIndicators.sma50Prev,
      technical.rawIndicators.sma200Prev,
      mockData.currentPrice,
      mockData.fundamentals
    );
  }

  return {
    ticker,
    currentPrice: mockData.currentPrice,
    change: mockData.change,
    changePercent: mockData.changePercent,
    timeframes,
    indicators: technical.indicators,
    signals: technical.signals,
    advancedIndicators: technical.advancedIndicators,
    sentiment: mockData.sentiment,
    fundamentals: mockData.fundamentals,
    historicalData: mockData.historicalData,
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

  // Update long-term analysis with fundamentals
  const timeframes = { ...technical.timeframes };
  if (fundamentals && technical.rawIndicators) {
    timeframes.longTerm = analyzeLongTerm(
      technical.rawIndicators.sma50,
      technical.rawIndicators.sma200,
      technical.rawIndicators.sma50Prev,
      technical.rawIndicators.sma200Prev,
      quote.currentPrice,
      fundamentals
    );
  }

  return {
    ticker,
    currentPrice: quote.currentPrice,
    change: quote.change,
    changePercent: quote.changePercent,
    timeframes,
    indicators: technical.indicators,
    signals: technical.signals,
    advancedIndicators: technical.advancedIndicators,
    sentiment: sentimentData,
    fundamentals,
    historicalData: historicalData.slice(-90),
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

  // Timeframes from technical analysis (no fundamentals for Alpha Vantage basic)
  const timeframes = technical.timeframes;

  return {
    ticker,
    currentPrice,
    change,
    changePercent,
    timeframes,
    indicators: technical.indicators,
    signals: technical.signals,
    advancedIndicators: technical.advancedIndicators,
    sentiment: null,
    fundamentals: null,
    historicalData: historicalData,
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
        
        const midScore = data.timeframes?.midTerm?.score ?? 50;
        if (midScore >= 60) {
          suggestions.push({
            ticker: data.ticker,
            timeframes: data.timeframes,
            currentPrice: data.currentPrice,
            change: data.change,
            changePercent: data.changePercent
          });
        }
      } catch (err) {
        console.log(`Skipping ${ticker}`);
      }
    }

    suggestions.sort((a, b) => (b.timeframes?.midTerm?.score ?? 50) - (a.timeframes?.midTerm?.score ?? 50));
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

// ========== REAL-TIME MONITOR ENDPOINTS ==========

const realTimeMonitor = require('./realTimeMonitor');

// Get monitor status and current signals
app.get('/api/monitor/status', (req, res) => {
  try {
    const status = realTimeMonitor.getStatus();
    const signals = realTimeMonitor.getSignals();
    res.json({ ...status, signals });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start monitoring
app.post('/api/monitor/start', async (req, res) => {
  try {
    const result = await realTimeMonitor.startMonitor();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stop monitoring
app.post('/api/monitor/stop', (req, res) => {
  try {
    const result = realTimeMonitor.stopMonitor();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get monitor configuration
app.get('/api/monitor/config', (req, res) => {
  try {
    const config = realTimeMonitor.getConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update monitor configuration
app.post('/api/monitor/config', (req, res) => {
  try {
    const newConfig = req.body;
    const result = realTimeMonitor.updateConfig(newConfig);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get historical signals
app.get('/api/monitor/signals', (req, res) => {
  try {
    const signals = realTimeMonitor.getSignals();
    res.json({ signals });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manually trigger a check (for testing)
app.post('/api/monitor/check', async (req, res) => {
  try {
    const result = await realTimeMonitor.manualCheck();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get monitor logs
app.get('/api/monitor/logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const logs = realTimeMonitor.readLogs(limit);
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Server running on http://0.0.0.0:${PORT}`);
  console.log(`📡 Using ${DATA_SOURCE.toUpperCase()} as data source\n`);
});