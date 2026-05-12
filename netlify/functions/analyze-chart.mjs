// analyze-chart.mjs
// Accepts a base64 chart image + trade context, returns AI pattern/candle analysis
// Requires ANTHROPIC_API_KEY environment variable set in Netlify dashboard

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { image, tradeData } = await req.json();

    if (!image) {
      return new Response(JSON.stringify({ error: 'No image provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({
        error: 'ANTHROPIC_API_KEY not set. Go to Netlify → Site Settings → Environment Variables and add your Anthropic API key.'
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const tradeContext = tradeData
      ? `Trade context: Ticker: ${tradeData.ticker || 'unknown'}, Type: ${tradeData.type || 'unknown'}, Entry: $${tradeData.entry || '?'}, Exit: $${tradeData.exit || '?'}`
      : '';

    const prompt = `You are an expert technical analyst and trading coach reviewing a trader's chart screenshot.

${tradeContext}

Analyze this chart and provide concise, actionable feedback covering:

**1. Chart Pattern**
What pattern is visible? (Bull Flag, Bear Flag, Breakout, Triangle, Wedge, etc.) Describe it briefly.

**2. Candle / Wick Analysis**
What notable candle or wick formations appear at key levels? Name the candle type and what it signals.

**3. Entry Quality**
If you can identify an entry point, was it a solid setup? Was the timing clean or did they enter early/late?

**4. Key Levels**
Any obvious support, resistance, VWAP, or EMA levels visible?

**5. What to Avoid**
Based on this chart, what candle or setup pattern should the trader avoid in the future?

**6. Overall Verdict**
One honest sentence rating the quality of this setup (A / B / C grade and why).

Keep it tight and real — talk like a trading coach, not a textbook.`;

    // Strip data URL prefix if present
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    // Detect media type
    const mediaType = image.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Data
              }
            },
            { type: 'text', text: prompt }
          ]
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
    const analysis = result.content?.[0]?.text || 'No analysis returned.';

    return new Response(JSON.stringify({ analysis }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = { path: '/api/analyze-chart' };
