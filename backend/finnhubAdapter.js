// Finnhub API Adapter
const axios = require('axios');

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

/**
 * Get stock quote from Finnhub
 */
async function getQuote(ticker, apiKey) {
  try {
    const response = await axios.get(`${FINNHUB_BASE_URL}/quote`, {
      params: {
        symbol: ticker,
        token: apiKey
      },
      timeout: 10000
    });
    
    if (response.data.error) {
      throw new Error(response.data.error);
    }
    
    // Check if we got valid data
    if (!response.data.c || response.data.c === 0) {
      throw new Error(`No quote data available for ${ticker}. Ticker may not exist or market may be closed.`);
    }
    
    return {
      currentPrice: response.data.c,
      change: response.data.d || 0,
      changePercent: (response.data.dp || 0).toFixed(2) + '%',
      high: response.data.h || 0,
      low: response.data.l || 0,
      open: response.data.o || 0,
      previousClose: response.data.pc || 0
    };
  } catch (error) {
    console.error('Finnhub getQuote error:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get historical candles (daily data)
 */
async function getHistoricalData(ticker, apiKey, days = 30) {
  const to = Math.floor(Date.now() / 1000);
  const from = to - (days * 24 * 60 * 60);
  
  const response = await axios.get(`${FINNHUB_BASE_URL}/stock/candle`, {
    params: {
      symbol: ticker,
      resolution: 'D',
      from: from,
      to: to,
      token: apiKey
    }
  });
  
  if (response.data.s === 'no_data') {
    throw new Error('No historical data available');
  }
  
  const data = response.data;
  const historicalData = [];
  
  for (let i = 0; i < data.t.length; i++) {
    historicalData.push({
      date: new Date(data.t[i] * 1000).toISOString().split('T')[0],
      price: data.c[i],
      volume: data.v[i],
      high: data.h[i],
      low: data.l[i],
      open: data.o[i]
    });
  }
  
  return historicalData;
}

/**
 * Get company profile/fundamentals
 */
async function getCompanyProfile(ticker, apiKey) {
  const response = await axios.get(`${FINNHUB_BASE_URL}/stock/profile2`, {
    params: {
      symbol: ticker,
      token: apiKey
    }
  });
  
  return {
    name: response.data.name,
    ticker: response.data.ticker,
    marketCap: response.data.marketCapitalization,
    industry: response.data.finnhubIndustry,
    country: response.data.country,
    currency: response.data.currency,
    exchange: response.data.exchange
  };
}

/**
 * Get basic financial metrics
 */
async function getBasicFinancials(ticker, apiKey) {
  const response = await axios.get(`${FINNHUB_BASE_URL}/stock/metric`, {
    params: {
      symbol: ticker,
      metric: 'all',
      token: apiKey
    }
  });
  
  const metric = response.data.metric;
  
  return {
    peRatio: metric['peBasicExclExtraTTM'] || metric['peNormalizedAnnual'],
    eps: metric['epsBasicExclExtraItemsTTM'],
    dividendYield: metric['dividendYieldIndicatedAnnual'],
    beta: metric['beta'],
    high52Week: metric['52WeekHigh'],
    low52Week: metric['52WeekLow']
  };
}

/**
 * Get company news
 */
async function getNews(ticker, apiKey) {
  const to = new Date().toISOString().split('T')[0];
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const response = await axios.get(`${FINNHUB_BASE_URL}/company-news`, {
    params: {
      symbol: ticker,
      from: from,
      to: to,
      token: apiKey
    }
  });
  
  // Convert to our format
  return response.data.slice(0, 10).map(article => ({
    title: article.headline,
    summary: article.summary,
    url: article.url,
    source: article.source,
    time_published: new Date(article.datetime * 1000).toISOString(),
    image: article.image
  }));
}

/**
 * Get news sentiment from Finnhub (they provide sentiment scores!)
 */
async function getNewsSentiment(ticker, apiKey) {
  const response = await axios.get(`${FINNHUB_BASE_URL}/news-sentiment`, {
    params: {
      symbol: ticker,
      token: apiKey
    }
  });
  
  const data = response.data;
  
  // Finnhub provides sentiment scores from -1 to 1
  // Convert to 0-100 scale
  const sentimentScore = ((data.sentiment.bullishPercent - data.sentiment.bearishPercent) / 100 + 1) * 50;
  
  return {
    overallScore: Math.round(sentimentScore),
    sentiment: sentimentScore >= 60 ? 'positive' : sentimentScore <= 40 ? 'negative' : 'neutral',
    buzzScore: data.buzz?.buzz || 0,
    articlesInLastWeek: data.buzz?.articlesInLastWeek || 0,
    bullishPercent: data.sentiment?.bullishPercent || 0,
    bearishPercent: data.sentiment?.bearishPercent || 0
  };
}

module.exports = {
  getQuote,
  getHistoricalData,
  getCompanyProfile,
  getBasicFinancials,
  getNews,
  getNewsSentiment
};