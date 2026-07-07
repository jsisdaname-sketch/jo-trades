const { Snaptrade } = require('snaptrade-typescript-sdk');

// ============================================================================
// POSITION-BASED P&L ENGINE
//
// Why this exists: the old version dumped every buy and every sell for a
// contract into one bucket and subtracted totals. That broke in two ways:
//   1. OPEN POSITIONS showed up as fake losses — if dad bought 7 contracts
//      and only sold 2 so far, the cost of the 5 he's still holding got
//      counted as a "loss."
//   2. The same contract traded on different days got lumped into one trade.
//
// This version walks the fills in time order and tracks the running
// position. A trade is only recorded when the position returns to ZERO —
// i.e. actually closed. Anything still open is ignored until it's closed,
// at which point the full round trip appears with exact realized P&L.
// ============================================================================
function calcPnl(orders, sourceLabel, idPrefix) {

  // ---- Step 1: collect real fills (contracts that actually traded) ----
  // We count ANY order with filled contracts, regardless of final status.
  // A partially-filled-then-canceled order (status PARTIAL_CANCELED, not
  // EXECUTED) still cost real money — skipping those was the $472 IBM bug.
  const byKey = {};

  for (const o of orders) {
    const filledQty = parseFloat(o.filled_quantity || 0);
    if (!filledQty) continue;

    const price = parseFloat(o.execution_price || 0);
    // No trustworthy fill price = skip rather than poison averages with $0
    if (!price || price <= 0) continue;

    const action = (o.action || '').toUpperCase();
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

    if (!byKey[key]) byKey[key] = { ticker, tradeType, fills: [] };
    byKey[key].fills.push({
      time: o.time_executed || o.time_placed || '',
      qty: filledQty,
      price,
      isBuy: action.includes('BUY'),
    });
  }

  const trades = [];

  for (const key of Object.keys(byKey)) {
    const { ticker, tradeType, fills } = byKey[key];

    // ---- Step 2: sort fills chronologically ----
    fills.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));

    // ---- Step 3: walk fills, cut into round trips ----
    // A round trip = the stretch of fills from opening a position until
    // the position count returns to zero. Open leftovers are NOT emitted.
    let pos = 0;
    let rt = null; // current round trip accumulator
    const roundTrips = [];

    for (const f of fills) {
      if (!rt) rt = { buyQty: 0, buyCost: 0, sellQty: 0, sellRev: 0, firstTime: f.time, lastTime: f.time };

      if (f.isBuy) { pos += f.qty; rt.buyQty += f.qty; rt.buyCost += f.price * f.qty; }
      else         { pos -= f.qty; rt.sellQty += f.qty; rt.sellRev += f.price * f.qty; }
      rt.lastTime = f.time;

      // Position closed → round trip complete (1e-9 tolerance for fractional shares)
      if (Math.abs(pos) < 1e-9) {
        pos = 0;
        roundTrips.push(rt);
        rt = null;
      }
    }
    // If rt is still non-null here, the position is STILL OPEN.
    // Intentionally not emitted — it is not a completed trade yet.

    // ---- Step 4: merge round trips that started the same day ----
    // One card per contract per day (matches existing journal layout and
    // keeps trade IDs stable), with exact combined realized P&L.
    const byDay = {};
    for (const r of roundTrips) {
      const day = (r.firstTime || '').split('T')[0];
      if (!byDay[day]) {
        byDay[day] = { buyQty: 0, buyCost: 0, sellQty: 0, sellRev: 0, firstTime: r.firstTime, lastTime: r.lastTime };
      }
      const d = byDay[day];
      d.buyQty += r.buyQty; d.buyCost += r.buyCost;
      d.sellQty += r.sellQty; d.sellRev += r.sellRev;
      if (r.firstTime < d.firstTime) d.firstTime = r.firstTime;
      if (r.lastTime > d.lastTime) d.lastTime = r.lastTime;
    }

    const mult = (tradeType === 'Call' || tradeType === 'Put') ? 100 : 1;

    for (const day of Object.keys(byDay)) {
      const g = byDay[day];
      // Within closed round trips, bought qty always equals sold qty,
      // so revenue minus cost is the EXACT realized P&L. No estimating.
      const pnl = parseFloat(((g.sellRev - g.buyCost) * mult).toFixed(2));
      const avgEntry = parseFloat((g.buyCost / g.buyQty).toFixed(4));
      const avgExit = parseFloat((g.sellRev / g.sellQty).toFixed(4));

      trades.push({
        id: `${idPrefix}_${key}_${day}`.replace(/[^a-zA-Z0-9_-]/g, '_'),
        ticker,
        date: day,
        type: tradeType,
        entry: avgEntry,
        exit: avgExit,
        qty: g.buyQty,
        pnl,
        entryTime: g.firstTime || null,
        exitTime: g.lastTime || null,
        outcome: pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'breakeven',
        source: sourceLabel,
        notes: `Auto-synced from ${sourceLabel}. Bought ${g.buyQty} @ avg $${avgEntry}, Sold ${g.sellQty} @ avg $${avgExit}`,
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
