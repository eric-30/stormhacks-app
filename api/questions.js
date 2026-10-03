import { PERSONAS, json, fail, checkPersona, readJson, askModel } from "./_lib.js";

const FAKE_QUESTIONS = [
  "Who is going to pay for this?",
  "Who are your main competitors, and why would anyone switch to you?",
  "What would you do with ten thousand dollars of funding tomorrow?",
];

export async function POST(request) {
  const body = await readJson(request);
  if (!body) return fail("Request body must be JSON");
  const { summary, persona } = body;
  if (typeof summary !== "string" || !summary.trim()) return fail("summary is required");
  const personaError = checkPersona(persona);
  if (personaError) return fail(personaError);

  // Lets the page be built and deployed before the OpenRouter key is set up.
  if (!process.env.OPENROUTER_API_KEY) return json({ questions: FAKE_QUESTIONS });

  const judge = PERSONAS[persona];
  try {
    const result = await askModel({
      model: process.env.OPENROUTER_MODEL,
      system:
        `You are ${judge.name} at a student hackathon, about to question a team after their pitch. ` +
        `${judge.style} ` +
        "Write exactly 3 questions about this specific project, using details from their slides. " +
        "Each question is one or two short spoken sentences, the way a real judge talks out loud. " +
        "No numbering, no preamble. " +
        'Reply with only JSON: {"questions": ["...", "...", "..."]}',
      content: `The team's slides:\n\n${summary.slice(0, 20000)}`,
    });
    const questions = (result.questions ?? []).filter((q) => typeof q === "string" && q.trim()).slice(0, 3);
    if (questions.length < 3) throw new Error("The model returned fewer than 3 questions");
    return json({ questions });
  } catch (err) {
    console.error("questions:", err);
    return fail(`Could not write questions: ${err.message}`, 502);
  }
}
