# ToughCrowd

Practise the hardest part of a hackathon: the judges' questions.

ToughCrowd reads your slides, then a panel of judges questions you out loud. You answer
out loud too, and see how it came across: what you said, and how you said it (filler
words, pace, long pauses).

Built at StormHacks 2026.

## What it does

- **Tell the judges about your project.** Upload your slides as a PDF (pictures and
  charts included), explain it out loud, fill in a few boxes, or paste a paragraph.
- **Pick your panel.** The Investor ("Who pays for this?"), the Grandma ("Explain it like
  I'm your grandma"), the Engineer ("What if the API is down?") and the Teacher ("Walk me
  through it, step by step"). Each has their own voice.
- **Answer out loud.** The judge speaks the question. You answer, and get a score, what
  worked and what to fix, a pass or fail on four checks, and the delivery numbers:
  filler words, words per minute, long pauses and length. Your transcript shows fillers
  in red and long pauses where they happened.
- **Try again, or take the follow-up.** Answer the same question twice and watch the
  score change, or answer the judge's follow-up question.
- **Full judging round.** A 3-minute pitch on a timer, recorded, then 1 minute of
  rapid-fire questions, the same as StormHacks judging. Feedback on all of it at the end.

The filler-word count, pace and pauses come from the word timings, counted by our own
code, not guessed by the AI.

## How it works

```
  Browser (public/)                       Vercel functions (api/)          Outside APIs
 ┌───────────────────────────┐          ┌──────────────────────┐
 │ pdf.js: slide text + JPEG ├─────────►│ /api/slides          ├──► OpenRouter (vision model)
 │                           │ summary  │                      │     reads the slides once
 │ judges' questions         ├─────────►│ /api/questions       ├──► OpenRouter
 │                           │          │                      │
 │ judge speaks              ├─────────►│ /api/speak           ├──► ElevenLabs text-to-speech
 │                           │          │                      │     one voice per judge
 │ MediaRecorder: answer     ├─────────►│ /api/transcribe      ├──► ElevenLabs speech-to-text
 │                           │          │  counts fillers,     │     word timings
 │                           │          │  pace, pauses        │
 │ feedback, checks, score   ├─────────►│ /api/feedback        ├──► OpenRouter
 └───────────────────────────┘          └──────────────────────┘
```

- The page is plain HTML, CSS and JavaScript. The server is one plain Node function per
  request, on Vercel. No frameworks.
- The slides are read once, into a short summary. Every later request sends that
  summary, so it stays fast and cheap. Nothing is saved on the server.
- Only the server holds API keys. A shared passcode keeps strangers from spending our
  credits.
- The page and the server only talk through the contract in `CLAUDE.md`.

## Run it

You need Node 20 or later, and Chrome (recording uses Chrome's MediaRecorder).

1. Copy `.env.example` to `.env` and fill in the keys:

   | Setting | What it is |
   | --- | --- |
   | `OPENROUTER_API_KEY` | OpenRouter key |
   | `OPENROUTER_MODEL` | Model that writes questions and grades answers |
   | `OPENROUTER_SLIDES_MODEL` | Model that reads the slides (must accept images) |
   | `ELEVENLABS_API_KEY` | ElevenLabs key, for the voices and transcription |
   | `APP_PASSCODE` | Optional. If set, the page asks for it before the judges answer |

2. Run `npx vercel dev` and open http://localhost:3000.

**Without any keys:** open the page with `?mock` at the end of the address. The judges
give made-up answers, nothing is sent to the server, and no credits are spent.

**Deploy:** push to GitHub; Vercel deploys automatically. Set the same settings in the
Vercel project's Environment Variables.

## Team

- Eric: the server (`api/`), and presenting.
- Luca: the page (`public/`).
