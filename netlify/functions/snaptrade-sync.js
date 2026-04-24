const { Snaptrade } = require('snaptrade-typescript-sdk');
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
  try {
    const snaptrade = new Snaptrade({ clientId: process.env.SNAPTRADE_CLIENT_ID, consumerKey: process.env.SNAPTRADE_CONSUMER_KEY });
    const userId = 'JOTRADES';
    const userSecret = process.env.SNAPTRADE_USER_SECRET;
    const accountsRes = await snaptrade.accountInformation.listUserAccounts({ userId, userSecret });
    const accounts = accountsRes.data || [];
    if (accounts.length === 0) return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ trades: [], message: 'No accounts found' }) };
    const allOrders = [];
    for (const account of accounts) {
      try {
        const ordersRes = await snaptrade.accountInformation.getUserAccountOrders({ userId, userSecret, accountId: account.id, state: 'all' });
        if (Array.isArray(ordersRes.data)) allOrders.push(...ordersRes.data);
      } catch(e) {}
    }
    if (allOrders.length === 0) return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ trades: [], message: 'Robinhood connected but no orders found yet. Check back in 24 hours.' }) };
    const statuses = [...new Set(allOrders.map(o => o.status))];
    const actions = [...new Set(allOrders.map(o => o.action))];
    const sample = allOrders.slice(0, 2);
    const groups = {};
    for (const o of allOrders) {
      const status = (o.status || '').toUpperCase();
      if (!['FILLED','EXECUTED','COMPLETE','COMPLETED','PARTIAL'].includes(status)) continue;
      const ticker = o.symbol?.symbol || o.universal_symbol?.symbol || 'UNKNOWN';
      const key = o.option_symbol ? `${ticker}_${o.option_symbol.option_type}_${o.option_symbol.strike_price}` : `${ticker}_STOCK`;
      const tradeType = o.option_symbol ? (o.option_symbol.option_type === 'CALL' ? 'Call' : 'Put') : 'Long';
      if (!groups[key]) groups[key] = { ticker, tradeType, buys: [], sells: [] };
      const side = (o.action || '').toUpperCase() === 'BUY' ? 'buys' : 'sells';
      groups[key][side].push({ price: parseFloat(o.execution_price || o.price || 0), qty: parseFloat(o.filled_quantity || o.units || 0), date: o.time_placed || '' });
    }
    const trades = [];
    for (const key of Object.keys(groups)) {
      const { ticker, tradeType, buys, sells } = groups[key];
      buys.sort((a, b) => new Date(a.date) - new Date(b.date));
      sells.sort((a, b) => new Date(a.date) - new Date(b.date));
      for (let i = 0; i < Math.min(buys.length, sells.length); i++) {
        const buy = buys[i], sell = sells[i];
        const mult = (tradeType === 'Call' || tradeType === 'Put') ? 100 : 1;
        const pnl = parseFloat(((sell.price - buy.price) * buy.qty * mult).toFixed(2));
        trades.push({ id: `rh_${Date.now()}_${Math.random().toString(36).slice(2,7)}`, ticker, date: buy.date ? buy.date.split('T')[0] : '', type: tradeType, entry: buy.price, exit: sell.price, qty: buy.qty, pnl, outcome: pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'breakeven', source: 'Robinhood', notes: 'Auto-synced from Robinhood', synced: true });
      }
    }
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ trades, totalOrders: allOrders.length, statuses, actions, sample }) };
  } catch(e) { return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: e.message }) }; }
};
