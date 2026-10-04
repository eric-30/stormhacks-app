import { json, fail, checkPasscode } from "./_lib.js";

const MAX_BYTES = 4 * 1024 * 1024;

// Recorded on the page (webm), or a file uploaded instead of speaking.
const EXTENSIONS = {
  "audio/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/ogg": "ogg",
};
const LONG_PAUSE_SECONDS = 2;

export async function POST(request) {
  const denied = checkPasscode(request);
  if (denied) return denied;

  if (!process.env.ELEVENLABS_API_KEY) return fail("ELEVENLABS_API_KEY is not set", 500);

  // "audio/webm;codecs=opus" -> "audio/webm"
  const type = (request.headers.get("content-type") || "audio/webm").split(";")[0].trim().toLowerCase();
  if (!Object.hasOwn(EXTENSIONS, type)) {
    return fail("That audio format isn't supported. Use an mp3, m4a, wav, ogg or webm file.", 415);
  }

  const audio = await request.arrayBuffer();
  if (audio.byteLength === 0) return fail("No audio in the request body");
  if (audio.byteLength > MAX_BYTES) return fail("That audio is over 4 MB. Keep recordings under about 3 minutes, or upload a smaller file (an mp3 or m4a).", 413);

  const form = new FormData();
  form.append("model_id", "scribe_v2");
  form.append("language_code", "en");
  form.append("timestamps_granularity", "word");
  form.append("tag_audio_events", "false");
  // Keep "um" and "uh" in the transcript; we count them.
  form.append("no_verbatim", "false");
  form.append("file", new Blob([audio], { type }), `answer.${EXTENSIONS[type]}`);

  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY },
    body: form,
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    console.error("transcribe:", res.status, detail);
    return fail(`Speech-to-text failed (${res.status}): ${detail}`, 502);
  }

  const data = await res.json();
  return json(deliveryStats(data.words ?? []));
}

// Turns ElevenLabs word timings into the numbers the contract promises.
// Exported so it can be tested without spending credits.
export function deliveryStats(items) {
  const words = items.filter((w) => w.type === "word" && w.text?.trim());
  const text = words.map((w) => w.text.trim()).join(" ");
  const fillers = { um: 0, uh: 0, like: 0 };
  let longPauses = 0;

  words.forEach((w, i) => {
    const bare = w.text.toLowerCase().replace(/[^a-z]/g, "");
    if (/^u+m+$|^e+r+m+$|^h+m+$/.test(bare)) fillers.um++;
    else if (/^u+h+$|^e+r+$|^a+h+$/.test(bare)) fillers.uh++;
    else if (bare === "like") fillers.like++;

    if (i > 0 && w.start - words[i - 1].end >= LONG_PAUSE_SECONDS) longPauses++;
  });

  const durationSeconds = words.length ? round1(words.at(-1).end) : 0;
  const speakingSeconds = words.length ? words.at(-1).end - words[0].start : 0;
  const wordsPerMinute = speakingSeconds > 0 ? Math.round(words.length / (speakingSeconds / 60)) : 0;

  const timings = words.map((w) => ({ text: w.text.trim(), start: w.start, end: w.end }));

  return { text, durationSeconds, wordsPerMinute, fillers, longPauses, words: timings };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
