// analyze-journal.mjs
// Reviews a trade's journal notes and gives AI coaching feedback
// Requires ANTHROPIC_API_KEY environment variable set in Netlify dashboard

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { trade } = await req.json();

    if (!trade) {
      return new Response(JSON.stringify({ error: 'No trade data provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({
        error: 'ANTHROPIC_API_KEY not set. Go to Netlify → Site Settings → Environment Variables and add your key.'
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const pnlStr = (trade.pnl >= 0 ? '+' : '') + '$' + Math.abs(trade.pnl || 0).toFixed(2);

    const prompt = `You are a trading coach and journaling mentor. Review this trader's trade journal entry and give honest, encouraging, and specific feedback.

**Trade Details:**
- Ticker: ${trade.ticker || 'N/A'}
- Type: ${trade.type || 'N/A'}
- Outcome: ${trade.outcome || 'N/A'} (${pnlStr})
- Date: ${trade.date || 'N/A'}
- Source / Analyst: ${trade.source || 'N/A'}
- Chart Pattern: ${trade.pattern || 'Not specified'}
- Entry Candle: ${trade.candle || 'Not specified'}
- Mood going in: ${trade.mood || 'Not specified'}

**Their Journal Notes:**
Why I entered: ${trade.why || '(not written)'}

What happened: ${trade.notes || '(not written)'}

Lesson learned: ${trade.lesson || '(not written)'}

---

Give feedback in this structure:

**What's Good**
What did the trader do well — in their execution, journaling, or mindset?

**What to Improve**
Honest coaching on what was weak — were they emotional, did they miss something in the setup, is their journaling too vague?

**Psychology Check**
Comment on their mindset going into the trade and after. Was it a disciplined trade or were they chasing?

**Journaling Tip**
One specific thing they can do to make their journal entries more useful for their growth.

**One Thing to Work On**
The single most important thing this trader should focus on before their next trade.

Keep it real, keep it short. Talk like a mentor who's been in the market. No fluff.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 900,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(JSON.stringify({ error: 'Anthropic API error: ' + errText }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await response.json();
    const feedback = result.content?.[0]?.text || 'No feedback returned.';

    return new Response(JSON.stringify({ feedback }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = { path: '/api/analyze-journal' };
