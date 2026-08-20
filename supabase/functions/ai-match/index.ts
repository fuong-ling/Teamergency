const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const clampScore = (value: unknown, fallback: number) => {
  const score = Number(value);
  if (!Number.isFinite(score)) return fallback;
  return Math.max(0, Math.min(100, Math.round(score)));
};

const asStringList = (value: unknown) =>
  Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 6)
    : [];

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    const model = Deno.env.get('OPENAI_MATCH_MODEL') || 'gpt-4o-mini';
    const payload = await request.json();
    const ruleBasedScore = clampScore(payload.ruleBasedScore, 0);

    if (!apiKey) {
      return Response.json(
        {
          match_score: ruleBasedScore,
          explanation: 'Calculated using standard matching.',
          strengths: [],
          potential_gaps: ['AI match explanation is not configured yet.'],
          fallback_used: true,
        },
        { headers: corsHeaders },
      );
    }

    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        match_score: { type: 'integer', minimum: 0, maximum: 100 },
        explanation: { type: 'string' },
        strengths: { type: 'array', items: { type: 'string' }, maxItems: 4 },
        potential_gaps: { type: 'array', items: { type: 'string' }, maxItems: 4 },
      },
      required: ['match_score', 'explanation', 'strengths', 'potential_gaps'],
    };

    const aiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'system',
            content:
              'You assess teammate compatibility for a university MVP. Use the provided rule-based score as an anchor. Return only structured JSON. Do not invent personal facts.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              rule_based_score: ruleBasedScore,
              current_profile: payload.currentProfile,
              current_request: payload.currentRequest,
              candidate_profile: payload.candidateProfile,
              candidate_request: payload.candidateRequest,
              review_summary: payload.reviewSummary,
            }),
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'teamergency_match_assessment',
            strict: true,
            schema,
          },
        },
      }),
      signal: AbortSignal.timeout(9000),
    });

    if (!aiResponse.ok) {
      throw new Error(`OpenAI request failed: ${aiResponse.status}`);
    }

    const result = await aiResponse.json();
    const outputText = result.output_text || result.output?.[0]?.content?.[0]?.text || '';
    const parsed = JSON.parse(outputText);

    return Response.json(
      {
        match_score: clampScore(parsed.match_score, ruleBasedScore),
        explanation: String(parsed.explanation || 'Calculated using AI-assisted matching.').slice(0, 240),
        strengths: asStringList(parsed.strengths),
        potential_gaps: asStringList(parsed.potential_gaps),
        fallback_used: false,
      },
      { headers: corsHeaders },
    );
  } catch (_error) {
    return Response.json(
      {
        match_score: 0,
        explanation: 'Calculated using standard matching.',
        strengths: [],
        potential_gaps: [],
        fallback_used: true,
      },
      { status: 502, headers: corsHeaders },
    );
  }
});
