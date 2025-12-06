/**
 * Trade Analysis Script
 * Analyzes backtest trades to identify suboptimal patterns and suggest improvements
 * Goal: Buy at lowest prices, sell at highest prices
 */

const path = require('path');
const { runBacktest, loadHistoricalDataFromCSV } = require('./backtestEngine');

async function analyzeTrades() {
  console.log('='.repeat(80));
  console.log('TRADE ANALYSIS - Finding Optimization Opportunities');
  console.log('='.repeat(80));

  // Run backtest to get trades
  const config = {
    tickers: ['AAPL'],
    startDate: '2019-01-02',
    endDate: '2019-12-31',
    initialInvestment: 1000,
    buyPercentages: { 'STRONG BUY': 100, 'BUY': 100, 'SELL': 100, 'STRONG SELL': 100 },
    dataSource: {
      type: 'file',
      path: path.join(__dirname, 'dataset_appl_2019.txt'),
      resampleMinutes: 15
    }
  };

  const result = await runBacktest(config);
  const stockResult = result.results[0];
  const trades = stockResult.trades;

  // Load full price history for analysis
  const priceData = loadHistoricalDataFromCSV(config.dataSource.path, config.dataSource.resampleMinutes);

  // Create price lookup map
  const priceMap = {};
  priceData.forEach(d => {
    priceMap[d.datetime] = d;
  });

  console.log(`\nAnalyzing ${trades.length} trades...\n`);

  // Analysis containers
  const buyAnalysis = [];
  const sellAnalysis = [];
  const missedOpportunities = [];

  // Analyze each trade
  for (let i = 0; i < trades.length; i++) {
    const trade = trades[i];
    const tradeIdx = priceData.findIndex(d => d.datetime === trade.datetime);

    if (tradeIdx === -1) continue;

    // Look at price movement in next 5-20 periods after trade
    const futurePrices = priceData.slice(tradeIdx + 1, tradeIdx + 21);
    const pastPrices = priceData.slice(Math.max(0, tradeIdx - 20), tradeIdx);

    if (trade.action === 'BUY') {
      // For buys: Did price go lower after we bought? (We bought too early)
      const minFuturePrice = futurePrices.length > 0 ? Math.min(...futurePrices.map(p => p.low)) : trade.price;
      const maxFuturePrice = futurePrices.length > 0 ? Math.max(...futurePrices.map(p => p.high)) : trade.price;
      const minPastPrice = pastPrices.length > 0 ? Math.min(...pastPrices.map(p => p.low)) : trade.price;

      const priceDrop = ((trade.price - minFuturePrice) / trade.price) * 100;
      const priceRise = ((maxFuturePrice - trade.price) / trade.price) * 100;

      buyAnalysis.push({
        datetime: trade.datetime,
        buyPrice: trade.price,
        minFuturePrice,
        maxFuturePrice,
        priceDrop,
        priceRise,
        rsi: parseFloat(trade.indicators.rsi),
        recommendation: trade.recommendation,
        score: trade.technicalScore,
        rationale: trade.rationale,
        couldHaveBoughtLower: priceDrop > 1,
        goodBuy: priceRise > priceDrop
      });
    } else if (trade.action === 'SELL') {
      // For sells: Did price go higher after we sold? (We sold too early)
      const maxFuturePrice = futurePrices.length > 0 ? Math.max(...futurePrices.map(p => p.high)) : trade.price;
      const minFuturePrice = futurePrices.length > 0 ? Math.min(...futurePrices.map(p => p.low)) : trade.price;

      const missedGain = ((maxFuturePrice - trade.price) / trade.price) * 100;
      const avoidedLoss = ((trade.price - minFuturePrice) / trade.price) * 100;

      sellAnalysis.push({
        datetime: trade.datetime,
        sellPrice: trade.price,
        maxFuturePrice,
        minFuturePrice,
        missedGain,
        avoidedLoss,
        rsi: parseFloat(trade.indicators.rsi),
        exitReason: trade.exitReason,
        recommendation: trade.recommendation,
        score: trade.technicalScore,
        rationale: trade.rationale,
        soldTooEarly: missedGain > 2 && missedGain > avoidedLoss,
        goodSell: avoidedLoss > missedGain
      });
    }
  }

  // Analyze BUY patterns
  console.log('\n' + '='.repeat(80));
  console.log('BUY ANALYSIS');
  console.log('='.repeat(80));

  const prematureBuys = buyAnalysis.filter(b => b.couldHaveBoughtLower);
  const goodBuys = buyAnalysis.filter(b => b.goodBuy);

  console.log(`\nTotal Buys: ${buyAnalysis.length}`);
  console.log(`Good Buys (price rose more than it dropped): ${goodBuys.length} (${(goodBuys.length/buyAnalysis.length*100).toFixed(1)}%)`);
  console.log(`Premature Buys (could have bought >1% lower): ${prematureBuys.length} (${(prematureBuys.length/buyAnalysis.length*100).toFixed(1)}%)`);

  // Find patterns in premature buys
  if (prematureBuys.length > 0) {
    const avgRSI = prematureBuys.reduce((sum, b) => sum + b.rsi, 0) / prematureBuys.length;
    const avgScore = prematureBuys.reduce((sum, b) => sum + b.score, 0) / prematureBuys.length;
    const avgDrop = prematureBuys.reduce((sum, b) => sum + b.priceDrop, 0) / prematureBuys.length;

    console.log(`\nPremature Buy Patterns:`);
    console.log(`  Avg RSI at buy: ${avgRSI.toFixed(1)}`);
    console.log(`  Avg Technical Score: ${avgScore.toFixed(1)}`);
    console.log(`  Avg price drop after buy: ${avgDrop.toFixed(2)}%`);

    // Group by RSI ranges
    const rsiRanges = {
      'RSI < 25': prematureBuys.filter(b => b.rsi < 25),
      'RSI 25-35': prematureBuys.filter(b => b.rsi >= 25 && b.rsi < 35),
      'RSI 35-45': prematureBuys.filter(b => b.rsi >= 35 && b.rsi < 45),
      'RSI 45-55': prematureBuys.filter(b => b.rsi >= 45 && b.rsi < 55),
      'RSI > 55': prematureBuys.filter(b => b.rsi >= 55)
    };

    console.log(`\n  Premature buys by RSI range:`);
    for (const [range, buys] of Object.entries(rsiRanges)) {
      if (buys.length > 0) {
        const avgDrop = buys.reduce((s, b) => s + b.priceDrop, 0) / buys.length;
        console.log(`    ${range}: ${buys.length} trades, avg drop: ${avgDrop.toFixed(2)}%`);
      }
    }

    // Show worst premature buys
    console.log(`\n  Top 5 Worst Premature Buys:`);
    prematureBuys.sort((a, b) => b.priceDrop - a.priceDrop).slice(0, 5).forEach((b, i) => {
      console.log(`    ${i+1}. ${b.datetime} - Bought at $${b.buyPrice.toFixed(2)}, dropped ${b.priceDrop.toFixed(2)}% to $${b.minFuturePrice.toFixed(2)}`);
      console.log(`       RSI: ${b.rsi.toFixed(1)}, Score: ${b.score}, ${b.recommendation}`);
    });
  }

  // Analyze SELL patterns
  console.log('\n' + '='.repeat(80));
  console.log('SELL ANALYSIS');
  console.log('='.repeat(80));

  const prematureSells = sellAnalysis.filter(s => s.soldTooEarly);
  const goodSells = sellAnalysis.filter(s => s.goodSell);

  console.log(`\nTotal Sells: ${sellAnalysis.length}`);
  console.log(`Good Sells (avoided bigger drop): ${goodSells.length} (${(goodSells.length/sellAnalysis.length*100).toFixed(1)}%)`);
  console.log(`Premature Sells (missed >2% gain): ${prematureSells.length} (${(prematureSells.length/sellAnalysis.length*100).toFixed(1)}%)`);

  if (prematureSells.length > 0) {
    const avgRSI = prematureSells.reduce((sum, s) => sum + s.rsi, 0) / prematureSells.length;
    const avgMissed = prematureSells.reduce((sum, s) => sum + s.missedGain, 0) / prematureSells.length;

    console.log(`\nPremature Sell Patterns:`);
    console.log(`  Avg RSI at sell: ${avgRSI.toFixed(1)}`);
    console.log(`  Avg missed gain: ${avgMissed.toFixed(2)}%`);

    // Group by exit reason
    const exitReasons = {};
    prematureSells.forEach(s => {
      const reason = s.exitReason || 'signal-based';
      if (!exitReasons[reason]) exitReasons[reason] = [];
      exitReasons[reason].push(s);
    });

    console.log(`\n  Premature sells by exit reason:`);
    for (const [reason, sells] of Object.entries(exitReasons)) {
      const avgMissed = sells.reduce((s, x) => s + x.missedGain, 0) / sells.length;
      console.log(`    ${reason}: ${sells.length} trades, avg missed: ${avgMissed.toFixed(2)}%`);
    }

    // Group by RSI at sell
    const rsiRanges = {
      'RSI < 35': prematureSells.filter(s => s.rsi < 35),
      'RSI 35-50': prematureSells.filter(s => s.rsi >= 35 && s.rsi < 50),
      'RSI 50-65': prematureSells.filter(s => s.rsi >= 50 && s.rsi < 65),
      'RSI > 65': prematureSells.filter(s => s.rsi >= 65)
    };

    console.log(`\n  Premature sells by RSI range:`);
    for (const [range, sells] of Object.entries(rsiRanges)) {
      if (sells.length > 0) {
        const avgMissed = sells.reduce((s, x) => s + x.missedGain, 0) / sells.length;
        console.log(`    ${range}: ${sells.length} trades, avg missed: ${avgMissed.toFixed(2)}%`);
      }
    }

    // Show worst premature sells
    console.log(`\n  Top 5 Worst Premature Sells:`);
    prematureSells.sort((a, b) => b.missedGain - a.missedGain).slice(0, 5).forEach((s, i) => {
      console.log(`    ${i+1}. ${s.datetime} - Sold at $${s.sellPrice.toFixed(2)}, missed ${s.missedGain.toFixed(2)}% to $${s.maxFuturePrice.toFixed(2)}`);
      console.log(`       RSI: ${s.rsi.toFixed(1)}, Exit: ${s.exitReason}`);
      console.log(`       Rationale: ${s.rationale.substring(0, 100)}...`);
    });
  }

  // Generate improvement recommendations
  console.log('\n' + '='.repeat(80));
  console.log('OPTIMIZATION RECOMMENDATIONS');
  console.log('='.repeat(80));

  const recommendations = [];

  // Analyze buy timing
  const buysByRSI = buyAnalysis.reduce((acc, b) => {
    if (b.rsi < 30) acc.oversold.push(b);
    else if (b.rsi < 40) acc.lowRSI.push(b);
    else if (b.rsi < 50) acc.midRSI.push(b);
    else acc.highRSI.push(b);
    return acc;
  }, { oversold: [], lowRSI: [], midRSI: [], highRSI: [] });

  // Check if we should be more patient with buys
  const oversoldAvgRise = buysByRSI.oversold.length > 0 ?
    buysByRSI.oversold.reduce((s, b) => s + b.priceRise, 0) / buysByRSI.oversold.length : 0;
  const midRSIAvgRise = buysByRSI.midRSI.length > 0 ?
    buysByRSI.midRSI.reduce((s, b) => s + b.priceRise, 0) / buysByRSI.midRSI.length : 0;

  if (oversoldAvgRise > midRSIAvgRise * 1.3) {
    recommendations.push({
      type: 'BUY_TIMING',
      issue: 'Buying at higher RSI levels yields worse results',
      suggestion: 'Be more patient - wait for RSI to drop below 35 before buying',
      impact: `Oversold buys avg +${oversoldAvgRise.toFixed(1)}% vs mid-RSI buys avg +${midRSIAvgRise.toFixed(1)}%`
    });
  }

  // Analyze sell timing by exit reason
  const sellsByExit = {};
  sellAnalysis.forEach(s => {
    const reason = s.exitReason || 'signal';
    if (!sellsByExit[reason]) sellsByExit[reason] = { good: 0, bad: 0, totalMissed: 0 };
    if (s.goodSell) sellsByExit[reason].good++;
    else {
      sellsByExit[reason].bad++;
      sellsByExit[reason].totalMissed += s.missedGain;
    }
  });

  for (const [reason, stats] of Object.entries(sellsByExit)) {
    const badRate = stats.bad / (stats.good + stats.bad);
    if (badRate > 0.5 && stats.bad > 3) {
      recommendations.push({
        type: 'SELL_TIMING',
        issue: `Exit strategy "${reason}" has ${(badRate*100).toFixed(0)}% premature sell rate`,
        suggestion: `Consider adjusting or removing this exit condition`,
        impact: `${stats.bad} premature sells, avg missed gain: ${(stats.totalMissed/stats.bad).toFixed(2)}%`
      });
    }
  }

  // Check if trailing stop is too tight
  const trailingStopSells = prematureSells.filter(s => s.exitReason && s.exitReason.includes('trailing'));
  if (trailingStopSells.length > 5) {
    const avgMissed = trailingStopSells.reduce((s, x) => s + x.missedGain, 0) / trailingStopSells.length;
    recommendations.push({
      type: 'TRAILING_STOP',
      issue: `Trailing stop triggered ${trailingStopSells.length} premature sells`,
      suggestion: 'Widen trailing stop from 1% to 1.5-2%',
      impact: `Avg missed gain: ${avgMissed.toFixed(2)}%`
    });
  }

  // Output recommendations
  recommendations.forEach((rec, i) => {
    console.log(`\n${i+1}. [${rec.type}]`);
    console.log(`   Issue: ${rec.issue}`);
    console.log(`   Suggestion: ${rec.suggestion}`);
    console.log(`   Impact: ${rec.impact}`);
  });

  // Return analysis for programmatic use
  return {
    buyAnalysis,
    sellAnalysis,
    prematureBuys,
    prematureSells,
    recommendations,
    summary: {
      totalTrades: trades.length,
      goodBuyRate: goodBuys.length / buyAnalysis.length,
      goodSellRate: goodSells.length / sellAnalysis.length,
      prematureBuyRate: prematureBuys.length / buyAnalysis.length,
      prematureSellRate: prematureSells.length / sellAnalysis.length
    }
  };
}

// Run analysis
analyzeTrades().then(analysis => {
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Good Buy Rate: ${(analysis.summary.goodBuyRate * 100).toFixed(1)}%`);
  console.log(`Good Sell Rate: ${(analysis.summary.goodSellRate * 100).toFixed(1)}%`);
  console.log(`Premature Buy Rate: ${(analysis.summary.prematureBuyRate * 100).toFixed(1)}%`);
  console.log(`Premature Sell Rate: ${(analysis.summary.prematureSellRate * 100).toFixed(1)}%`);
}).catch(err => {
  console.error('Analysis failed:', err);
});
