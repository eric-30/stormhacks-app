import { json, fail, readPanel, readJson, askModel, checkPasscode } from "./_lib.js";

const FAKE_QUESTIONS = [
  "Who is going to pay for this?",
  "Who are your main competitors, and why would anyone switch to you?",
  "What would you do with ten thousand dollars of funding tomorrow?",
];

export async function POST(request) {
  const denied = checkPasscode(request);
  if (denied) return denied;

  const body = await readJson(request);
  if (!body) return fail("Request body must be JSON");
  const { summary } = body;
  if (typeof summary !== "string" || !summary.trim()) return fail("summary is required");
  const panel = readPanel(body);
  if (panel.error) return fail(panel.error);

  // Lets the page be built and deployed before the OpenRouter key is set up.
  if (!process.env.OPENROUTER_API_KEY) return json({ questions: FAKE_QUESTIONS });

  const { judge, difficulty, occasion } = panel;
  try {
    const result = await askModel({
      model: process.env.OPENROUTER_MODEL,
      system:
        `You are ${judge.name}. The occasion is ${occasion}. You're about to question the ` +
        `presenters. ${judge.style} Fit your questions to the occasion, and skip angles that ` +
        `make no sense there. ${difficulty.questions} ` +
        "Write exactly 3 questions about this specific project, using details from what they told you. " +
        "If they gave no details, ask the general questions a judge like you asks any team. " +
        "Each question is one or two short spoken sentences, under 35 words, the way a real " +
        "judge talks out loud. Ask one thing per question. " +
        "No numbering, no preamble. " +
        'Reply with only JSON: {"questions": ["...", "...", "..."]}',
      content: `What the team told you about their project:\n\n${summary.slice(0, 20000)}`,
    });
    const questions = (result.questions ?? []).filter((q) => typeof q === "string" && q.trim()).slice(0, 3);
    if (questions.length < 3) throw new Error("The model returned fewer than 3 questions");
    return json({ questions });
  } catch (err) {
    console.error("questions:", err);
    return fail(`Could not write questions: ${err.message}`, 502);
  }
}
