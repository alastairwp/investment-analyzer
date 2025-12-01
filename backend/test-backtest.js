// Test script for backtesting
// Run with: node test-backtest.js

const axios = require('axios');

async function testBacktest() {
  console.log('🧪 Testing Backtest API...\n');

  const config = {
    tickers: ['TSCO.L', 'BP.L', 'HSBA.L', 'AZN.L', 'LSEG.L'], // FTSE 100 stocks
    startDate: '2024-01-01',
    endDate: '2024-12-01',
    initialInvestment: 1000, // £1000 per stock
    buyPercentages: {
      'STRONG BUY': 100,
      'BUY': 100,
      'SELL': 100,
      'STRONG SELL': 100
    }
  };

  try {
    console.log('📤 Sending backtest request...');
    console.log('Config:', JSON.stringify(config, null, 2));

    const response = await axios.post('http://localhost:3001/api/backtest', config);

    console.log('\n✅ Backtest completed!');
    console.log('\n📊 PORTFOLIO SUMMARY:');
    console.log('='.repeat(60));

    const summary = response.data.summary;
    console.log(`Total Initial Investment: £${summary.totalInitialInvestment.toFixed(2)}`);
    console.log(`Total Final Value: £${summary.totalFinalValue.toFixed(2)}`);
    console.log(`Total Profit/Loss: £${summary.totalProfit.toFixed(2)}`);
    console.log(`Total Return: ${summary.totalReturnPercent >= 0 ? '+' : ''}${summary.totalReturnPercent.toFixed(2)}%`);
    console.log(`\nBuy & Hold Comparison:`);
    console.log(`  Final Value: £${summary.buyAndHold.finalValue.toFixed(2)}`);
    console.log(`  Return: ${summary.buyAndHold.returnPercent >= 0 ? '+' : ''}${summary.buyAndHold.returnPercent.toFixed(2)}%`);
    console.log(`\nOutperformance: ${summary.outperformance >= 0 ? '+' : ''}${summary.outperformance.toFixed(2)}%`);
    console.log(`Total Trades: ${summary.totalTrades}`);

    console.log('\n📈 INDIVIDUAL STOCKS:');
    console.log('='.repeat(60));

    response.data.results.forEach(result => {
      if (result.error) {
        console.log(`\n❌ ${result.ticker}: ${result.error}`);
      } else {
        console.log(`\n${result.ticker}:`);
        console.log(`  Initial: £${result.initialInvestment.toFixed(2)}`);
        console.log(`  Final: £${result.finalValue.toFixed(2)} (${result.returnPercent >= 0 ? '+' : ''}${result.returnPercent.toFixed(2)}%)`);
        console.log(`  Trades: ${result.totalTrades} (${result.buyTrades} buys, ${result.sellTrades} sells)`);
        console.log(`  Buy & Hold: £${result.buyAndHold.finalValue.toFixed(2)} (${result.buyAndHold.returnPercent >= 0 ? '+' : ''}${result.buyAndHold.returnPercent.toFixed(2)}%)`);
        console.log(`  Outperformance: ${result.outperformance >= 0 ? '+' : ''}${result.outperformance.toFixed(2)}%`);
      }
    });

    console.log('\n✨ Best Performer:', summary.bestPerformer.ticker, `(${summary.bestPerformer.returnPercent.toFixed(2)}%)`);
    console.log('📉 Worst Performer:', summary.worstPerformer.ticker, `(${summary.worstPerformer.returnPercent.toFixed(2)}%)`);

    console.log('\n✅ Test completed successfully!');

  } catch (error) {
    console.error('\n❌ Test failed:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Error:', error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

testBacktest();
