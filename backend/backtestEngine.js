// Backtesting Engine - Simulates trading based on historical recommendations

const axios = require('axios');

/**
 * Fetch historical daily data from Alpha Vantage
 * @param {string} ticker - Stock ticker symbol
 * @param {string} apiKey - Alpha Vantage API key
 * @returns {Promise<Array>} Historical data array
 */
async function fetchHistoricalData(ticker, apiKey) {
  const response = await axios.get('https://www.alphavantage.co/query', {
    params: {
      function: 'TIME_SERIES_DAILY',
      symbol: ticker,
      apikey: apiKey,
      outputsize: 'full' // Get full historical data (20+ years)
    }
  });

  if (response.data['Error Message']) {
    throw new Error(`Invalid ticker: ${ticker}`);
  }

  if (response.data['Note']) {
    throw new Error('API rate limit reached');
  }

  const dailyData = response.data['Time Series (Daily)'];
  if (!dailyData) {
    throw new Error(`No data available for ${ticker}`);
  }

  // Convert to array format
  const dates = Object.keys(dailyData).sort();
  return dates.map(date => ({
    date: date,
    open: parseFloat(dailyData[date]['1. open']),
    high: parseFloat(dailyData[date]['2. high']),
    low: parseFloat(dailyData[date]['3. low']),
    close: parseFloat(dailyData[date]['4. close']),
    volume: parseInt(dailyData[date]['5. volume'])
  }));
}

/**
 * Calculate technical indicators for a specific date
 * (Uses same logic as server.js)
 */
function calculateIndicators(historicalData, index) {
  const prices = historicalData.slice(0, index + 1).map(d => d.close).reverse();
  const currentPrice = prices[0];

  // RSI
  const rsi = calculateRSI(prices);

  // Moving Averages
  const sma20 = calculateSMA(prices, 20);
  const sma50 = calculateSMA(prices, 50);

  // MACD
  const macd = calculateMACD(prices);

  // Calculate score (same as server.js)
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
    technicalScore: Math.round(score),
    rsi,
    sma20,
    sma50,
    macd,
    currentPrice
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

/**
 * Generate recommendation based on master score
 * For backtesting, we use technical score only (sentiment/fundamental not available historically)
 */
function generateRecommendation(technicalScore) {
  if (technicalScore >= 75) return 'STRONG BUY';
  if (technicalScore >= 60) return 'BUY';
  if (technicalScore < 45 && technicalScore >= 30) return 'SELL';
  if (technicalScore < 30) return 'STRONG SELL';
  return 'HOLD';
}

/**
 * Run backtest simulation
 * @param {Object} config - Backtest configuration
 */
async function runBacktest(config) {
  const {
    tickers,
    startDate,
    endDate,
    initialInvestment, // Per stock
    buyPercentages, // { 'STRONG BUY': 100, 'BUY': 100, 'SELL': 100, 'STRONG SELL': 100 }
    apiKey
  } = config;

  console.log(`\n🔄 Starting backtest for ${tickers.length} stocks...`);
  console.log(`📅 Period: ${startDate} to ${endDate}`);
  console.log(`💰 Initial investment per stock: £${initialInvestment}`);

  const results = [];

  for (const ticker of tickers) {
    console.log(`\n📊 Processing ${ticker}...`);

    try {
      // Fetch historical data
      const historicalData = await fetchHistoricalData(ticker, apiKey);

      // Filter by date range
      const filteredData = historicalData.filter(d => {
        return d.date >= startDate && d.date <= endDate;
      });

      if (filteredData.length === 0) {
        throw new Error(`No data in range for ${ticker}`);
      }

      console.log(`  ✓ Fetched ${filteredData.length} days of data`);

      // Run simulation
      const simulation = simulateTrades(ticker, filteredData, historicalData, initialInvestment, buyPercentages);
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
 */
function simulateTrades(ticker, tradingData, fullHistoricalData, initialInvestment, buyPercentages) {
  let cash = initialInvestment;
  let shares = 0;
  const trades = [];

  // For buy-and-hold comparison
  const startPrice = tradingData[0].close;
  const endPrice = tradingData[tradingData.length - 1].close;
  const buyAndHoldShares = initialInvestment / startPrice;
  const buyAndHoldValue = buyAndHoldShares * endPrice;

  // Simulate daily checks
  for (let i = 0; i < tradingData.length; i++) {
    const currentDate = tradingData[i].date;
    const currentPrice = tradingData[i].close;

    // Find index in full historical data (need lookback for indicators)
    const fullDataIndex = fullHistoricalData.findIndex(d => d.date === currentDate);

    if (fullDataIndex === -1 || fullDataIndex < 50) continue; // Need enough history

    // Calculate indicators
    const indicators = calculateIndicators(fullHistoricalData, fullDataIndex);
    const recommendation = generateRecommendation(indicators.technicalScore);

    // Execute trades based on recommendation
    if ((recommendation === 'STRONG BUY' || recommendation === 'BUY') && cash > 0) {
      const percentage = buyPercentages[recommendation] || 100;
      const investAmount = (cash * percentage) / 100;
      const sharesToBuy = Math.floor(investAmount / currentPrice);

      if (sharesToBuy > 0) {
        const cost = sharesToBuy * currentPrice;
        shares += sharesToBuy;
        cash -= cost;

        trades.push({
          date: currentDate,
          action: 'BUY',
          recommendation,
          shares: sharesToBuy,
          price: currentPrice,
          cost,
          technicalScore: indicators.technicalScore,
          portfolioValue: cash + (shares * currentPrice)
        });
      }
    } else if ((recommendation === 'STRONG SELL' || recommendation === 'SELL') && shares > 0) {
      const percentage = buyPercentages[recommendation] || 100;
      const sharesToSell = Math.floor(shares * percentage / 100);

      if (sharesToSell > 0) {
        const proceeds = sharesToSell * currentPrice;
        shares -= sharesToSell;
        cash += proceeds;

        trades.push({
          date: currentDate,
          action: 'SELL',
          recommendation,
          shares: sharesToSell,
          price: currentPrice,
          proceeds,
          technicalScore: indicators.technicalScore,
          portfolioValue: cash + (shares * currentPrice)
        });
      }
    }
  }

  // Final portfolio value
  const finalValue = cash + (shares * endPrice);
  const returnPercent = ((finalValue - initialInvestment) / initialInvestment) * 100;
  const buyAndHoldReturn = ((buyAndHoldValue - initialInvestment) / initialInvestment) * 100;

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
  fetchHistoricalData
};
