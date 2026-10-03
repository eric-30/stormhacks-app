# Contract proposals

Proposed by Luca: a fourth judge, and features 7, 9 and 13. Nothing here is the contract yet. If Eric
agrees, copy the change into the contract in `CLAUDE.md`, commit and push it, and only
then change the code on both sides. Then delete it from this file.

## A fourth judge: `teacher`

`persona` becomes one of four strings: `"business" | "confused" | "technical" | "teacher"`,
in every request that has one (`/api/questions`, `/api/speak`, `/api/feedback`).

4. `teacher`: a teacher or professor. "What did you learn building this? Walk me through
   how it works, step by step. Why did you pick this approach over the obvious one?"

The server needs a prompt style and an ElevenLabs voice for it. The page is ready: the
Teacher's portrait is `public/img/judge-teacher.jpg`, and adding the judge to the page
is one entry in `public/judges.js` once this is in the contract.

## Feature 7: shared passcode

Every request from the page carries a header:

- `X-Passcode: <the code>`

The server checks it against a new setting `APP_PASSCODE` (in `.env` and Vercel). If
`APP_PASSCODE` isn't set, the server skips the check, so local testing still works.

- Wrong or missing passcode: status 401, `{"error": "Wrong passcode"}`

The page asks for the code once, before the first request, and remembers it in the
browser. On a 401 it asks again.

## Feature 9: scoring guide

`POST /api/feedback` success gains one field:

```json
{
  "feedback": "string",
  "score": 1-10,
  "followUp": "string or null",
  "checks": {
    "answered": true,
    "usedSlides": false,
    "concise": true,
    "confident": true
  }
}
```

Each check is pass (`true`) or fail (`false`):

- `answered`: answered the question that was asked
- `usedSlides`: used something from the slides
- `concise`: concise
- `confident`: confident delivery. For a typed answer (`durationSeconds` 0) this is
  always `true`, since there's no delivery to judge.

`score` stays, so nothing breaks if the page is updated later than the server.

## Feature 13: fillers and pauses in the transcript

`POST /api/transcribe` success gains one field, the word timings it already has:

```json
{
  "...everything as now...": "",
  "words": [{ "text": "string", "start": 0.42, "end": 0.71 }]
}
```

`start` and `end` are in seconds from the start of the recording. The page uses them to
show fillers in red and pauses of 2 seconds or more as "⏸ 3.1s" inside the transcript.

`/api/feedback` still receives the whole transcript body as now, `words` included, and
can ignore `words`.

## Not a contract change, just so you know

`summary` isn't always a slide summary any more. A team without a PDF can explain their
project out loud (the page sends the recording to `/api/transcribe` and uses the text)
or fill in a few boxes. The page then sends one of these as `summary`:

```
The team explained their project out loud (no slides):
<what they said>
```

```
The team described their project (no slides):
Project name: ...
What it does: ...
Who it is for: ...
How it works: ...
Hardest part, or what they are proudest of: ...
```

The questions and feedback prompts say "The team's slides:", which still worked in tests,
but you may want them to say "What the team told you about their project:".
