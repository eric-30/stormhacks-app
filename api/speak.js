import { PERSONAS, fail, checkPersona, readJson, checkPasscode } from "./_lib.js";

// Every character spoken costs ElevenLabs credits, so cap the length.
const MAX_CHARS = 400;

export async function POST(request) {
  const denied = checkPasscode(request);
  if (denied) return denied;

  const body = await readJson(request);
  if (!body) return fail("Request body must be JSON");
  const { text, persona } = body;
  if (typeof text !== "string" || !text.trim()) return fail("text is required");
  if (text.length > MAX_CHARS) return fail(`text must be under ${MAX_CHARS} characters`);
  const personaError = checkPersona(persona);
  if (personaError) return fail(personaError);
  if (!process.env.ELEVENLABS_API_KEY) return fail("ELEVENLABS_API_KEY is not set", 500);

  const voiceId = PERSONAS[persona].voiceId;
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`,
    {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "Content-Type": "application/json" },
      // Flash costs half the credits per character of the multilingual model.
      body: JSON.stringify({ text, model_id: "eleven_flash_v2_5" }),
    }
  );
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    console.error("speak:", res.status, detail);
    return fail(`Text-to-speech failed (${res.status}): ${detail}`, 502);
  }

  return new Response(res.body, { status: 200, headers: { "Content-Type": "audio/mpeg" } });
}
