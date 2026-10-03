# Contract proposals

Nothing here is the contract yet. If Eric
agrees, copy the change into the contract in `CLAUDE.md`, commit and push it, and only
then change the code on both sides. Then delete it from this file.

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
