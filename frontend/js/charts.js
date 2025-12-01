// Charts module - handles all chart rendering

let priceChart = null;
let macdChart = null;
let williamsChart = null;

// Make currentChartData globally accessible via window object
window.currentChartData = null;
window.currentTimeRange = '1month'; // Default time range
window.timeRangeListenersAttached = false;

/**
 * Filter historical data based on time range
 * @param {Array} historicalData - Full historical data
 * @param {string} range - Time range
 * @returns {Array} Filtered historical data
 */
function filterDataByTimeRange(historicalData, range) {
  switch(range) {
    case '15min':
    case '1hr':
    case '12hr':
      return historicalData.slice(-1);
    case '1day':
      return historicalData.slice(-1);
    case '5day':
      return historicalData.slice(-5);
    case '1month':
      return historicalData.slice(-30);
    case '6month':
      return historicalData.slice(-180);
    case 'ytd':
      const now = new Date();
      const yearStart = new Date(now.getFullYear(), 0, 1);
      return historicalData.filter(d => new Date(d.date) >= yearStart);
    case '1yr':
      return historicalData.slice(-365);
    case '5yr':
      return historicalData.slice(-1825);
    case 'all':
      return historicalData;
    default:
      return historicalData.slice(-30);
  }
}

/**
 * Draw main price chart for analysis view
 */
window.drawPriceChart = function(historicalData, indicators = null, advancedIndicators = null, timeRange = null) {
  console.log('drawPriceChart called with:', {
    dataPoints: historicalData?.length,
    timeRange: timeRange,
    currentTimeRange: window.currentTimeRange
  });
  
  window.currentChartData = { historicalData, indicators, advancedIndicators };
  
  if (timeRange) {
    window.currentTimeRange = timeRange;
  }
  
  // Filter data by time range
  const filteredData = filterDataByTimeRange(historicalData, window.currentTimeRange);
  console.log('Filtered data points:', filteredData.length);
  
  const ctx = document.getElementById('priceChart');
  
  if (priceChart) {
    priceChart.destroy();
  }

  // Prepare datasets
  const datasets = [
    {
      label: 'Price',
      data: filteredData.map(d => d.price),
      borderColor: '#3B82F6',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      borderWidth: 2,
      tension: 0.1,
      fill: true,
      pointRadius: 0,
      pointHoverRadius: 4
    }
  ];

  // Check toggles and add indicators
  const showSMA20 = document.getElementById('toggle-sma20')?.checked;
  const showSMA50 = document.getElementById('toggle-sma50')?.checked;
  const showBB = document.getElementById('toggle-bb')?.checked;
  
  console.log('Chart overlay toggles:', { showSMA20, showSMA50, showBB });

  // Add SMA20 if available and toggled on
  if (showSMA20 && indicators && indicators.sma20) {
    const sma20Data = calculateSMAOverlay(filteredData.map(d => d.price), 20);
    datasets.push({
      label: 'SMA 20',
      data: sma20Data,
      borderColor: '#F59E0B',
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderDash: [5, 5],
      tension: 0.1,
      fill: false,
      pointRadius: 0,
      pointHoverRadius: 4
    });
  }

  // Add SMA50 if available and toggled on
  if (showSMA50 && indicators && indicators.sma50) {
    const sma50Data = calculateSMAOverlay(filteredData.map(d => d.price), 50);
    datasets.push({
      label: 'SMA 50',
      data: sma50Data,
      borderColor: '#EF4444',
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderDash: [10, 5],
      tension: 0.1,
      fill: false,
      pointRadius: 0,
      pointHoverRadius: 4
    });
  }

  // Add Bollinger Bands if available and toggled on
  if (showBB && advancedIndicators && advancedIndicators.bollingerBands) {
    const bb = advancedIndicators.bollingerBands;
    const startIndex = historicalData.length - filteredData.length;
    
    datasets.push({
      label: 'BB Upper',
      data: bb.upper.slice(startIndex),
      borderColor: '#C084FC',
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderDash: [2, 2],
      tension: 0.1,
      fill: false,
      pointRadius: 0
    });
    
    datasets.push({
      label: 'BB Middle',
      data: bb.middle.slice(startIndex),
      borderColor: '#A855F7',
      backgroundColor: 'transparent',
      borderWidth: 1,
      tension: 0.1,
      fill: false,
      pointRadius: 0
    });
    
    datasets.push({
      label: 'BB Lower',
      data: bb.lower.slice(startIndex),
      borderColor: '#C084FC',
      backgroundColor: 'rgba(192, 132, 252, 0.1)',
      borderWidth: 1,
      borderDash: [2, 2],
      tension: 0.1,
      fill: '-2',
      pointRadius: 0
    });
  }

  priceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: filteredData.map(d => {
        const date = new Date(d.date);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }),
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
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
            padding: 15,
            font: {
              size: 11
            },
            filter: (item) => !item.text.startsWith('BB') || showBB
          }
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const label = context.dataset.label || '';
              const value = context.parsed.y;
              return value !== null ? `${label}: $${value.toFixed(2)}` : '';
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          }
        },
        y: {
          ticks: {
            callback: (value) => `$${value.toFixed(0)}`
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.05)'
          }
        }
      }
    }
  });
  
  // Draw MACD and Williams %R if toggled
  updateMACDChart(filteredData, advancedIndicators, historicalData);
  updateWilliamsChart(filteredData, advancedIndicators, historicalData);
};

/**
 * Update MACD chart
 */
function updateMACDChart(filteredData, advancedIndicators, fullData) {
  const showMACD = document.getElementById('toggle-macd')?.checked || false;
  const macdContainer = document.getElementById('macdChart');
  
  if (!showMACD) {
    macdContainer.classList.add('hidden');
    if (macdChart) {
      macdChart.destroy();
      macdChart = null;
    }
    return;
  }
  
  if (!advancedIndicators || !advancedIndicators.macd) return;
  
  macdContainer.classList.remove('hidden');
  
  const macdData = advancedIndicators.macd;
  const startIndex = fullData.length - filteredData.length;
  const ctx = document.getElementById('macdCanvas');
  
  if (macdChart) {
    macdChart.destroy();
  }
  
  macdChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: filteredData.map(d => {
        const date = new Date(d.date);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }),
      datasets: [
        {
          type: 'bar',
          label: 'Histogram',
          data: macdData.histogram.slice(startIndex),
          backgroundColor: macdData.histogram.slice(startIndex).map(v => v >= 0 ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)'),
          borderColor: macdData.histogram.slice(startIndex).map(v => v >= 0 ? '#22C55E' : '#EF4444'),
          borderWidth: 1
        },
        {
          type: 'line',
          label: 'MACD',
          data: macdData.macd.slice(startIndex),
          borderColor: '#3B82F6',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.1
        },
        {
          type: 'line',
          label: 'Signal',
          data: macdData.signal.slice(startIndex),
          borderColor: '#F59E0B',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            font: { size: 10 },
            padding: 10
          }
        }
      },
      scales: {
        x: { display: false },
        y: {
          ticks: { font: { size: 9 } },
          grid: { color: 'rgba(0, 0, 0, 0.05)' }
        }
      }
    }
  });
}

/**
 * Update Williams %R chart
 */
function updateWilliamsChart(filteredData, advancedIndicators, fullData) {
  const showWilliams = document.getElementById('toggle-williams')?.checked || false;
  const williamsContainer = document.getElementById('williamsChart');
  
  if (!showWilliams) {
    williamsContainer.classList.add('hidden');
    if (williamsChart) {
      williamsChart.destroy();
      williamsChart = null;
    }
    return;
  }
  
  if (!advancedIndicators || !advancedIndicators.williamsR) return;
  
  williamsContainer.classList.remove('hidden');
  
  const williamsData = advancedIndicators.williamsR;
  const startIndex = fullData.length - filteredData.length;
  const ctx = document.getElementById('williamsCanvas');
  
  if (williamsChart) {
    williamsChart.destroy();
  }
  
  williamsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: filteredData.map(d => {
        const date = new Date(d.date);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }),
      datasets: [
        {
          label: 'Williams %R',
          data: williamsData.slice(startIndex),
          borderColor: '#8B5CF6',
          backgroundColor: 'rgba(139, 92, 246, 0.1)',
          borderWidth: 2,
          fill: true,
          pointRadius: 0,
          tension: 0.1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { display: false },
        y: {
          min: -100,
          max: 0,
          ticks: {
            font: { size: 9 },
            callback: (value) => value
          },
          grid: { color: 'rgba(0, 0, 0, 0.05)' }
        }
      }
    }
  });
}

/**
 * Draw mini chart for watchlist items
 */
function drawMiniChart(canvasId, historicalData) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const recentData = historicalData.slice(-7);

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: recentData.map(() => ''),
      datasets: [{
        data: recentData.map(d => d.price),
        borderColor: '#3B82F6',
        borderWidth: 1.5,
        tension: 0.3,
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { 
        legend: { display: false }, 
        tooltip: { enabled: false } 
      },
      scales: {
        x: { display: false },
        y: { display: false }
      }
    }
  });
}

/**
 * Calculate SMA overlay for chart
 */
function calculateSMAOverlay(prices, period) {
  const smaData = [];
  
  for (let i = 0; i < period - 1; i++) {
    smaData.push(null);
  }
  
  for (let i = period - 1; i < prices.length; i++) {
    const slice = prices.slice(i - period + 1, i + 1);
    const sum = slice.reduce((a, b) => a + b, 0);
    smaData.push(parseFloat((sum / period).toFixed(2)));
  }
  
  return smaData;
}

/**
 * Redraw all charts
 */
window.redrawCharts = function() {
  console.log('redrawCharts called, currentChartData:', window.currentChartData ? 'exists' : 'undefined');
  if (window.currentChartData) {
    console.log('Redrawing charts with current data');
    window.drawPriceChart(
      window.currentChartData.historicalData,
      window.currentChartData.indicators,
      window.currentChartData.advancedIndicators
    );
  } else {
    console.log('No chart data available to redraw - analyze a stock first');
  }
};

/**
 * Setup indicator toggle listeners
 */
window.setupIndicatorToggles = function() {
  console.log('Setting up indicator toggles...');
  
  ['toggle-sma20', 'toggle-sma50', 'toggle-bb', 'toggle-macd', 'toggle-williams'].forEach(id => {
    const checkbox = document.getElementById(id);
    if (checkbox) {
      checkbox.addEventListener('change', (e) => {
        console.log(`${id} toggled to:`, e.target.checked);
        window.redrawCharts();
      });
      console.log(`✓ Listener attached to ${id}`);
    } else {
      console.warn(`✗ Checkbox ${id} not found in DOM`);
    }
  });
  
  console.log('Indicator toggles setup complete');
};

/**
 * Setup time range toggle listeners
 */
window.setupTimeRangeToggles = function() {
  if (window.timeRangeListenersAttached) {
    console.log('Time range listeners already attached, skipping');
    return;
  }
  
  console.log('Setting up time range toggles...');
  
  const timeRangeBtns = document.querySelectorAll('.time-range-btn');
  console.log('Found time range buttons:', timeRangeBtns.length);
  
  if (timeRangeBtns.length === 0) {
    console.warn('No time range buttons found!');
    return;
  }
  
  timeRangeBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const range = e.target.dataset.range;
      console.log('Time range clicked:', range);
      
      // Update active button styling
      document.querySelectorAll('.time-range-btn').forEach(b => {
        b.classList.remove('bg-blue-500', 'text-white');
        b.classList.add('bg-gray-100');
      });
      e.target.classList.add('bg-blue-500', 'text-white');
      e.target.classList.remove('bg-gray-100');
      
      // Redraw chart with new time range
      if (window.currentChartData) {
        console.log('Redrawing chart with range:', range);
        window.drawPriceChart(
          window.currentChartData.historicalData,
          window.currentChartData.indicators,
          window.currentChartData.advancedIndicators,
          range
        );
      } else {
        console.log('No chart data available');
      }
    });
    console.log(`✓ Listener attached to ${btn.dataset.range}`);
  });
  
  window.timeRangeListenersAttached = true;
  console.log('Time range toggles setup complete');
};