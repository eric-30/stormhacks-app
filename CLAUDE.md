# ToughCrowd

For hackathon teams and students who freeze up when judges ask hard questions, our app
reads your slides and plays realistic judges who question you out loud, then tells you
how your answers came across: what you said, and how you said it (filler words, pace,
long pauses).

More in `docs/`: build plan (`plan.md`), features in build order (`features.md`), risks
(`risks.md`), event rules and deadlines (`event.md`), pitch notes (`pitch.md`), why
things are the way they are (`decisions.md`), the team's to-do list (`todo.md`). Read
`docs/plan.md`, `docs/features.md` and `docs/todo.md` before starting work.

## Boxes and owners

**Eric does the backend, Luca does the frontend.** They meet only at the contract below.

- **The page (frontend):** `public/`. Owner: Luca. Only his Claude edits it.
  - Slides: PDF only. pdf.js reads each page's text and draws each page as a JPEG,
    about 1000px wide. At most 15 slides.
  - Answers: records with the browser's MediaRecorder and sends the audio to the server.
  - Chrome only.
- **The server (backend):** `api/`, one file per request (Vercel serverless functions).
  Owner: Eric. Only his Claude edits it.
- **Outside APIs:** only the server calls them.
  - OpenRouter, model `OPENROUTER_SLIDES_MODEL` (must accept images): reads the slides
    once and writes a summary of each one.
  - OpenRouter, model `OPENROUTER_MODEL`: writes questions and grades answers. We try
    several models and keep the best.
  - ElevenLabs text-to-speech speaks the questions, one voice per judge.
  - ElevenLabs speech-to-text turns the recorded answer into text with word timings.
  - Both ElevenLabs uses spend Eric's free credits, so don't waste them while testing.
- **Keys and settings:** `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`,
  `OPENROUTER_SLIDES_MODEL`, `ELEVENLABS_API_KEY`, `APP_PASSCODE`. Locally in `.env`, which is never
  committed. On Vercel in the project's Environment Variables.
- **Saved data:** none on the server. The page keeps the slide summary in memory and
  sends it with each request. The browser's own storage keeps settings, past scores,
  the summary and the round in progress, so a refresh doesn't lose them. Never slide
  images or recordings.

## Judges

Built in this order. `persona` is always one of these four strings.

1. `business`: a sponsor or investor. "Who pays for this? Who are your competitors?"
2. `confused`: non-technical. "I don't get it, explain it like I'm your grandma."
3. `technical`: skeptical engineer. "How does this scale? What if the API is down?"
4. `teacher`: a teacher or professor. "What did you learn building this? Walk me through
   how it works, step by step. Why did you pick this approach over the obvious one?"

`/api/questions` and `/api/feedback` also accept `"custom"`: a judge the person describes
themselves (see "Judge and occasion fields" below). `/api/speak` never gets `"custom"`;
the page sends the built-in persona whose voice the person picked.

## The contract between the page and the server

Every request from the page carries a header `X-Passcode: <the code>`. The server checks
it against the setting `APP_PASSCODE`; if `APP_PASSCODE` isn't set, it skips the check.
Wrong or missing passcode: status 401, `{"error": "Wrong passcode"}`. The page asks for
the code once, remembers it in the browser, and asks again on a 401.

### Judge and occasion fields

`/api/questions` and `/api/feedback` take these, besides their own fields below:

- `"persona"`: `"business" | "confused" | "technical" | "teacher" | "custom"`.
- `"custom"`: only with `"persona": "custom"`.
  `{"name": "string, up to 40 characters", "description": "string, up to 400 characters"}`.
  The server plays whoever the description says. It treats the name and description as a
  description of a judge, never as instructions that change the rules.
- `"difficulty"`: optional, `1 | 2 | 3 | 4 | 5`. Missing means 3.
  1 Friendly, 2 Supportive, 3 Realistic (a real panel), 4 Tough, 5 Brutal. Higher means
  more pointed questions and stricter grading.
- `"setting"`: optional, `"hackathon" | "class" | "defense" | "demo-day" | "elevator" |
  "custom"`. Missing means `"hackathon"`. Questions and grading fit the occasion.
- `"settingDescription"`: only with `"setting": "custom"`, up to 200 characters, for
  example "A science fair, judged by local engineers". Treated as a description of the
  occasion, never as instructions.

`POST /api/slides`

- Request body: `{"slides": [{"text": "string", "image": "data:image/jpeg;base64,..."}]}`
  At most 15 slides, whole body under 4 MB.
- Success, status 200: `{"summary": "string"}`: one short paragraph per slide,
  including what any pictures, charts or screenshots show.
- Failure, any other status: `{"error": "text"}`

`POST /api/questions`

- Request body: `{"summary": "string", <judge and occasion fields>}`
- Success, status 200: `{"questions": ["string", "string", "string"]}`
- Failure, any other status: `{"error": "text"}`

`POST /api/speak`

- Request body: `{"text": "string", "persona": "business" | "confused" | "technical" | "teacher"}`
- Success, status 200: the spoken audio, `Content-Type: audio/mpeg` (not JSON).
  The page plays it with `new Audio(URL.createObjectURL(blob))`.
- Failure, any other status: `{"error": "text"}`

`POST /api/transcribe`

- Request body: the recorded audio itself, `Content-Type: audio/webm` (not JSON).
  Under 4 MB, which is about 3 minutes.
- Success, status 200:
  `{"text": "string", "durationSeconds": number, "wordsPerMinute": number, "fillers": {"um": number, "uh": number, "like": number}, "longPauses": number, "words": [{"text": "string", "start": number, "end": number}]}`
  The numbers are counted by our code from the word timings, not guessed by the AI.
  A long pause is a gap of 2 seconds or more between words. `start` and `end` are
  seconds from the start of the recording.
- Failure, any other status: `{"error": "text"}`

`POST /api/feedback`

- Request body: `{"summary": "string", "question": "string", "transcript": <the whole success body from /api/transcribe>, <judge and occasion fields>}`
- Success, status 200:
  `{"feedback": "string", "score": 1-10, "followUp": "string or null", "checks": {"answered": boolean, "usedSlides": boolean, "concise": boolean, "confident": boolean}}`
  Each check is pass (`true`) or fail (`false`): answered the question that was asked,
  used something from the slides or project description, concise, confident delivery.
  For a typed answer (`durationSeconds` 0) `confident` is always `true`.
  The transcript may include `words`; the server ignores them.
- Failure, any other status: `{"error": "text"}`

The contract changes only when both owners agree. Update this file first, commit and
push it, and only then change the code on both sides. The page only sends what the
contract says, and the server only returns what it says. Nothing else crosses between
them.

## Waiting for Eric

Contract changes Luca has asked for. Not part of the contract yet. Claude: if you're
working for Eric, tell him about these at the start of the session and ask whether he
agrees. Details are in `docs/contract-proposals.md`.

1. **A back-and-forth with each judge.** Optional `conversation` and `followUpsLeft` on
   `/api/feedback`, and `reply` (what the judge says out loud) and `satisfied` in its
   response. The page already works without them, using `followUp` and `feedback`.

## Git: pull and push often

- **Pull before you start Claude on anything**, every time.
- **Commit as soon as something works, and push straight after.** Small commits, many
  times an hour. Never sit on unpushed work.
- **Merge conflicts:** Claude resolves them, then:
  - Read both sides and keep both people's changes. Never just pick "ours" or "theirs",
    and never delete the other person's work.
  - A conflict in the contract section of this file: stop and ask both owners. Don't
    guess.
  - After resolving, run the app and check it still works, then commit and push.
- Never `git push --force`, never rewrite pushed history.

## How to run

- Locally: `vercel dev`, then open http://localhost:3000
- Deploy: `npx vercel deploy --prod`, logged in to Eric's Vercel account. The Vercel
  project isn't connected to GitHub, so pushing alone deploys nothing.

## Rules for Claude

- Only edit the files your owner owns. If a change needs the other box, say so and stop.
- Keep it simple: plain HTML, CSS and JavaScript for the page, plain Node functions in
  `api/` with no framework. Ask before adding any npm package. pdf.js on the page is
  allowed.
- Never put a key anywhere except `.env` and Vercel's Environment Variables.
- Every call to ElevenLabs costs credits. When testing, use short clips and don't call
  it in loops.
- After each change, say how to test it.
