/**
 * Real-Time Monitor Frontend Module
 * Handles the real-time monitoring UI and API interactions
 */

// Monitor state
let monitorRefreshInterval = null;

// Toggle section visibility
function toggleMonitorSection(sectionId) {
  const section = document.getElementById(sectionId);
  const arrow = document.getElementById(sectionId + '-arrow');

  if (section.classList.contains('hidden')) {
    section.classList.remove('hidden');
    arrow.textContent = '▼';
  } else {
    section.classList.add('hidden');
    arrow.textContent = '▶';
  }
}

// Initialize monitor
async function initMonitor() {
  // Modal controls
  const monitorBtn = document.getElementById('monitorBtn');
  const monitorModal = document.getElementById('monitorModal');
  const closeMonitorBtn = document.getElementById('closeMonitorBtn');

  if (monitorBtn) {
    monitorBtn.addEventListener('click', () => {
      monitorModal.classList.remove('hidden');
      loadMonitorStatus();
      loadMonitorConfig();
      loadActivityLogs();
    });
  }

  if (closeMonitorBtn) {
    closeMonitorBtn.addEventListener('click', () => {
      monitorModal.classList.add('hidden');
    });
  }

  // Close modal on outside click
  monitorModal?.addEventListener('click', (e) => {
    if (e.target === monitorModal) {
      monitorModal.classList.add('hidden');
    }
  });

  // Email enabled toggle
  const emailEnabled = document.getElementById('emailEnabled');
  const emailSettings = document.getElementById('emailSettings');

  emailEnabled?.addEventListener('change', () => {
    if (emailEnabled.checked) {
      emailSettings.classList.remove('hidden');
    } else {
      emailSettings.classList.add('hidden');
    }
  });

  // Button handlers
  document.getElementById('startMonitorBtn')?.addEventListener('click', startMonitor);
  document.getElementById('stopMonitorBtn')?.addEventListener('click', stopMonitor);
  document.getElementById('manualCheckBtn')?.addEventListener('click', manualCheck);
  document.getElementById('saveMonitorConfigBtn')?.addEventListener('click', saveMonitorConfig);
  document.getElementById('refreshLogsBtn')?.addEventListener('click', loadActivityLogs);
}

// Load current monitor status
async function loadMonitorStatus() {
  try {
    const response = await fetch(`${API_BASE_URL}/monitor/status`);
    const data = await response.json();

    updateMonitorUI(data);

    if (data.signals && data.signals.length > 0) {
      renderSignals(data.signals);
    }

    if (data.alertHistory && data.alertHistory.length > 0) {
      renderAlertHistory(data.alertHistory);
    }

  } catch (error) {
    console.error('Failed to load monitor status:', error);
  }
}

// Load monitor configuration
async function loadMonitorConfig() {
  try {
    const response = await fetch(`${API_BASE_URL}/monitor/config`);
    const config = await response.json();

    // Populate form
    document.getElementById('monitorTickers').value = config.tickers?.join(', ') || 'AAPL, MSFT, GOOGL';
    document.getElementById('monitorInterval').value = config.intervalMinutes || 30;

    // Email settings
    const emailEnabled = document.getElementById('emailEnabled');
    const emailSettings = document.getElementById('emailSettings');

    if (config.email?.enabled) {
      emailEnabled.checked = true;
      emailSettings.classList.remove('hidden');
      document.getElementById('emailUser').value = config.email.user || '';
      document.getElementById('emailRecipient').value = config.email.recipient || '';
    }

    // Alert types
    document.getElementById('alertStrongBuy').checked = config.alertOnStrongBuy !== false;
    document.getElementById('alertBuy').checked = config.alertOnBuy !== false;
    document.getElementById('alertStrongSell').checked = config.alertOnStrongSell !== false;
    document.getElementById('alertSell').checked = config.alertOnSell === true;

  } catch (error) {
    console.error('Failed to load monitor config:', error);
  }
}

// Update monitor UI based on status
function updateMonitorUI(data) {
  const indicator = document.getElementById('monitorStatusIndicator');
  const statusText = document.getElementById('monitorStatusText');
  const statusDetail = document.getElementById('monitorStatusDetail');
  const startBtn = document.getElementById('startMonitorBtn');
  const stopBtn = document.getElementById('stopMonitorBtn');
  const statusCard = document.getElementById('monitorStatusCard');

  if (data.isRunning) {
    indicator.classList.remove('bg-gray-400', 'bg-red-500');
    indicator.classList.add('bg-green-500');
    statusText.textContent = 'Running';
    statusDetail.textContent = `Monitoring ${data.config?.tickers?.length || 0} ticker(s) every ${data.config?.intervalMinutes || 30} minutes`;
    startBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');
    statusCard.classList.remove('border-gray-200', 'dark:border-gray-700');
    statusCard.classList.add('border-green-500', 'bg-green-50', 'dark:bg-green-900/20');

    // Start auto-refresh
    if (!monitorRefreshInterval) {
      monitorRefreshInterval = setInterval(loadMonitorStatus, 30000);
    }
  } else {
    indicator.classList.remove('bg-green-500', 'bg-red-500');
    indicator.classList.add('bg-gray-400');
    statusText.textContent = 'Not Running';
    statusDetail.textContent = '';
    startBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
    statusCard.classList.remove('border-green-500', 'bg-green-50', 'dark:bg-green-900/20');
    statusCard.classList.add('border-gray-200', 'dark:border-gray-700');

    // Stop auto-refresh
    if (monitorRefreshInterval) {
      clearInterval(monitorRefreshInterval);
      monitorRefreshInterval = null;
    }
  }
}

// Start the monitor
async function startMonitor() {
  const startBtn = document.getElementById('startMonitorBtn');
  startBtn.disabled = true;
  startBtn.innerHTML = '<span class="animate-spin">⏳</span> Starting...';

  try {
    // Save config first (without showing confirmation)
    const saved = await saveMonitorConfig(false);
    if (!saved) {
      throw new Error('Failed to save configuration');
    }

    const response = await fetch(`${API_BASE_URL}/monitor/start`, { method: 'POST' });
    const result = await response.json();

    if (result.error) {
      alert('Failed to start monitor: ' + result.error);
    } else {
      await loadMonitorStatus();
    }
  } catch (error) {
    alert('Failed to start monitor: ' + error.message);
  } finally {
    startBtn.disabled = false;
    startBtn.innerHTML = '<span>▶</span> <span>Start</span>';
  }
}

// Stop the monitor
async function stopMonitor() {
  const stopBtn = document.getElementById('stopMonitorBtn');
  stopBtn.disabled = true;

  try {
    const response = await fetch(`${API_BASE_URL}/monitor/stop`, { method: 'POST' });
    await response.json();
    await loadMonitorStatus();
  } catch (error) {
    alert('Failed to stop monitor: ' + error.message);
  } finally {
    stopBtn.disabled = false;
  }
}

// Manual check
async function manualCheck() {
  const checkBtn = document.getElementById('manualCheckBtn');
  checkBtn.disabled = true;
  checkBtn.innerHTML = '<span class="animate-spin">⏳</span> Checking...';

  try {
    const response = await fetch(`${API_BASE_URL}/monitor/check`, { method: 'POST' });
    const result = await response.json();

    if (result.error) {
      alert('Check failed: ' + result.error);
    } else if (result.signals) {
      renderSignals(result.signals);
    }
  } catch (error) {
    alert('Check failed: ' + error.message);
  } finally {
    checkBtn.disabled = false;
    checkBtn.innerHTML = '<span>🔄</span> <span>Check Now</span>';
  }
}

// Save monitor configuration
async function saveMonitorConfig(showConfirmation = true) {
  const saveBtn = document.getElementById('saveMonitorConfigBtn');
  const originalText = saveBtn.textContent;
  saveBtn.textContent = 'Saving...';
  saveBtn.disabled = true;

  const passwordField = document.getElementById('emailPassword');
  const password = passwordField.value;

  const config = {
    tickers: document.getElementById('monitorTickers').value
      .split(',')
      .map(t => t.trim().toUpperCase())
      .filter(t => t),
    intervalMinutes: parseInt(document.getElementById('monitorInterval').value),
    email: {
      enabled: document.getElementById('emailEnabled').checked,
      user: document.getElementById('emailUser').value,
      recipient: document.getElementById('emailRecipient').value
    },
    alertOnStrongBuy: document.getElementById('alertStrongBuy').checked,
    alertOnBuy: document.getElementById('alertBuy').checked,
    alertOnStrongSell: document.getElementById('alertStrongSell').checked,
    alertOnSell: document.getElementById('alertSell').checked
  };

  // Only include password if user entered a new one
  if (password && password.trim() !== '') {
    config.email.password = password;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/monitor/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });

    const result = await response.json();

    if (result.error) {
      throw new Error(result.error);
    }

    // Clear password field after save (for security)
    passwordField.value = '';

    if (showConfirmation) {
      saveBtn.textContent = 'Saved!';
      saveBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
      saveBtn.classList.add('bg-green-600');
      setTimeout(() => {
        saveBtn.textContent = originalText;
        saveBtn.classList.remove('bg-green-600');
        saveBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
        saveBtn.disabled = false;
      }, 2000);
    } else {
      saveBtn.textContent = originalText;
      saveBtn.disabled = false;
    }

    return true;
  } catch (error) {
    saveBtn.textContent = originalText;
    saveBtn.disabled = false;
    alert('Failed to save configuration: ' + error.message);
    return false;
  }
}

// Render signals
function renderSignals(signals) {
  const container = document.getElementById('monitorSignals');

  if (!signals || signals.length === 0) {
    container.innerHTML = '<p class="text-gray-500 dark:text-gray-400 text-center py-8">No signals yet. Start the monitor to begin tracking.</p>';
    return;
  }

  container.innerHTML = signals.map(signal => {
    const isPositive = signal.recommendation.includes('BUY');
    const bgColor = isPositive ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' :
                                 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
    const textColor = isPositive ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300';

    return `
      <div class="p-4 rounded-lg border ${bgColor}">
        <div class="flex justify-between items-start">
          <div>
            <span class="text-lg font-bold text-gray-800 dark:text-gray-100">${signal.ticker}</span>
            <span class="ml-2 font-semibold ${textColor}">${signal.recommendation}</span>
          </div>
          <div class="text-right">
            <div class="text-lg font-bold text-gray-800 dark:text-gray-100">$${signal.price?.toFixed(2) || 'N/A'}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">${signal.datetime || ''}</div>
          </div>
        </div>
        <div class="mt-2 grid grid-cols-4 gap-2 text-xs">
          <div class="text-gray-600 dark:text-gray-400">
            <span class="font-semibold">Score:</span> ${signal.score}/100
          </div>
          <div class="text-gray-600 dark:text-gray-400">
            <span class="font-semibold">RSI:</span> ${signal.indicators?.rsi?.toFixed(1) || 'N/A'}
          </div>
          <div class="text-gray-600 dark:text-gray-400">
            <span class="font-semibold">Williams %R:</span> ${signal.indicators?.williamsR?.toFixed(1) || 'N/A'}
          </div>
          <div class="text-gray-600 dark:text-gray-400">
            <span class="font-semibold">MACD:</span> ${signal.indicators?.macd?.toFixed(3) || 'N/A'}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Render alert history
function renderAlertHistory(alerts) {
  const container = document.getElementById('alertHistory');

  if (!alerts || alerts.length === 0) {
    container.innerHTML = '<p class="text-gray-500 dark:text-gray-400 text-sm">No alerts sent yet.</p>';
    return;
  }

  container.innerHTML = alerts.map(alert => {
    const isPositive = alert.recommendation.includes('BUY');
    const emoji = isPositive ? '🟢' : '🔴';

    return `
      <div class="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-700 last:border-0">
        <div>
          <span>${emoji}</span>
          <span class="font-semibold">${alert.ticker}</span>
          <span class="${isPositive ? 'text-green-600' : 'text-red-600'}">${alert.recommendation}</span>
          <span class="text-gray-500">@ $${alert.price?.toFixed(2)}</span>
        </div>
        <div class="text-xs text-gray-500 dark:text-gray-400">
          ${new Date(alert.alertedAt).toLocaleString()}
        </div>
      </div>
    `;
  }).join('');
}

// Load activity logs
async function loadActivityLogs() {
  try {
    const response = await fetch(`${API_BASE_URL}/monitor/logs?limit=50`);
    const data = await response.json();
    renderActivityLogs(data.logs);
  } catch (error) {
    console.error('Failed to load logs:', error);
  }
}

// Render activity logs
function renderActivityLogs(logs) {
  const container = document.getElementById('activityLog');

  if (!logs || logs.length === 0) {
    container.innerHTML = '<p class="text-gray-500 dark:text-gray-400">No log entries yet.</p>';
    return;
  }

  container.innerHTML = logs.map(log => {
    const time = new Date(log.timestamp).toLocaleString();
    let levelColor = 'text-gray-600 dark:text-gray-400';
    let levelBg = '';

    switch (log.level) {
      case 'BUY_SIGNAL':
        levelColor = 'text-green-700 dark:text-green-400';
        levelBg = 'bg-green-100 dark:bg-green-900/30';
        break;
      case 'SELL_SIGNAL':
        levelColor = 'text-red-700 dark:text-red-400';
        levelBg = 'bg-red-100 dark:bg-red-900/30';
        break;
      case 'PRICE':
        levelColor = 'text-blue-600 dark:text-blue-400';
        break;
      case 'ERROR':
        levelColor = 'text-red-600 dark:text-red-400';
        break;
      case 'WARN':
        levelColor = 'text-yellow-600 dark:text-yellow-400';
        break;
    }

    let dataStr = '';
    if (log.data) {
      if (log.data.ticker) {
        dataStr = `${log.data.ticker}`;
        if (log.data.price) dataStr += ` $${log.data.price}`;
        if (log.data.recommendation) dataStr += ` [${log.data.recommendation}]`;
        if (log.data.score) dataStr += ` Score:${log.data.score}`;
      } else {
        dataStr = JSON.stringify(log.data);
      }
    }

    return `
      <div class="py-1 px-2 rounded ${levelBg}">
        <span class="text-gray-400">${time}</span>
        <span class="font-semibold ${levelColor}">[${log.level}]</span>
        <span class="text-gray-700 dark:text-gray-300">${log.message}</span>
        ${dataStr ? `<span class="text-gray-500 dark:text-gray-400 ml-2">${dataStr}</span>` : ''}
      </div>
    `;
  }).join('');
}

// Make toggleMonitorSection globally available
window.toggleMonitorSection = toggleMonitorSection;

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', initMonitor);
