// Shared helpers for the api/ functions. Files starting with "_" are not turned into
// endpoints by Vercel.

export const PERSONAS = {
  business: {
    name: "a sponsor and investor judge",
    style:
      "You care about money and the market. Ask who pays for this, who the competitors are, " +
      "how it makes money, and why anyone would switch to it.",
    // ElevenLabs premade voices: George, Sarah, Adam.
    voiceId: "JBFqnCBsd6RMkjVDRZzb",
  },
  confused: {
    name: "a friendly but non-technical judge",
    style:
      "You don't understand technical jargon at all. Ask them to explain things simply, " +
      "like they're talking to their grandma, and ask what it actually does for a normal person.",
    voiceId: "EXAVITQu4vr4xnSDxMaL",
  },
  technical: {
    name: "a skeptical senior engineer judge",
    style:
      "You poke holes in the engineering. Ask how it scales, what happens when an API is down, " +
      "where the data lives, what's actually built versus faked, and what's hard about it.",
    voiceId: "pNInz6obpgDQGcFmaJgB",
  },
};

export function json(body, status = 200) {
  return Response.json(body, { status });
}

export function fail(message, status = 400) {
  return json({ error: message }, status);
}

export function checkPersona(persona) {
  return Object.hasOwn(PERSONAS, persona) ? null : 'persona must be "business", "confused" or "technical"';
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// Calls OpenRouter and returns the parsed JSON object the model wrote.
// `content` is a string or an array of OpenAI-style content parts (text and images).
export async function askModel({ model, system, content, maxTokens = 1200 }) {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not set");
  if (!model) throw new Error("No OpenRouter model is set");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "X-Title": "ToughCrowd",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "";
  return parseJsonLoose(text);
}

// Models sometimes wrap JSON in ```json fences or add a sentence around it.
function parseJsonLoose(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {}
    }
    throw new Error("The model did not return valid JSON");
  }
}
