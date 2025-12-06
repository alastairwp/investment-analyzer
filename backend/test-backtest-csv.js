// Test script for backtesting with CSV file data
// Run with: node test-backtest-csv.js

const path = require('path');
const { runBacktest } = require('./backtestEngine');

async function testBacktestCSV() {
  console.log('Testing Backtest with CSV Data (AAPL 2019 15-min intraday)...\n');

  const config = {
    tickers: ['AAPL'],
    startDate: '2019-01-02',
    endDate: '2019-12-31',
    initialInvestment: 1000, // $1000
    buyPercentages: {
      'STRONG BUY': 100,
      'BUY': 100,
      'SELL': 100,
      'STRONG SELL': 100
    },
    dataSource: {
      type: 'file',
      path: path.join(__dirname, 'dataset_appl_2019.txt'),
      resampleMinutes: 15 // Resample 1-minute data to 15-minute candles
    }
  };

  try {
    console.log('Config:', JSON.stringify({
      ...config,
      dataSource: { type: 'file', path: 'dataset_appl_2019.txt' }
    }, null, 2));

    const result = await runBacktest(config);

    console.log('\n' + '='.repeat(70));
    console.log('BACKTEST RESULTS - AAPL 2019 (15-min intraday data)');
    console.log('='.repeat(70));

    const summary = result.summary;
    console.log(`\nTotal Initial Investment: $${summary.totalInitialInvestment.toFixed(2)}`);
    console.log(`Total Final Value: $${summary.totalFinalValue.toFixed(2)}`);
    console.log(`Total Profit/Loss: $${summary.totalProfit.toFixed(2)}`);
    console.log(`Total Return: ${summary.totalReturnPercent >= 0 ? '+' : ''}${summary.totalReturnPercent.toFixed(2)}%`);

    console.log(`\nBuy & Hold Comparison:`);
    console.log(`  Final Value: $${summary.buyAndHold.finalValue.toFixed(2)}`);
    console.log(`  Return: ${summary.buyAndHold.returnPercent >= 0 ? '+' : ''}${summary.buyAndHold.returnPercent.toFixed(2)}%`);

    console.log(`\nStrategy Outperformance: ${summary.outperformance >= 0 ? '+' : ''}${summary.outperformance.toFixed(2)}%`);
    console.log(`Total Trades: ${summary.totalTrades}`);

    // Individual stock results
    result.results.forEach(stock => {
      if (stock.error) {
        console.log(`\n${stock.ticker}: ERROR - ${stock.error}`);
      } else {
        console.log(`\n${stock.ticker} Details:`);
        console.log(`  Initial: $${stock.initialInvestment.toFixed(2)}`);
        console.log(`  Final: $${stock.finalValue.toFixed(2)} (${stock.returnPercent >= 0 ? '+' : ''}${stock.returnPercent.toFixed(2)}%)`);
        console.log(`  Buy Trades: ${stock.buyTrades}`);
        console.log(`  Sell Trades: ${stock.sellTrades}`);
        console.log(`  Final Cash: $${stock.finalCash.toFixed(2)}`);
        console.log(`  Final Shares: ${stock.finalShares}`);

        // Show first 5 and last 5 trades
        if (stock.trades.length > 0) {
          console.log(`\n  First 5 trades:`);
          stock.trades.slice(0, 5).forEach((trade, i) => {
            console.log(`    ${i + 1}. ${trade.datetime} - ${trade.action} ${trade.shares} @ $${trade.price.toFixed(2)} (Score: ${trade.technicalScore})`);
          });

          if (stock.trades.length > 10) {
            console.log(`    ... (${stock.trades.length - 10} more trades) ...`);
          }

          if (stock.trades.length > 5) {
            console.log(`\n  Last 5 trades:`);
            stock.trades.slice(-5).forEach((trade, i) => {
              const idx = stock.trades.length - 5 + i + 1;
              console.log(`    ${idx}. ${trade.datetime} - ${trade.action} ${trade.shares} @ $${trade.price.toFixed(2)} (Score: ${trade.technicalScore})`);
            });
          }
        }
      }
    });

    console.log('\n' + '='.repeat(70));
    console.log('Test completed successfully!');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('\nTest failed:');
    console.error(error.message);
    console.error(error.stack);
  }
}

testBacktestCSV();
