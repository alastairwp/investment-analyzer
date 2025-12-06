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

// Default indicator config - loaded from server or fallback
let defaultIndicatorConfig = {
  rsiPeriod: 14,
  smaShortPeriod: 20,
  smaLongPeriod: 50,
  macdFast: 12,
  macdSlow: 26,
  williamsRPeriod: 14,
  momentumPeriod: 5,
  rsiOversold: 30,
  rsiOverbought: 70,
  rsiModerateOversold: 40,
  rsiModerateOverbought: 60,
  williamsROverbought: -20,
  williamsRModerateOverbought: -30,
  williamsROversold: -80,
  williamsRModerateOversold: -70,
  strongBuyThreshold: 75,
  buyThreshold: 60,
  sellThreshold: 45,
  strongSellThreshold: 30,
  takeProfitPercent: 5,
  stopLossPercent: -8,
  trailingStopActivation: 1.5,
  trailingStopPercent: 1,
  highVolumeRatio: 1.5,
  lowVolumeRatio: 0.7,
  volumeSpikeRatio: 2.0,
  bigMoveThreshold: 3,
  smallMoveThreshold: 2,
  consecutiveDownStrong: 3,
  consecutiveDownModerate: 2,
  lateSessionHour: 14,
  lateSessionMinute: 30,
  morningSessionEndHour: 11,
  morningReversalStrong: 0.8,
  morningReversalModerate: 0.5,
  resampleMinutes: 30
};

// Uploaded file storage
let uploadedCsvFile = null;

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

// Data source radio button handlers
document.querySelectorAll('input[name="dataSourceType"]').forEach(radio => {
  radio.addEventListener('change', handleDataSourceChange);
});

// CSV file input handler
document.getElementById('csvFileInput')?.addEventListener('change', handleCsvFileSelect);

// Reset config button
document.getElementById('resetConfigBtn')?.addEventListener('click', resetToDefaults);

// Initialize on load - fetch default config from server
async function initBacktestConfig() {
  try {
    const API_URL = window.API_BASE_URL || 'http://localhost:3001/api';
    const response = await fetch(`${API_URL}/backtest/config`);
    if (response.ok) {
      const serverConfig = await response.json();
      defaultIndicatorConfig = { ...defaultIndicatorConfig, ...serverConfig };
      console.log('Loaded default indicator config from server');
    }
  } catch (error) {
    console.warn('Could not load default config from server, using local defaults');
  }
}

// Call init when script loads
initBacktestConfig();

function handleDataSourceChange(e) {
  const value = e.target.value;
  const uploadSection = document.getElementById('uploadCsvSection');
  const resampleSection = document.getElementById('resampleSection');

  if (value === 'upload') {
    uploadSection.classList.remove('hidden');
    resampleSection.classList.remove('hidden');
  } else if (value === 'default') {
    uploadSection.classList.add('hidden');
    resampleSection.classList.remove('hidden');
  } else {
    // API
    uploadSection.classList.add('hidden');
    resampleSection.classList.add('hidden');
  }
}

function handleCsvFileSelect(e) {
  const file = e.target.files[0];
  if (file) {
    uploadedCsvFile = file;
    const infoEl = document.getElementById('uploadedFileInfo');
    infoEl.textContent = `Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    infoEl.classList.remove('hidden');
  }
}

// Toggle collapsible config sections
window.toggleConfigSection = function(sectionId) {
  const section = document.getElementById(sectionId);
  const arrow = document.getElementById(`${sectionId}-arrow`);

  if (section.classList.contains('hidden')) {
    section.classList.remove('hidden');
    arrow.textContent = '▼';
  } else {
    section.classList.add('hidden');
    arrow.textContent = '▶';
  }
};

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
  uploadedCsvFile = null;
}

function resetToDefaults() {
  // Reset all indicator config fields to defaults
  const fields = {
    cfgRsiPeriod: defaultIndicatorConfig.rsiPeriod,
    cfgWilliamsRPeriod: defaultIndicatorConfig.williamsRPeriod,
    cfgMomentumPeriod: defaultIndicatorConfig.momentumPeriod,
    cfgSmaShortPeriod: defaultIndicatorConfig.smaShortPeriod,
    cfgSmaLongPeriod: defaultIndicatorConfig.smaLongPeriod,
    cfgMacdFast: defaultIndicatorConfig.macdFast,
    cfgMacdSlow: defaultIndicatorConfig.macdSlow,
    cfgRsiOversold: defaultIndicatorConfig.rsiOversold,
    cfgRsiModerateOversold: defaultIndicatorConfig.rsiModerateOversold,
    cfgRsiModerateOverbought: defaultIndicatorConfig.rsiModerateOverbought,
    cfgRsiOverbought: defaultIndicatorConfig.rsiOverbought,
    cfgWilliamsROversold: defaultIndicatorConfig.williamsROversold,
    cfgWilliamsRModerateOversold: defaultIndicatorConfig.williamsRModerateOversold,
    cfgWilliamsRModerateOverbought: defaultIndicatorConfig.williamsRModerateOverbought,
    cfgWilliamsROverbought: defaultIndicatorConfig.williamsROverbought,
    cfgStrongBuyThreshold: defaultIndicatorConfig.strongBuyThreshold,
    cfgBuyThreshold: defaultIndicatorConfig.buyThreshold,
    cfgSellThreshold: defaultIndicatorConfig.sellThreshold,
    cfgStrongSellThreshold: defaultIndicatorConfig.strongSellThreshold,
    cfgTakeProfitPercent: defaultIndicatorConfig.takeProfitPercent,
    cfgStopLossPercent: defaultIndicatorConfig.stopLossPercent,
    cfgTrailingStopActivation: defaultIndicatorConfig.trailingStopActivation,
    cfgTrailingStopPercent: defaultIndicatorConfig.trailingStopPercent,
    cfgHighVolumeRatio: defaultIndicatorConfig.highVolumeRatio,
    cfgLowVolumeRatio: defaultIndicatorConfig.lowVolumeRatio,
    cfgVolumeSpikeRatio: defaultIndicatorConfig.volumeSpikeRatio,
    cfgBigMoveThreshold: defaultIndicatorConfig.bigMoveThreshold,
    cfgSmallMoveThreshold: defaultIndicatorConfig.smallMoveThreshold,
    cfgConsecutiveDownStrong: defaultIndicatorConfig.consecutiveDownStrong,
    cfgConsecutiveDownModerate: defaultIndicatorConfig.consecutiveDownModerate,
    cfgLateSessionHour: defaultIndicatorConfig.lateSessionHour,
    cfgLateSessionMinute: defaultIndicatorConfig.lateSessionMinute,
    cfgMorningSessionEndHour: defaultIndicatorConfig.morningSessionEndHour,
    cfgMorningReversalStrong: defaultIndicatorConfig.morningReversalStrong,
    cfgMorningReversalModerate: defaultIndicatorConfig.morningReversalModerate,
    resampleMinutes: defaultIndicatorConfig.resampleMinutes
  };

  for (const [id, value] of Object.entries(fields)) {
    const el = document.getElementById(id);
    if (el) el.value = value;
  }
}

// Get value from input, return undefined if empty/invalid
function getInputValue(id, type = 'int') {
  const el = document.getElementById(id);
  if (!el) return undefined;
  const val = el.value;
  if (val === '' || val === null) return undefined;
  return type === 'float' ? parseFloat(val) : parseInt(val, 10);
}

// Build indicator config from form
function buildIndicatorConfig() {
  return {
    rsiPeriod: getInputValue('cfgRsiPeriod'),
    williamsRPeriod: getInputValue('cfgWilliamsRPeriod'),
    momentumPeriod: getInputValue('cfgMomentumPeriod'),
    smaShortPeriod: getInputValue('cfgSmaShortPeriod'),
    smaLongPeriod: getInputValue('cfgSmaLongPeriod'),
    macdFast: getInputValue('cfgMacdFast'),
    macdSlow: getInputValue('cfgMacdSlow'),
    rsiOversold: getInputValue('cfgRsiOversold'),
    rsiModerateOversold: getInputValue('cfgRsiModerateOversold'),
    rsiModerateOverbought: getInputValue('cfgRsiModerateOverbought'),
    rsiOverbought: getInputValue('cfgRsiOverbought'),
    williamsROversold: getInputValue('cfgWilliamsROversold'),
    williamsRModerateOversold: getInputValue('cfgWilliamsRModerateOversold'),
    williamsRModerateOverbought: getInputValue('cfgWilliamsRModerateOverbought'),
    williamsROverbought: getInputValue('cfgWilliamsROverbought'),
    strongBuyThreshold: getInputValue('cfgStrongBuyThreshold'),
    buyThreshold: getInputValue('cfgBuyThreshold'),
    sellThreshold: getInputValue('cfgSellThreshold'),
    strongSellThreshold: getInputValue('cfgStrongSellThreshold'),
    takeProfitPercent: getInputValue('cfgTakeProfitPercent', 'float'),
    stopLossPercent: getInputValue('cfgStopLossPercent', 'float'),
    trailingStopActivation: getInputValue('cfgTrailingStopActivation', 'float'),
    trailingStopPercent: getInputValue('cfgTrailingStopPercent', 'float'),
    highVolumeRatio: getInputValue('cfgHighVolumeRatio', 'float'),
    lowVolumeRatio: getInputValue('cfgLowVolumeRatio', 'float'),
    volumeSpikeRatio: getInputValue('cfgVolumeSpikeRatio', 'float'),
    bigMoveThreshold: getInputValue('cfgBigMoveThreshold', 'float'),
    smallMoveThreshold: getInputValue('cfgSmallMoveThreshold', 'float'),
    consecutiveDownStrong: getInputValue('cfgConsecutiveDownStrong'),
    consecutiveDownModerate: getInputValue('cfgConsecutiveDownModerate'),
    lateSessionHour: getInputValue('cfgLateSessionHour'),
    lateSessionMinute: getInputValue('cfgLateSessionMinute'),
    morningSessionEndHour: getInputValue('cfgMorningSessionEndHour'),
    morningReversalStrong: getInputValue('cfgMorningReversalStrong', 'float'),
    morningReversalModerate: getInputValue('cfgMorningReversalModerate', 'float'),
    resampleMinutes: getInputValue('resampleMinutes')
  };
}

async function runBacktest() {
  // Get form values
  const tickersInput = document.getElementById('backtestTickers').value;
  const investment = parseFloat(document.getElementById('backtestInvestment').value);
  const startDate = document.getElementById('backtestStartDate').value;
  const endDate = document.getElementById('backtestEndDate').value;
  const forceRefresh = document.getElementById('forceRefreshCache')?.checked || false;

  const percentStrongBuy = parseInt(document.getElementById('percentStrongBuy').value);
  const percentBuy = parseInt(document.getElementById('percentBuy').value);
  const percentSell = parseInt(document.getElementById('percentSell').value);
  const percentStrongSell = parseInt(document.getElementById('percentStrongSell').value);

  // Get data source type
  const dataSourceType = document.querySelector('input[name="dataSourceType"]:checked')?.value || 'api';
  const resampleMinutes = parseInt(document.getElementById('resampleMinutes')?.value || '30');

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

  // Build indicator config
  const indicatorConfig = buildIndicatorConfig();

  // Build data source config
  let dataSource = null;
  if (dataSourceType === 'default') {
    dataSource = {
      type: 'file',
      path: 'dataset_appl_2019.txt',
      resampleMinutes
    };
  } else if (dataSourceType === 'upload' && uploadedCsvFile) {
    // First upload the file
    backtestConfigForm.classList.add('hidden');
    backtestLoading.classList.remove('hidden');

    try {
      const API_URL = window.API_BASE_URL || 'http://localhost:3001/api';
      const formData = new FormData();
      formData.append('file', uploadedCsvFile);

      const uploadResponse = await fetch(`${API_URL}/backtest/upload-csv`, {
        method: 'POST',
        body: formData
      });

      if (!uploadResponse.ok) {
        const err = await uploadResponse.json();
        throw new Error(err.error || 'Failed to upload CSV file');
      }

      const uploadResult = await uploadResponse.json();
      console.log('CSV uploaded:', uploadResult);

      dataSource = {
        type: 'file',
        path: uploadResult.filename,
        resampleMinutes
      };
    } catch (error) {
      console.error('Upload error:', error);
      alert(`Upload failed: ${error.message}`);
      resetBacktestForm();
      return;
    }
  }

  // Build config
  const config = {
    tickers,
    startDate,
    endDate,
    initialInvestment: investment,
    forceRefresh,
    buyPercentages: {
      'STRONG BUY': percentStrongBuy,
      'BUY': percentBuy,
      'SELL': percentSell,
      'STRONG SELL': percentStrongSell
    },
    indicatorConfig
  };

  // Add dataSource if using file
  if (dataSource) {
    config.dataSource = dataSource;
  }

  // Show loading
  backtestConfigForm.classList.add('hidden');
  backtestLoading.classList.remove('hidden');

  try {
    console.log('Running backtest with config:', config);

    // Use the API_BASE_URL from api.js (assumes it's loaded first)
    const API_URL = window.API_BASE_URL || 'http://localhost:3001/api';

    const response = await fetch(`${API_URL}/backtest`, {
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

  // Check if summary has an error (all stocks failed)
  if (summary.error) {
    // Collect specific errors from failed stocks
    const specificErrors = results
      .filter(r => r.error)
      .map(r => `<li><strong>${r.ticker}</strong>: ${r.error}</li>`)
      .join('');

    backtestResults.innerHTML = `
      <div class="bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700 rounded-lg p-6">
        <div class="text-center">
          <div class="text-4xl mb-4">X</div>
          <h3 class="text-xl font-bold text-red-800 dark:text-red-300 mb-2">All Backtests Failed</h3>
          <p class="text-red-700 dark:text-red-400 mb-4">${summary.error}</p>
        </div>

        <div class="text-left mt-6 bg-white dark:bg-gray-800 rounded p-4">
          <p class="font-semibold text-gray-800 dark:text-gray-200 mb-2">Specific errors for each stock:</p>
          <ul class="list-none space-y-1 text-sm text-gray-700 dark:text-gray-300">
            ${specificErrors}
          </ul>
        </div>

        <div class="text-sm text-gray-600 dark:text-gray-400 mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded">
          <p class="font-semibold mb-2">Common solutions:</p>
          <ul class="list-disc list-inside space-y-1">
            <li><strong>Invalid ticker:</strong> Use US stocks (e.g., AAPL, MSFT, GOOGL). UK stocks (.L) not supported on free tier.</li>
            <li><strong>API rate limit:</strong> Free tier allows 5 calls/minute. Wait 60 seconds and try again.</li>
            <li><strong>No data available:</strong> Try a more recent date range (e.g., last 1-2 months).</li>
          </ul>
        </div>

        <div class="text-center mt-6">
          <button
            onclick="resetBacktestForm()"
            class="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
          >
            Try Again
          </button>
        </div>
      </div>
    `;
    return;
  }

  const html = `
    <!-- Summary Card -->
    <div class="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 border-2 border-orange-300 dark:border-orange-700 rounded-lg p-6 mb-6">
      <h3 class="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">Portfolio Summary</h3>

      <div class="grid grid-cols-3 gap-4 mb-4">
        <div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Total Investment</div>
          <div class="text-2xl font-bold text-gray-900 dark:text-gray-100">$${summary.totalInitialInvestment.toFixed(2)}</div>
        </div>
        <div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Final Value</div>
          <div class="text-2xl font-bold ${summary.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}">
            $${summary.totalFinalValue.toFixed(2)}
          </div>
        </div>
        <div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Profit/Loss</div>
          <div class="text-2xl font-bold ${summary.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}">
            ${summary.totalProfit >= 0 ? '+' : ''}$${summary.totalProfit.toFixed(2)}
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
            ${summary.outperformance >= 0 ? '+' : ''}${summary.outperformance.toFixed(2)}%
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
                <span class="text-red-600 dark:text-red-400 text-sm">Error: ${result.error}</span>
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
                  $${result.initialInvestment.toFixed(2)} -> $${result.finalValue.toFixed(2)}
                </div>
              </div>
            </div>

            <!-- Price Chart with Buy/Sell Arrows -->
            ${result.priceHistory && result.priceHistory.length > 0 ? `
              <div class="mb-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                <div class="flex justify-between items-center mb-2">
                  <div class="text-xs text-gray-600 dark:text-gray-400 font-medium">Price Chart with Trade Markers</div>
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-gray-500 dark:text-gray-400">Scroll to zoom, drag to pan</span>
                    <button
                      onclick="resetChartZoom('chart-${result.ticker}')"
                      class="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-500"
                    >
                      Reset Zoom
                    </button>
                  </div>
                </div>
                <div style="height: 220px;">
                  <canvas id="chart-${result.ticker}"></canvas>
                </div>
              </div>
            ` : ''}

            <div class="grid grid-cols-4 gap-4 text-sm">
              <div class="bg-gray-50 dark:bg-gray-700 rounded p-2">
                <div class="text-xs text-gray-600 dark:text-gray-400">Final Cash</div>
                <div class="font-semibold text-gray-900 dark:text-gray-100">$${result.finalCash.toFixed(2)}</div>
              </div>
              <div class="bg-gray-50 dark:bg-gray-700 rounded p-2">
                <div class="text-xs text-gray-600 dark:text-gray-400">Final Shares</div>
                <div class="font-semibold text-gray-900 dark:text-gray-100">${result.finalShares}</div>
              </div>
              <div class="bg-gray-50 dark:bg-gray-700 rounded p-2">
                <div class="text-xs text-gray-600 dark:text-gray-400">Share Value</div>
                <div class="font-semibold text-gray-900 dark:text-gray-100">$${result.finalShareValue.toFixed(2)}</div>
              </div>
              <div class="${result.outperformance >= 0 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'} rounded p-2">
                <div class="text-xs text-gray-600 dark:text-gray-400">vs Buy & Hold</div>
                <div class="font-semibold ${result.outperformance >= 0 ? 'text-green-600' : 'text-red-600'}">
                  ${result.outperformance >= 0 ? '+' : ''}${result.outperformance.toFixed(2)}%
                </div>
              </div>
            </div>

            <button onclick="toggleTrades('${result.ticker}')" class="mt-3 text-sm text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 flex items-center gap-1">
              <span id="toggle-arrow-${result.ticker}">></span>
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
                        ${trade.shares} shares @ $${trade.price.toFixed(2)}
                      </span>
                    </div>
                    <div class="text-right">
                      <div class="text-gray-900 dark:text-gray-100 font-medium">
                        $${(trade.action === 'BUY' ? trade.cost : trade.proceeds).toFixed(2)}
                      </div>
                      ${trade.action === 'SELL' && trade.profitPercent !== undefined ? `
                        <div class="text-xs font-semibold ${trade.profitPercent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}">
                          ${trade.profitPercent >= 0 ? '+' : ''}${trade.profitPercent.toFixed(1)}% ($${trade.profit >= 0 ? '+' : ''}${trade.profit.toFixed(2)})
                        </div>
                      ` : ''}
                      <div class="text-gray-500 dark:text-gray-400 text-xs">${trade.datetime || trade.date}</div>
                    </div>
                  </div>
                  <div class="mt-2 pt-2 border-t ${trade.action === 'BUY' ? 'border-green-200 dark:border-green-800' : 'border-red-200 dark:border-red-800'}">
                    <div class="font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      ${trade.recommendation} (Score: ${trade.technicalScore})
                    </div>
                    <div class="text-gray-700 dark:text-gray-300 text-xs mb-2 italic bg-white dark:bg-gray-700 p-2 rounded">
                      ${trade.rationale}
                    </div>
                    <div class="text-gray-600 dark:text-gray-400 text-xs">
                      <div class="font-medium mb-1">Technical Indicators:</div>
                      <div class="grid grid-cols-2 gap-x-4 gap-y-1">
                        <div>RSI: ${trade.indicators.rsi}${getRSIIndicator(trade.indicators.rsi)}</div>
                        <div>MACD: ${trade.indicators.macd}${getMACDIndicator(trade.indicators.macd)}</div>
                        <div>SMA20: ${trade.indicators.sma20}${getSMAIndicator(trade.indicators.price, trade.indicators.sma20, 'SMA20')}</div>
                        <div>SMA50: ${trade.indicators.sma50}${getSMAIndicator(trade.indicators.price, trade.indicators.sma50, 'SMA50')}</div>
                      </div>
                    </div>
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

  // Initialize charts for each stock result
  initializeBacktestCharts(results);
}

// Toggle trades visibility
window.toggleTrades = function(ticker) {
  const tradesDiv = document.getElementById(`trades-${ticker}`);
  const arrow = document.getElementById(`toggle-arrow-${ticker}`);

  if (tradesDiv.classList.contains('hidden')) {
    tradesDiv.classList.remove('hidden');
    arrow.textContent = 'v';
  } else {
    tradesDiv.classList.add('hidden');
    arrow.textContent = '>';
  }
};

// Helper functions to interpret indicators
function getRSIIndicator(rsi) {
  const rsiVal = parseFloat(rsi);
  if (isNaN(rsiVal)) return '';
  if (rsiVal < 30) return ' (Oversold)';
  if (rsiVal > 70) return ' (Overbought)';
  if (rsiVal >= 40 && rsiVal <= 60) return ' (Neutral)';
  return '';
}

function getMACDIndicator(macd) {
  if (macd === 'N/A') return '';
  const macdVal = parseFloat(macd);
  if (isNaN(macdVal)) return '';
  if (macdVal > 0) return ' (Bullish)';
  if (macdVal < 0) return ' (Bearish)';
  return ' (Neutral)';
}

function getSMAIndicator(price, sma) {
  if (sma === 'N/A') return '';
  const priceVal = parseFloat(price);
  const smaVal = parseFloat(sma);
  if (isNaN(priceVal) || isNaN(smaVal)) return '';
  if (priceVal > smaVal) return ' (Above)';
  if (priceVal < smaVal) return ' (Below)';
  return ' (At)';
}

// Store chart instances for cleanup
const backtestCharts = {};

/**
 * Render price chart with buy/sell arrows for a stock
 */
function renderBacktestChart(canvasId, result) {
  // Clean up existing chart if present
  if (backtestCharts[canvasId]) {
    backtestCharts[canvasId].destroy();
    delete backtestCharts[canvasId];
  }

  const canvas = document.getElementById(canvasId);
  if (!canvas || !result.priceHistory || result.priceHistory.length === 0) {
    console.warn(`Cannot render chart: missing canvas or price history for ${canvasId}`);
    return;
  }

  const ctx = canvas.getContext('2d');

  // Prepare price data - create sparse arrays for buy/sell that align with price data indices
  const labels = result.priceHistory.map(p => {
    const dt = p.datetime;
    if (dt.includes(' ')) {
      return dt.split(' ')[0]; // Date part only
    }
    return dt;
  });
  const prices = result.priceHistory.map(p => p.close);

  // Create sparse arrays for buy/sell markers aligned with price data indices
  const buyData = new Array(prices.length).fill(null);
  const sellData = new Array(prices.length).fill(null);

  // Create a map of datetime to index for placing trade markers
  const datetimeToIndex = {};
  result.priceHistory.forEach((p, i) => {
    datetimeToIndex[p.datetime] = i;
  });

  // Place markers at the correct index using the PRICE LINE value (not trade price)
  result.trades.forEach(trade => {
    const tradeDatetime = trade.datetime || trade.date;
    let nearestIdx = datetimeToIndex[tradeDatetime];

    if (nearestIdx === undefined) {
      // Find closest datetime in priceHistory
      let minDiff = Infinity;
      result.priceHistory.forEach((p, i) => {
        const diff = Math.abs(new Date(p.datetime) - new Date(tradeDatetime));
        if (diff < minDiff) {
          minDiff = diff;
          nearestIdx = i;
        }
      });
    }

    if (nearestIdx !== undefined) {
      // Use the price from the chart line, not the trade price, so markers sit on the line
      const chartPrice = prices[nearestIdx];
      if (trade.action === 'BUY') {
        buyData[nearestIdx] = chartPrice;
      } else if (trade.action === 'SELL') {
        sellData[nearestIdx] = chartPrice;
      }
    }
  });

  // Create chart with zoom plugin
  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: `${result.ticker} Price`,
          data: prices,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          borderWidth: 1.5,
          fill: true,
          tension: 0.1,
          pointRadius: 0,
          pointHoverRadius: 4,
          order: 2 // Draw price line behind markers
        },
        {
          label: 'Buy',
          data: buyData,
          backgroundColor: '#10b981',
          borderColor: '#047857',
          pointStyle: 'triangle',
          pointRadius: 7,
          pointHoverRadius: 10,
          borderWidth: 2,
          showLine: false,
          order: 1 // Draw markers on top
        },
        {
          label: 'Sell',
          data: sellData,
          backgroundColor: '#ef4444',
          borderColor: '#b91c1c',
          pointStyle: 'triangle',
          rotation: 180,
          pointRadius: 7,
          pointHoverRadius: 10,
          borderWidth: 2,
          showLine: false,
          order: 0 // Draw markers on top
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            usePointStyle: true,
            boxWidth: 8,
            font: { size: 10 }
          }
        },
        tooltip: {
          filter: function(tooltipItem) {
            // Only show tooltip for non-null values
            return tooltipItem.raw !== null;
          },
          callbacks: {
            label: function(context) {
              if (context.raw === null) return null;
              if (context.dataset.label === 'Buy') {
                return `Buy @ $${context.parsed.y.toFixed(2)}`;
              } else if (context.dataset.label === 'Sell') {
                return `Sell @ $${context.parsed.y.toFixed(2)}`;
              }
              return `Price: $${context.parsed.y.toFixed(2)}`;
            }
          }
        },
        zoom: {
          pan: {
            enabled: true,
            mode: 'x',
            modifierKey: null
          },
          zoom: {
            wheel: {
              enabled: true
            },
            pinch: {
              enabled: true
            },
            drag: {
              enabled: true,
              backgroundColor: 'rgba(99, 102, 241, 0.2)',
              borderColor: 'rgba(99, 102, 241, 0.8)',
              borderWidth: 1
            },
            mode: 'x'
          }
        }
      },
      scales: {
        x: {
          display: true,
          ticks: {
            maxTicksLimit: 8,
            font: { size: 9 }
          },
          grid: {
            display: false
          }
        },
        y: {
          display: true,
          ticks: {
            callback: function(value) {
              return '$' + value.toFixed(0);
            },
            font: { size: 9 }
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.05)'
          }
        }
      }
    }
  });

  backtestCharts[canvasId] = chart;
}

/**
 * Reset chart zoom to original view
 */
function resetChartZoom(canvasId) {
  if (backtestCharts[canvasId]) {
    backtestCharts[canvasId].resetZoom();
  }
}

/**
 * Initialize all charts after results are displayed
 */
function initializeBacktestCharts(results) {
  results.forEach(result => {
    if (!result.error && result.priceHistory) {
      const canvasId = `chart-${result.ticker}`;
      // Use setTimeout to ensure DOM is ready
      setTimeout(() => renderBacktestChart(canvasId, result), 100);
    }
  });
}

// Make functions globally available
window.resetBacktestForm = resetBacktestForm;
window.closeBacktestModal = closeBacktestModal;
window.getRSIIndicator = getRSIIndicator;
window.getMACDIndicator = getMACDIndicator;
window.getSMAIndicator = getSMAIndicator;
window.renderBacktestChart = renderBacktestChart;
window.resetChartZoom = resetChartZoom;
