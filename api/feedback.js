import { PERSONAS, json, fail, checkPersona, readJson, askModel, checkPasscode } from "./_lib.js";

export async function POST(request) {
  const denied = checkPasscode(request);
  if (denied) return denied;

  const body = await readJson(request);
  if (!body) return fail("Request body must be JSON");
  const { summary, question, persona, transcript } = body;
  if (typeof summary !== "string") return fail("summary is required");
  if (typeof question !== "string" || !question.trim()) return fail("question is required");
  const personaError = checkPersona(persona);
  if (personaError) return fail(personaError);
  if (!transcript || typeof transcript.text !== "string") return fail("transcript.text is required");
  if (!transcript.text.trim()) {
    return json({
      feedback: "We didn't hear an answer. Try again and speak up.",
      score: 1,
      followUp: null,
      checks: { answered: false, usedSlides: false, concise: false, confident: false },
    });
  }

  const judge = PERSONAS[persona];
  const f = transcript.fillers ?? {};
  // Typed answers come without timings, so only mention delivery when we have it.
  const delivery = transcript.durationSeconds
    ? `Delivery, measured by our code: ${transcript.durationSeconds} seconds, ` +
      `${transcript.wordsPerMinute} words per minute (130 to 160 is ideal), ` +
      `fillers: ${f.um ?? 0} "um", ${f.uh ?? 0} "uh", ${f.like ?? 0} "like", ` +
      `${transcript.longPauses ?? 0} pauses of 2 seconds or more.`
    : "The answer was typed, so there is no delivery data. Judge the content only.";

  try {
    const result = await askModel({
      model: process.env.OPENROUTER_MODEL,
      system:
        `You are ${judge.name} at a student hackathon. ${judge.style} ` +
        "You asked the team a question and they answered out loud. Coach them: say in 2 to 4 " +
        "short sentences what worked and the one most important thing to fix, speaking to them " +
        'as "you". Use the delivery numbers if given, but don\'t just repeat them. ' +
        "Score the answer from 1 to 10, where 5 is an okay answer and 9 or 10 would impress real judges. " +
        "If the answer was vague, dodged the question, or opened an obvious hole, write one short " +
        "follow-up question you would ask next; otherwise followUp is null. " +
        "Also mark four checks, each true (pass) or false (fail): answered (they answered the " +
        "question you actually asked), usedSlides (they used something specific from what they " +
        "told you about the project), concise (no rambling or repeating), confident (steady " +
        "delivery: few fillers, a good pace, few long pauses). " +
        'Reply with only JSON: {"feedback": "...", "score": 7, "followUp": "..." or null, ' +
        '"checks": {"answered": true, "usedSlides": false, "concise": true, "confident": true}}',
      content:
        `What the team told you about their project:\n${summary.slice(0, 20000)}\n\n` +
        `Your question: ${question}\n\n` +
        `Their answer (transcribed): ${transcript.text.slice(0, 8000)}\n\n${delivery}`,
    });

    const score = Math.min(10, Math.max(1, Math.round(Number(result.score)) || 1));
    const followUp = typeof result.followUp === "string" && result.followUp.trim() ? result.followUp : null;
    if (typeof result.feedback !== "string") throw new Error("The model returned no feedback");
    const c = result.checks ?? {};
    const checks = {
      answered: c.answered === true,
      usedSlides: c.usedSlides === true,
      concise: c.concise === true,
      // A typed answer has no delivery to judge.
      confident: !transcript.durationSeconds || c.confident === true,
    };
    return json({ feedback: result.feedback, score, followUp, checks });
  } catch (err) {
    console.error("feedback:", err);
    return fail(`Could not grade the answer: ${err.message}`, 502);
  }
}
