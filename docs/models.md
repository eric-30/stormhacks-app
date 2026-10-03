# Model comparison

October 3, about hour 3. OpenRouter only, no ElevenLabs. Same summary (a 5-slide
ToughCrowd deck), questions from the `business` and `technical` judges, and the
`technical` judge grading two saved answers to "What happens if ElevenLabs goes down in
the middle of someone's practice session?":

- **Weak:** "Um, so, like, if it goes down, uh, then it, um, wouldn't work I guess. But,
  like, it's a big company so it probably won't go down." (4 um, 2 like, 2 long pauses)
- **Strong:** a concrete fallback (type the answer, questions shown as text, audio made
  up front), no fillers, 148 words a minute.

| Model | Price per million tokens (in / out) | Time per call | Weak score | Strong score |
| --- | --- | --- | --- | --- |
| openai/gpt-4o-mini | $0.15 / $0.60 | about 2 s | 5 | 7 |
| google/gemini-3.8-flash | $0.75 / $3.75 | 7 to 10 s | 2 | 7 |
| anthropic/claude-haiku-4.5 | $1 / $5 | 3 to 4 s | 2 | 7 |
| anthropic/claude-sonnet-5.5 | $2 / $10 | 3 to 4 s | 3 | 6 |

## What each gave back

- **gpt-4o-mini:** fast, but generic questions ("Who are your main competitors?") that
  ignore the deck's details. Gave the weak answer a 5, and missed that the strong answer
  used the slides.
- **gemini-3.8-flash:** sharp questions that named real competitors (Yoodli, ChatGPT voice
  mode), but long-winded, which costs ElevenLabs credits to speak, and 7 to 10 seconds per
  call: too slow at the judging table.
- **claude-haiku-4.5:** specific, pointed questions and good grading. One factual slip
  (said the vision model runs in the browser). Questions a bit long.
- **claude-sonnet-5.5:** the best questions. They quote the deck ("you said $200 per
  event... have you talked to even one?") and ask what's actually built. The most useful
  feedback: on the strong answer it spotted that typing loses the delivery numbers, the
  product's main point. Feedback runs a little longer than asked.

## Pick

**anthropic/claude-sonnet-5.5.** Quality is the product, and at about half a cent a call
a whole session costs under 10 cents. Fallback if it's slow or down:
`anthropic/claude-haiku-4.5`. Set as `OPENROUTER_MODEL` in `.env` and on Vercel.
