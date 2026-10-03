import { json, fail, readJson, askModel } from "./_lib.js";

const MAX_SLIDES = 15;

export async function POST(request) {
  const body = await readJson(request);
  if (!body) return fail("Request body must be JSON");
  const { slides } = body;
  if (!Array.isArray(slides) || slides.length === 0) return fail("slides must be a non-empty array");
  if (slides.length > MAX_SLIDES) return fail(`At most ${MAX_SLIDES} slides`);

  const content = [
    { type: "text", text: "Here are the team's slides, in order. Each one has its extracted text and a picture." },
  ];
  slides.forEach((slide, i) => {
    content.push({ type: "text", text: `Slide ${i + 1} text: ${String(slide.text ?? "").slice(0, 3000) || "(none)"}` });
    if (typeof slide.image === "string" && slide.image.startsWith("data:image/")) {
      content.push({ type: "image_url", image_url: { url: slide.image } });
    }
  });

  try {
    const result = await askModel({
      model: process.env.OPENROUTER_SLIDES_MODEL,
      maxTokens: 3000,
      system:
        "You read a hackathon team's pitch slides so judges can question them later. " +
        "For each slide, write one short paragraph starting with \"Slide N:\" that says what the slide " +
        "claims, including what any pictures, charts, diagrams or screenshots show and any numbers in them. " +
        "Be factual; don't praise or critique. " +
        'Reply with only JSON: {"summary": "Slide 1: ...\\n\\nSlide 2: ..."}',
      content,
    });
    if (typeof result.summary !== "string" || !result.summary.trim()) throw new Error("The model returned no summary");
    return json({ summary: result.summary });
  } catch (err) {
    console.error("slides:", err);
    return fail(`Could not read the slides: ${err.message}`, 502);
  }
}
