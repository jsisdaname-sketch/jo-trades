const { Snaptrade } = require('snaptrade-typescript-sdk');

function calcPnl(orders) {
  const groups = {};

  for (const o of orders) {
    const status = (o.status || '').toUpperCase();
    const action = (o.action || '').toUpperCase();
    const filledQty = parseFloat(o.filled_quantity || 0);
    if (status !== 'EXECUTED' || filledQty === 0) continue;

    const isOption = !!o.option_symbol;
    const ticker = isOption
      ? (o.option_symbol?.underlying_symbol?.symbol || o.universal_symbol?.symbol || 'UNKNOWN')
      : (o.universal_symbol?.symbol || o.symbol?.symbol || 'UNKNOWN');
    const tradeType = isOption
      ? (o.option_symbol.option_type === 'CALL' ? 'Call' : 'Put')
      : 'Long';
    const key = isOption
      ? `${ticker}_${o.option_symbol.option_type}_${o.option_symbol.strike_price}_${o.option_symbol.expiry_date}`
      : `${ticker}_STOCK`;

    if (!groups[key]) groups[key] = {
      ticker, tradeType,
      buyQty: 0, buyCost: 0,
      sellQty: 0, sellRevenue: 0,
      firstBuyDate: null, lastSellDate: null,
      firstBuyPrice: null, lastSellPrice: null,
    };

    const price = parseFloat(o.execution_price || 0);
    const isBuy = action.includes('BUY');
    const date = o.time_executed || o.time_placed || '';

    if (isBuy) {
      groups[key].buyQty += filledQty;
      groups[key].buyCost += price * filledQty;
      if (!groups[key].firstBuyDate || date < groups[key].firstBuyDate) {
        groups[key].firstBuyDate = date;
        groups[key].firstBuyPrice = price;
      }
    } else {
      groups[key].sellQty += filledQty;
      groups[key].sellRevenue += price * filledQty;
      if (!groups[key].lastSellDate || date > groups[key].lastSellDate) {
        groups[key].lastSellDate = date;
        groups[key].lastSellPrice = price;
      }
    }
  }

  const trades = [];
  for (const key of Object.keys(groups)) {
    const g = groups[key];

    // Only include if we have both buys and sells (completed trade)
    if (g.buyQty === 0 || g.sellQty === 0) continue;

    const mult = (g.tradeType === 'Call' || g.tradeType === 'Put') ? 100 : 1;
    const pnl = parseFloat(((g.sellRevenue - g.buyCost) * mult).toFixed(2));
    const avgEntry = parseFloat((g.buyCost / g.buyQty).toFixed(4));
    const avgExit = parseFloat((g.sellRevenue / g.sellQty).toFixed(4));
    const date = g.firstBuyDate ? g.firstBuyDate.split('T')[0] : '';

    trades.push({
      id: `rh_${key}_${date}`.replace(/[^a-zA-Z0-9_-]/g, '_'),
      ticker: g.ticker,
      date,
      type: g.tradeType,
      entry: avgEntry,
      exit: avgExit,
      qty: g.buyQty,
      pnl,
      outcome: pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'breakeven',
      source: 'Robinhood',
      notes: `Auto-synced from Robinhood. Bought ${g.buyQty} @ avg $${avgEntry}, Sold ${g.sellQty} @ avg $${avgExit}`,
      synced: true,
    });
  }

  return trades;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  }

  try {
    const snaptrade = new Snaptrade({
      clientId: process.env.SNAPTRADE_CLIENT_ID,
      consumerKey: process.env.SNAPTRADE_CONSUMER_KEY,
    });

    const userId = 'JOTRADES';
    const userSecret = process.env.SNAPTRADE_USER_SECRET;

    const accountsRes = await snaptrade.accountInformation.listUserAccounts({ userId, userSecret });
    const accounts = accountsRes.data || [];

    if (accounts.length === 0) {
      return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ trades: [], message: 'No accounts found. Please connect Robinhood first.' }) };
    }

    const allOrders = [];
    for (const account of accounts) {
      try {
        const ordersRes = await snaptrade.accountInformation.getUserAccountOrders({ userId, userSecret, accountId: account.id, state: 'all' });
        if (Array.isArray(ordersRes.data)) allOrders.push(...ordersRes.data);
      } catch(e) {}
    }

    const trades = calcPnl(allOrders);
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ trades, totalOrders: allOrders.length }) };

  } catch(e) {
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: e.message }) };
  }
};
