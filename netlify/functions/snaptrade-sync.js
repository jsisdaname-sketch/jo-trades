const { Snaptrade } = require('snaptrade-typescript-sdk');

function pairOrders(orders) {
  const groups = {};

  for (const o of orders) {
    const status = (o.status || '').toUpperCase();
    const action = (o.action || '').toUpperCase();
    const filledQty = parseFloat(o.filled_quantity || 0);

    // Only process executed orders with actual fills
    if (status !== 'EXECUTED' || filledQty === 0) continue;

    const ticker = o.universal_symbol?.symbol || o.symbol?.symbol || 'UNKNOWN';
    const isOption = !!o.option_symbol;
    const tradeType = isOption
      ? (o.option_symbol.option_type === 'CALL' ? 'Call' : 'Put')
      : 'Long';
    const key = isOption
      ? `${ticker}_${o.option_symbol.option_type}_${o.option_symbol.strike_price}_${o.option_symbol.expiry_date}`
      : `${ticker}_STOCK`;

    if (!groups[key]) groups[key] = { ticker, tradeType, buys: [], sells: [] };

    // Robinhood uses BUY_OPEN / BUY_TO_OPEN for buys, SELL_CLOSE / SELL_TO_CLOSE for sells
    const isBuy = action.includes('BUY');
    const side = isBuy ? 'buys' : 'sells';

    groups[key][side].push({
      price: parseFloat(o.execution_price || 0),
      qty: filledQty,
      date: o.time_executed || o.time_placed || '',
    });
  }

  const trades = [];
  for (const key of Object.keys(groups)) {
    const { ticker, tradeType, buys, sells } = groups[key];
    buys.sort((a, b) => new Date(a.date) - new Date(b.date));
    sells.sort((a, b) => new Date(a.date) - new Date(b.date));
    const pairs = Math.min(buys.length, sells.length);
    for (let i = 0; i < pairs; i++) {
      const buy = buys[i], sell = sells[i];
      const mult = (tradeType === 'Call' || tradeType === 'Put') ? 100 : 1;
      const pnl = parseFloat(((sell.price - buy.price) * buy.qty * mult).toFixed(2));
      trades.push({
        id: `rh_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
        ticker,
        date: buy.date ? buy.date.split('T')[0] : '',
        type: tradeType,
        entry: buy.price,
        exit: sell.price,
        qty: buy.qty,
        pnl,
        outcome: pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'breakeven',
        source: 'Robinhood',
        notes: 'Auto-synced from Robinhood',
        synced: true,
      });
    }
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
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ trades: [], message: 'No accounts found. Please connect Robinhood first.' })
      };
    }

    const allOrders = [];
    for (const account of accounts) {
      try {
        const ordersRes = await snaptrade.accountInformation.getUserAccountOrders({
          userId, userSecret, accountId: account.id, state: 'all'
        });
        if (Array.isArray(ordersRes.data)) allOrders.push(...ordersRes.data);
      } catch(e) {}
    }

    const trades = pairOrders(allOrders);

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ trades, totalOrders: allOrders.length })
    };

  } catch(e) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: e.message })
    };
  }
};
