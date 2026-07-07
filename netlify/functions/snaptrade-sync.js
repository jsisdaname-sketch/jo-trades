const { Snaptrade } = require('snaptrade-typescript-sdk');

function calcPnl(orders, sourceLabel, idPrefix) {
  const groups = {};

  for (const o of orders) {
    const action = (o.action || '').toUpperCase();
    const filledQty = parseFloat(o.filled_quantity || 0);

    // FIX: count ANY order that actually filled contracts, regardless of
    // final status. Partially-filled-then-canceled orders end up with a
    // status like PARTIAL_CANCELED (not EXECUTED), but the filled portion
    // is a real trade with real money. Filtering on status alone was
    // silently dropping those fills and inflating P&L.
    if (filledQty === 0) continue;

    const price = parseFloat(o.execution_price || 0);
    // No trustworthy fill price = can't use this order. Skip it rather
    // than poison the averages with $0.
    if (!price || price <= 0) continue;

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
    const avgEntry = parseFloat((g.buyCost / g.buyQty).toFixed(4));
    const avgExit = parseFloat((g.sellRevenue / g.sellQty).toFixed(4));

    // FIX: compute P&L on the MATCHED quantity (contracts both bought and
    // sold). If buys and sells don't line up — open position, or a broker
    // data gap — the old (sellRevenue - buyCost) math produced phantom
    // profit/loss because it compared unequal quantities. Matched-qty math
    // gives the honest realized P&L: (avg exit - avg entry) per contract,
    // times contracts actually round-tripped.
    const matchedQty = Math.min(g.buyQty, g.sellQty);
    const pnl = parseFloat(((avgExit - avgEntry) * matchedQty * mult).toFixed(2));

    const qtyMismatch = g.buyQty !== g.sellQty;

    const date = g.firstBuyDate ? g.firstBuyDate.split('T')[0] : '';
    // Full timestamps (UTC ISO): first entry fill and last exit fill
    const entryTime = g.firstBuyDate || null;
    const exitTime = g.lastSellDate || null;

    let notes = `Auto-synced from ${sourceLabel}. Bought ${g.buyQty} @ avg $${avgEntry}, Sold ${g.sellQty} @ avg $${avgExit}`;
    if (qtyMismatch) {
      notes += ` — QTY MISMATCH (${g.buyQty} bought vs ${g.sellQty} sold). P&L calculated on ${matchedQty} matched contracts; verify against broker.`;
    }

    trades.push({
      id: `${idPrefix}_${key}_${date}`.replace(/[^a-zA-Z0-9_-]/g, '_'),
      ticker: g.ticker,
      date,
      type: g.tradeType,
      entry: avgEntry,
      exit: avgExit,
      qty: matchedQty,
      pnl,
      entryTime,
      exitTime,
      outcome: pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'breakeven',
      source: sourceLabel,
      notes,
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

    // Which broker's accounts to pull from. Defaults to Robinhood.
    // This is what keeps your Robinhood trades and dad's Webull trades separate.
    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch (e) {}
    const broker = (body.broker || 'ROBINHOOD').toUpperCase();
    const sourceLabel = broker === 'WEBULL' ? 'Webull' : 'Robinhood';
    const idPrefix = broker === 'WEBULL' ? 'wb' : 'rh';

    const accountsRes = await snaptrade.accountInformation.listUserAccounts({ userId, userSecret });
    const accounts = accountsRes.data || [];

    // Only keep accounts belonging to the requested broker
    const brokerAccounts = accounts.filter(a => {
      const inst = (a.institution_name || '').toUpperCase();
      return inst.includes(broker);
    });

    if (brokerAccounts.length === 0) {
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          trades: [],
          message: `No ${sourceLabel} accounts found. Please connect ${sourceLabel} first.`,
          connectedInstitutions: accounts.map(a => a.institution_name)
        })
      };
    }

    const allOrders = [];
    for (const account of brokerAccounts) {
      try {
        const ordersRes = await snaptrade.accountInformation.getUserAccountOrders({ userId, userSecret, accountId: account.id, state: 'all' });
        if (Array.isArray(ordersRes.data)) allOrders.push(...ordersRes.data);
      } catch(e) {}
    }

    const trades = calcPnl(allOrders, sourceLabel, idPrefix);
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ trades, totalOrders: allOrders.length, accountsUsed: brokerAccounts.length }) };

  } catch(e) {
    return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: e.message }) };
  }
};
