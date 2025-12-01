// Backtest module - handles backtesting functionality

// DOM Elements
const backtestBtn = document.getElementById('backtestBtn');
const backtestModal = document.getElementById('backtestModal');
const closeBacktestBtn = document.getElementById('closeBacktestBtn');
const cancelBacktestBtn = document.getElementById('cancelBacktestBtn');
const runBacktestBtn = document.getElementById('runBacktestBtn');
const backtestConfigForm = document.getElementById('backtestConfigForm');
const backtestLoading = document.getElementById('backtestLoading');
const backtestResults = document.getElementById('backtestResults');

// Event Listeners
backtestBtn.addEventListener('click', openBacktestModal);
closeBacktestBtn.addEventListener('click', closeBacktestModal);
cancelBacktestBtn.addEventListener('click', closeBacktestModal);
runBacktestBtn.addEventListener('click', runBacktest);

// Close modal on background click
backtestModal.addEventListener('click', (e) => {
  if (e.target === backtestModal) {
    closeBacktestModal();
  }
});

function openBacktestModal() {
  backtestModal.classList.remove('hidden');
  resetBacktestForm();
}

function closeBacktestModal() {
  backtestModal.classList.add('hidden');
}

function resetBacktestForm() {
  backtestConfigForm.classList.remove('hidden');
  backtestLoading.classList.add('hidden');
  backtestResults.classList.add('hidden');
}

async function runBacktest() {
  // Get form values
  const tickersInput = document.getElementById('backtestTickers').value;
  const investment = parseFloat(document.getElementById('backtestInvestment').value);
  const startDate = document.getElementById('backtestStartDate').value;
  const endDate = document.getElementById('backtestEndDate').value;

  const percentStrongBuy = parseInt(document.getElementById('percentStrongBuy').value);
  const percentBuy = parseInt(document.getElementById('percentBuy').value);
  const percentSell = parseInt(document.getElementById('percentSell').value);
  const percentStrongSell = parseInt(document.getElementById('percentStrongSell').value);

  // Parse tickers
  const tickers = tickersInput.split(',').map(t => t.trim()).filter(t => t.length > 0);

  // Validate
  if (tickers.length === 0) {
    alert('Please enter at least one ticker');
    return;
  }

  if (investment <= 0) {
    alert('Please enter a valid investment amount');
    return;
  }

  if (!startDate || !endDate) {
    alert('Please select start and end dates');
    return;
  }

  // Build config
  const config = {
    tickers,
    startDate,
    endDate,
    initialInvestment: investment,
    buyPercentages: {
      'STRONG BUY': percentStrongBuy,
      'BUY': percentBuy,
      'SELL': percentSell,
      'STRONG SELL': percentStrongSell
    }
  };

  // Show loading
  backtestConfigForm.classList.add('hidden');
  backtestLoading.classList.remove('hidden');

  try {
    console.log('Running backtest with config:', config);

    const response = await fetch('http://localhost:3001/api/backtest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(config)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to run backtest');
    }

    console.log('Backtest results:', data);
    displayBacktestResults(data);

  } catch (error) {
    console.error('Backtest error:', error);
    alert(`Error: ${error.message}`);
    resetBacktestForm();
  }
}

function displayBacktestResults(data) {
  backtestLoading.classList.add('hidden');
  backtestResults.classList.remove('hidden');

  const summary = data.summary;
  const results = data.results;

  const html = `
    <!-- Summary Card -->
    <div class="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 border-2 border-orange-300 dark:border-orange-700 rounded-lg p-6 mb-6">
      <h3 class="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">📊 Portfolio Summary</h3>

      <div class="grid grid-cols-3 gap-4 mb-4">
        <div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Total Investment</div>
          <div class="text-2xl font-bold text-gray-900 dark:text-gray-100">£${summary.totalInitialInvestment.toFixed(2)}</div>
        </div>
        <div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Final Value</div>
          <div class="text-2xl font-bold ${summary.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}">
            £${summary.totalFinalValue.toFixed(2)}
          </div>
        </div>
        <div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Profit/Loss</div>
          <div class="text-2xl font-bold ${summary.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}">
            ${summary.totalProfit >= 0 ? '+' : ''}£${summary.totalProfit.toFixed(2)}
            <span class="text-lg">(${summary.totalReturnPercent >= 0 ? '+' : ''}${summary.totalReturnPercent.toFixed(2)}%)</span>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4 pt-4 border-t border-orange-200 dark:border-orange-700">
        <div>
          <div class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Strategy Performance</div>
          <div class="text-lg text-gray-900 dark:text-gray-100">
            ${summary.totalTrades} trades executed
          </div>
        </div>
        <div>
          <div class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">vs Buy & Hold</div>
          <div class="text-lg ${summary.outperformance >= 0 ? 'text-green-600' : 'text-red-600'} font-bold">
            ${summary.outperformance >= 0 ? '+' : ''}${summary.outperformance.toFixed(2)}% ${summary.outperformance >= 0 ? '📈' : '📉'}
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">
            Buy & Hold: ${summary.buyAndHold.returnPercent >= 0 ? '+' : ''}${summary.buyAndHold.returnPercent.toFixed(2)}%
          </div>
        </div>
      </div>
    </div>

    <!-- Individual Stock Results -->
    <div class="space-y-4">
      <h3 class="text-lg font-bold text-gray-800 dark:text-gray-100">Individual Stock Performance</h3>

      ${results.map(result => {
        if (result.error) {
          return `
            <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div class="flex items-center gap-2">
                <span class="text-red-600 dark:text-red-400 font-bold">${result.ticker}</span>
                <span class="text-red-600 dark:text-red-400 text-sm">❌ ${result.error}</span>
              </div>
            </div>
          `;
        }

        return `
          <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div class="flex justify-between items-start mb-3">
              <div>
                <h4 class="text-xl font-bold text-gray-800 dark:text-gray-100">${result.ticker}</h4>
                <div class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  ${result.totalTrades} trades (${result.buyTrades} buys, ${result.sellTrades} sells)
                </div>
              </div>
              <div class="text-right">
                <div class="${result.returnPercent >= 0 ? 'text-green-600' : 'text-red-600'} text-2xl font-bold">
                  ${result.returnPercent >= 0 ? '+' : ''}${result.returnPercent.toFixed(2)}%
                </div>
                <div class="text-sm text-gray-600 dark:text-gray-400">
                  £${result.initialInvestment.toFixed(2)} → £${result.finalValue.toFixed(2)}
                </div>
              </div>
            </div>

            <div class="grid grid-cols-4 gap-4 text-sm">
              <div class="bg-gray-50 dark:bg-gray-700 rounded p-2">
                <div class="text-xs text-gray-600 dark:text-gray-400">Final Cash</div>
                <div class="font-semibold text-gray-900 dark:text-gray-100">£${result.finalCash.toFixed(2)}</div>
              </div>
              <div class="bg-gray-50 dark:bg-gray-700 rounded p-2">
                <div class="text-xs text-gray-600 dark:text-gray-400">Final Shares</div>
                <div class="font-semibold text-gray-900 dark:text-gray-100">${result.finalShares}</div>
              </div>
              <div class="bg-gray-50 dark:bg-gray-700 rounded p-2">
                <div class="text-xs text-gray-600 dark:text-gray-400">Share Value</div>
                <div class="font-semibold text-gray-900 dark:text-gray-100">£${result.finalShareValue.toFixed(2)}</div>
              </div>
              <div class="${result.outperformance >= 0 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'} rounded p-2">
                <div class="text-xs text-gray-600 dark:text-gray-400">vs Buy & Hold</div>
                <div class="font-semibold ${result.outperformance >= 0 ? 'text-green-600' : 'text-red-600'}">
                  ${result.outperformance >= 0 ? '+' : ''}${result.outperformance.toFixed(2)}%
                </div>
              </div>
            </div>

            <button onclick="toggleTrades('${result.ticker}')" class="mt-3 text-sm text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 flex items-center gap-1">
              <span id="toggle-arrow-${result.ticker}">▶</span>
              <span>View ${result.totalTrades} Trades</span>
            </button>

            <div id="trades-${result.ticker}" class="hidden mt-3 space-y-2 max-h-64 overflow-y-auto">
              ${result.trades.map(trade => `
                <div class="text-xs p-2 ${trade.action === 'BUY' ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'} border rounded">
                  <div class="flex justify-between items-center">
                    <div>
                      <span class="font-semibold ${trade.action === 'BUY' ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}">
                        ${trade.action}
                      </span>
                      <span class="text-gray-600 dark:text-gray-400">
                        ${trade.shares} shares @ £${trade.price.toFixed(2)}
                      </span>
                    </div>
                    <div class="text-right">
                      <div class="text-gray-900 dark:text-gray-100 font-medium">
                        £${(trade.action === 'BUY' ? trade.cost : trade.proceeds).toFixed(2)}
                      </div>
                      <div class="text-gray-500 dark:text-gray-400">${trade.date}</div>
                    </div>
                  </div>
                  <div class="text-gray-600 dark:text-gray-400 mt-1">
                    ${trade.recommendation} (Score: ${trade.technicalScore})
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>

    <!-- Action Buttons -->
    <div class="flex justify-between items-center mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
      <button
        onclick="resetBacktestForm()"
        class="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
      >
        Run Another Backtest
      </button>
      <button
        onclick="closeBacktestModal()"
        class="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
      >
        Close
      </button>
    </div>
  `;

  backtestResults.innerHTML = html;
}

// Toggle trades visibility
window.toggleTrades = function(ticker) {
  const tradesDiv = document.getElementById(`trades-${ticker}`);
  const arrow = document.getElementById(`toggle-arrow-${ticker}`);

  if (tradesDiv.classList.contains('hidden')) {
    tradesDiv.classList.remove('hidden');
    arrow.textContent = '▼';
  } else {
    tradesDiv.classList.add('hidden');
    arrow.textContent = '▶';
  }
};

// Make functions globally available
window.resetBacktestForm = resetBacktestForm;
window.closeBacktestModal = closeBacktestModal;
