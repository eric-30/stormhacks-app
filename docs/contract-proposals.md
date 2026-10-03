# Contract proposals

Proposed by Luca for features 7, 9 and 13. Nothing here is the contract yet. If Eric
agrees, copy the change into the contract in `CLAUDE.md`, commit and push it, and only
then change the code on both sides. Then delete it from this file.

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

Slides are now optional on the page. With no slides, the page sends this as `summary`,
since `/api/questions` needs a non-empty one:

> The team didn't share their slides. Ask the general questions judges ask any hackathon
> team: what the project does, who it is for, why it matters, what was hard to build, and
> what they would do next.

The questions prompt says "using details from their slides", and the model handled this
fine in a test, but you may want the prompt to expect it.
