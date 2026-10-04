# Contract proposals

Nothing here is the contract yet. If Eric agrees, copy the change into the contract in
`CLAUDE.md`, commit and push it, and only then change the code on both sides. Then
delete it from this file.

## A back-and-forth with each judge

Proposed by Luca. The page side is built (not pushed yet), and it already works with
today's server: it keeps going while `followUp` isn't null, and closes with the first
sentence of `feedback`. This change makes the judges sound like people in a conversation.

In Q&A practice, each judge now keeps asking follow-ups until they're satisfied (at most
1 on difficulty 1 and 2, 2 on 3, and 3 on 4 and 5). Then the judge says a short verdict
out loud, and the page shows the feedback for the whole exchange.

`POST /api/feedback` gets two optional fields:

- `"conversation": [{"question": "string", "answer": "string"}]`: the earlier turns with
  this judge on this question, oldest first. `question` and `transcript` in the request
  are still the turn just answered.
- `"followUpsLeft": number`: how many more follow-ups the judge may ask. At 0 they must
  wrap up.

The success response gets two fields:

- `"reply": "string"`: what the judge says out loud now, in character, up to 200
  characters, in the first person, with no stage directions.
  - If there's a follow-up: a short reaction to the answer, said just before it ("Okay,
    fair. But"), without repeating the follow-up.
  - If not: the closing verdict, one or two sentences ("Alright, I buy it. Lead with the
    price next time.").
- `"satisfied": boolean`: true when `followUp` is null.

When `conversation` is sent:

- `feedback`, `score` and `checks` cover the whole exchange, not just the last answer.
- `followUp` is asked only when the answers so far are vague, dodge the question, or
  open an obvious hole, and more readily at higher difficulty. It's null when satisfied,
  or when `followUpsLeft` is 0. Keep it under 150 characters: the page sends `reply` and
  `followUp` together to `/api/speak`, which has a 400-character cap.

Without `conversation` (the run-through, or follow-ups turned off), nothing changes;
`reply` and `satisfied` may be left out.

```json
POST /api/feedback
{"summary": "...", "question": "So how much would a hackathon pay?", "persona": "business",
 "difficulty": 4, "setting": "hackathon", "transcript": {...},
 "conversation": [{"question": "Who pays for this?", "answer": "Um, organisers, mostly."}],
 "followUpsLeft": 2}

-> {"reply": "Okay, a number at last.", "followUp": "And why would they pay that instead of nothing?",
    "satisfied": false, "feedback": "...", "score": 5, "checks": {...}}
```

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

Pitches in the full run-through can now be up to 15 minutes (for a thesis defense). The
page records them at a lower bitrate, so even 15 minutes stays under 4 MB, but
transcribing a long pitch costs more ElevenLabs credits.
