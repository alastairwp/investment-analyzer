// Sentiment module - displays news sentiment analysis

/**
 * Display sentiment section in analysis view
 * @param {Object} sentimentData - Sentiment analysis data
 */
function displaySentiment(sentimentData) {
  if (!sentimentData || !sentimentData.articles) {
    return '<p class="text-gray-600 dark:text-gray-400">No recent news available</p>';
  }

  const scoreColor = getSentimentScoreColor(sentimentData.overallScore);
  const sentimentLabel = sentimentData.sentiment.toUpperCase();
  const sentimentIcon = getSentimentIcon(sentimentData.sentiment);

  let html = `
    <div class="mb-6">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h4 class="text-lg font-bold text-gray-800 dark:text-gray-100">Overall News Sentiment</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Based on ${sentimentData.articles.length} recent articles</p>
        </div>
        <div class="text-right">
          <div class="flex items-center gap-2">
            <span class="text-2xl">${sentimentIcon}</span>
            <span class="text-2xl font-bold ${scoreColor}">${sentimentLabel}</span>
          </div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Score: ${sentimentData.overallScore}/100</div>
        </div>
      </div>

      <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 mb-4">
        <div class="flex items-center gap-3">
          <div class="flex-1">
            <div class="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
              <div class="${scoreColor.replace('text-', 'bg-')} h-2 rounded-full transition-all"
                   style="width: ${sentimentData.overallScore}%"></div>
            </div>
          </div>
          <div class="text-lg font-bold ${scoreColor}">${sentimentData.overallScore}</div>
        </div>
      </div>
    </div>

    <div class="space-y-3">
      ${sentimentData.articles.map((article, index) => `
        <div class="border ${getSentimentBorderColor(article.sentiment)} rounded-lg overflow-hidden">
          <div class="p-4 ${getSentimentBgColor(article.sentiment)}">
            <div class="flex items-start gap-3 mb-2">
              <span class="text-xl flex-shrink-0">${getSentimentIcon(article.sentiment)}</span>
              <div class="flex-1">
                <a href="${article.url}" target="_blank"
                   class="font-semibold text-gray-800 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 line-clamp-2">
                  ${article.title}
                </a>
                <div class="flex items-center gap-2 mt-1 text-xs text-gray-600 dark:text-gray-400">
                  <span>${article.source}</span>
                  <span>•</span>
                  <span>${formatDate(article.published)}</span>
                  <span>•</span>
                  <span class="font-semibold ${getSentimentScoreColor(article.score * 50 + 50)}">
                    ${article.sentiment.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
            ${article.summary ? `
              <p class="text-sm text-gray-700 dark:text-gray-300 mt-2 line-clamp-2">${article.summary}</p>
            ` : ''}
            ${article.reasoning ? `
              <div class="mt-2 text-xs italic text-gray-600 dark:text-gray-400">
                💡 ${article.reasoning}
              </div>
            ` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;

  return html;
}

/**
 * Get color class for sentiment score
 * @param {number} score - Sentiment score (0-100)
 * @returns {string} Tailwind color class
 */
function getSentimentScoreColor(score) {
  if (score >= 60) return 'text-green-600';
  if (score >= 40) return 'text-yellow-600';
  return 'text-red-600';
}

/**
 * Get background color for sentiment
 * @param {string} sentiment - positive/neutral/negative
 * @returns {string} Tailwind background class
 */
function getSentimentBgColor(sentiment) {
  if (sentiment === 'positive') return 'bg-green-50 dark:bg-green-900/20';
  if (sentiment === 'negative') return 'bg-red-50 dark:bg-red-900/20';
  return 'bg-gray-50 dark:bg-gray-700';
}

/**
 * Get border color for sentiment
 * @param {string} sentiment - positive/neutral/negative
 * @returns {string} Tailwind border class
 */
function getSentimentBorderColor(sentiment) {
  if (sentiment === 'positive') return 'border-green-200 dark:border-green-800';
  if (sentiment === 'negative') return 'border-red-200 dark:border-red-800';
  return 'border-gray-200 dark:border-gray-700';
}

/**
 * Get icon for sentiment
 * @param {string} sentiment - positive/neutral/negative
 * @returns {string} Emoji icon
 */
function getSentimentIcon(sentiment) {
  if (sentiment === 'positive') return '😊';
  if (sentiment === 'negative') return '😟';
  return '😐';
}

/**
 * Format date for display
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date
 */
function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now - date);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
