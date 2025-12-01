// Mock Data Provider - Simulates API responses for testing

/**
 * Generate realistic stock price movements
 */
function generatePriceData(basePrice, days) {
  const data = [];
  let price = basePrice;
  const now = Date.now();
  
  for (let i = days; i >= 0; i--) {
    const date = new Date(now - i * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split('T')[0];
    
    // Random walk with slight upward bias
    const change = (Math.random() - 0.48) * basePrice * 0.03;
    price = Math.max(price + change, basePrice * 0.5);
    
    const open = price * (1 + (Math.random() - 0.5) * 0.01);
    const high = Math.max(open, price) * (1 + Math.random() * 0.02);
    const low = Math.min(open, price) * (1 - Math.random() * 0.02);
    const volume = Math.floor(10000000 + Math.random() * 50000000);
    
    data.push({
      date: dateStr,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      price: parseFloat(price.toFixed(2)),
      volume: volume
    });
  }
  
  return data;
}

/**
 * Mock stock database
 */
const MOCK_STOCKS = {
  'AAPL': {
    name: 'Apple Inc.',
    basePrice: 185.50,
    peRatio: 29.5,
    marketCap: 2900,
    sector: 'Technology',
    industry: 'Consumer Electronics'
  },
  'MSFT': {
    name: 'Microsoft Corporation',
    basePrice: 378.25,
    peRatio: 35.2,
    marketCap: 2800,
    sector: 'Technology',
    industry: 'Software'
  },
  'GOOGL': {
    name: 'Alphabet Inc.',
    basePrice: 141.80,
    peRatio: 26.8,
    marketCap: 1750,
    sector: 'Technology',
    industry: 'Internet Services'
  },
  'TSLA': {
    name: 'Tesla Inc.',
    basePrice: 248.50,
    peRatio: 68.5,
    marketCap: 790,
    sector: 'Consumer Cyclical',
    industry: 'Auto Manufacturers'
  },
  'AMZN': {
    name: 'Amazon.com Inc.',
    basePrice: 178.35,
    peRatio: 58.3,
    marketCap: 1850,
    sector: 'Consumer Cyclical',
    industry: 'Internet Retail'
  },
  'NVDA': {
    name: 'NVIDIA Corporation',
    basePrice: 495.20,
    peRatio: 72.1,
    marketCap: 1220,
    sector: 'Technology',
    industry: 'Semiconductors'
  },
  'META': {
    name: 'Meta Platforms Inc.',
    basePrice: 352.75,
    peRatio: 28.9,
    marketCap: 900,
    sector: 'Technology',
    industry: 'Internet Content'
  },
  'JPM': {
    name: 'JPMorgan Chase & Co.',
    basePrice: 158.40,
    peRatio: 11.2,
    marketCap: 456,
    sector: 'Financial Services',
    industry: 'Banks'
  },
  'V': {
    name: 'Visa Inc.',
    basePrice: 265.80,
    peRatio: 32.4,
    marketCap: 532,
    sector: 'Financial Services',
    industry: 'Credit Services'
  },
  'JNJ': {
    name: 'Johnson & Johnson',
    basePrice: 156.30,
    peRatio: 15.8,
    marketCap: 378,
    sector: 'Healthcare',
    industry: 'Pharmaceuticals'
  }
};

/**
 * Generate mock news articles
 */
function generateMockNews(ticker, stockInfo) {
  const newsTemplates = [
    {
      title: `${stockInfo.name} reports strong quarterly earnings`,
      sentiment: 'positive',
      source: 'MarketWatch'
    },
    {
      title: `Analysts upgrade ${ticker} stock to 'Buy'`,
      sentiment: 'positive',
      source: 'CNBC'
    },
    {
      title: `${stockInfo.name} announces new product line`,
      sentiment: 'positive',
      source: 'TechCrunch'
    },
    {
      title: `Market volatility affects ${ticker} trading`,
      sentiment: 'neutral',
      source: 'Bloomberg'
    },
    {
      title: `${stockInfo.name} faces regulatory scrutiny`,
      sentiment: 'negative',
      source: 'Reuters'
    },
    {
      title: `Institutional investors increase ${ticker} holdings`,
      sentiment: 'positive',
      source: 'Financial Times'
    },
    {
      title: `${stockInfo.name} CEO discusses future strategy`,
      sentiment: 'neutral',
      source: 'WSJ'
    }
  ];
  
  // Randomly select 5-8 news items
  const numArticles = 5 + Math.floor(Math.random() * 4);
  const articles = [];
  const now = Date.now();
  
  for (let i = 0; i < numArticles; i++) {
    const template = newsTemplates[Math.floor(Math.random() * newsTemplates.length)];
    const daysAgo = Math.floor(Math.random() * 7);
    const publishDate = new Date(now - daysAgo * 24 * 60 * 60 * 1000);
    
    articles.push({
      title: template.title,
      summary: `This is a mock news article about ${stockInfo.name}. In a real scenario, this would contain actual news content from financial news sources.`,
      url: `https://example.com/news/${ticker.toLowerCase()}-${i}`,
      source: template.source,
      time_published: publishDate.toISOString(),
      sentiment: template.sentiment,
      score: template.sentiment === 'positive' ? 0.7 : template.sentiment === 'negative' ? -0.6 : 0.1,
      reasoning: `Mock sentiment analysis: ${template.sentiment} tone detected`
    });
  }
  
  return articles;
}

/**
 * Get mock stock data for a ticker
 */
function getMockStockData(ticker) {
  ticker = ticker.toUpperCase();
  
  if (!MOCK_STOCKS[ticker]) {
    throw new Error(`Mock data not available for ${ticker}. Available tickers: ${Object.keys(MOCK_STOCKS).join(', ')}`);
  }
  
  const stockInfo = MOCK_STOCKS[ticker];
  
  // Generate historical data (1825 days = 5 years for full range support)
  const historicalData = generatePriceData(stockInfo.basePrice, 1825);
  const currentData = historicalData[historicalData.length - 1];
  const previousData = historicalData[historicalData.length - 2];
  
  const change = currentData.price - previousData.price;
  const changePercent = ((change / previousData.price) * 100).toFixed(2) + '%';
  
  // Generate news with sentiment
  const newsArticles = generateMockNews(ticker, stockInfo);
  
  // Calculate overall sentiment
  const sentimentScores = newsArticles.map(a => a.score);
  const avgSentiment = sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length;
  const sentimentScore = Math.round(((avgSentiment + 1) / 2) * 100);
  
  return {
    ticker,
    name: stockInfo.name,
    currentPrice: currentData.price,
    change: parseFloat(change.toFixed(2)),
    changePercent: changePercent,
    historicalData: historicalData,
    fundamentals: {
      peRatio: stockInfo.peRatio,
      marketCap: stockInfo.marketCap,
      sector: stockInfo.sector,
      industry: stockInfo.industry,
      eps: (stockInfo.basePrice / stockInfo.peRatio).toFixed(2),
      dividendYield: (1.5 + Math.random() * 2).toFixed(2) + '%'
    },
    news: newsArticles,
    sentiment: {
      overallScore: sentimentScore,
      sentiment: sentimentScore >= 60 ? 'positive' : sentimentScore <= 40 ? 'negative' : 'neutral',
      articles: newsArticles
    }
  };
}

/**
 * Add delay to simulate API call
 */
async function simulateApiDelay() {
  const delay = 200 + Math.random() * 300; // 200-500ms
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Mock analyze function
 */
async function analyzeMock(ticker) {
  console.log(`[MOCK] Analyzing ${ticker}...`);
  
  // Simulate API delay
  await simulateApiDelay();
  
  return getMockStockData(ticker);
}

module.exports = {
  analyzeMock,
  getMockStockData,
  MOCK_STOCKS
};