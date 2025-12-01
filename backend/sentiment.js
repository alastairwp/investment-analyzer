// Sentiment Analysis Module - Uses Claude API for news sentiment

/**
 * Analyze sentiment of news articles using Claude API
 * @param {Array} articles - Array of news article objects
 * @returns {Promise<Object>} Sentiment analysis results
 */
async function analyzeSentiment(articles) {
  if (!articles || articles.length === 0) {
    return {
      overallScore: 50,
      sentiment: 'neutral',
      articles: []
    };
  }

  const analyzedArticles = [];
  let totalSentiment = 0;
  let totalWeight = 0;

  for (let i = 0; i < Math.min(articles.length, 10); i++) {
    const article = articles[i];
    
    try {
      const sentiment = await analyzeArticleSentiment(
        article.title,
        article.summary || ''
      );

      // Calculate recency weight (newer = more important)
      const daysAgo = getDaysAgo(article.time_published);
      const recencyWeight = Math.max(1, 8 - daysAgo); // 7-day window, decaying weight

      const sentimentValue = sentiment.score; // -1 to +1
      totalSentiment += sentimentValue * recencyWeight;
      totalWeight += recencyWeight;

      analyzedArticles.push({
        title: article.title,
        summary: article.summary || '',
        url: article.url,
        published: article.time_published,
        source: article.source,
        sentiment: sentiment.label,
        score: sentiment.score,
        reasoning: sentiment.reasoning
      });
    } catch (error) {
      console.error('Failed to analyze article:', error.message);
    }
  }

  // Calculate overall sentiment score (0-100)
  const avgSentiment = totalWeight > 0 ? totalSentiment / totalWeight : 0;
  const overallScore = Math.round(((avgSentiment + 1) / 2) * 100);

  let sentiment = 'neutral';
  if (overallScore >= 60) sentiment = 'positive';
  else if (overallScore <= 40) sentiment = 'negative';

  return {
    overallScore,
    sentiment,
    articles: analyzedArticles
  };
}

/**
 * Analyze single article sentiment using Claude API
 * @param {string} title - Article title
 * @param {string} summary - Article summary
 * @returns {Promise<Object>} Sentiment result
 */
async function analyzeArticleSentiment(title, summary) {
  const prompt = `Analyze the sentiment of this financial news article. Consider how it would impact investor confidence.

Title: ${title}
Summary: ${summary}

Respond with ONLY a JSON object (no markdown, no explanation) in this exact format:
{
  "score": <number between -1 and 1, where -1 is very bearish, 0 is neutral, 1 is very bullish>,
  "label": "<positive, neutral, or negative>",
  "reasoning": "<one sentence explaining why>"
}`;

  try {
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    
    if (!ANTHROPIC_API_KEY) {
      console.warn('No Anthropic API key found, using neutral sentiment');
      return { score: 0, label: 'neutral', reasoning: 'API key not configured' };
    }
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [
          { role: 'user', content: prompt }
        ]
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error?.message || 'Claude API error');
    }

    const text = data.content[0].text.trim();
    const parsed = JSON.parse(text);

    return {
      score: parsed.score,
      label: parsed.label,
      reasoning: parsed.reasoning
    };
  } catch (error) {
    console.error('Sentiment analysis error:', error);
    // Fallback to neutral if API fails
    return {
      score: 0,
      label: 'neutral',
      reasoning: 'Could not analyze sentiment'
    };
  }
}

/**
 * Calculate days ago from timestamp
 * @param {string} timestamp - ISO timestamp
 * @returns {number} Days ago
 */
function getDaysAgo(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

module.exports = {
  analyzeSentiment
};