import { json, fail, readPanel, readJson, askModel, checkPasscode } from "./_lib.js";

export async function POST(request) {
  const denied = checkPasscode(request);
  if (denied) return denied;

  const body = await readJson(request);
  if (!body) return fail("Request body must be JSON");
  const { summary, transcript } = body;
  if (typeof summary !== "string") return fail("summary is required");
  if (typeof body.question !== "string" || !body.question.trim()) return fail("question is required");
  const { question, cutIn } = splitCutIn(body.question);
  const panel = readPanel(body);
  if (panel.error) return fail(panel.error);
  if (!transcript || typeof transcript.text !== "string") return fail("transcript.text is required");
  if (!transcript.text.trim()) {
    return json({
      feedback: "We didn't hear an answer. Try again and speak up.",
      score: 1,
      followUp: null,
      checks: { answered: false, usedSlides: false, concise: false, confident: false },
    });
  }

  const { judge, difficulty, occasion } = panel;
  const f = transcript.fillers ?? {};
  // Typed answers come without timings, so only mention delivery when we have it.
  const delivery = transcript.durationSeconds
    ? `Delivery, measured by our code: ${transcript.durationSeconds} seconds, ` +
      `${transcript.wordsPerMinute} words per minute (130 to 160 is ideal), ` +
      `fillers: ${f.um ?? 0} "um", ${f.uh ?? 0} "uh", ${f.like ?? 0} "like", ` +
      `${transcript.longPauses ?? 0} pauses of 2 seconds or more.`
    : "The answer was typed, so there is no delivery data. Judge the content only.";
  const cutInNote = cutIn
    ? `\n\nWhat happened (a note from the app, not part of your question): ${cutIn} ` +
      "Treat this as a sign the answer was not concise. Don't quote this note back."
    : "";

  try {
    const result = await askModel({
      model: process.env.OPENROUTER_MODEL,
      system:
        `You are ${judge.name}. The occasion is ${occasion}. ${judge.style} ` +
        "You asked the team a question and they answered out loud. Coach them: say in 2 to 4 " +
        "short sentences what worked and the one most important thing to fix, speaking to them " +
        'as "you". Use the delivery numbers if given, but don\'t just repeat them. ' +
        "Score the answer from 1 to 10, where 5 is an okay answer and 9 or 10 would impress real judges. " +
        `${difficulty.grading} ` +
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
        `Their answer (transcribed): ${transcript.text.slice(0, 8000)}\n\n${delivery}${cutInNote}`,
    });

    const score = Math.min(10, Math.max(1, Math.round(Number(result.score)) || 1));
    const followUp = typeof result.followUp === "string" && result.followUp.trim() ? result.followUp : null;
    if (typeof result.feedback !== "string") throw new Error("The model returned no feedback");
    const c = result.checks ?? {};
    const checks = {
      answered: c.answered === true,
      usedSlides: c.usedSlides === true,
      // A judge had to cut them off, so it ran long.
      concise: !cutIn && c.concise === true,
      // A typed answer has no delivery to judge.
      confident: !transcript.durationSeconds || c.confident === true,
    };
    return json({ feedback: result.feedback, score, followUp, checks });
  } catch (err) {
    console.error("feedback:", err);
    return fail(`Could not grade the answer: ${err.message}`, 502);
  }
}

// When "Judges interrupt" is on, the page adds a line to the question like
// "(The judge cut in after 46 seconds because the answer ran long, ...)".
// Split it off so the model grades the real question and doesn't quote the note.
function splitCutIn(text) {
  const match = text.match(/\n\s*\((The judge cut in[^)]*)\)\s*$/);
  if (!match) return { question: text.trim(), cutIn: null };
  return { question: text.slice(0, match.index).trim(), cutIn: match[1].trim() };
}
