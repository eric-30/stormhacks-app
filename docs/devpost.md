# Devpost draft

Draft for the StormHacks 2026 submission. Edit freely, then paste each section into
Devpost. Anything in [square brackets] needs the team to fill it in or check it.
Never say "interview" or "interviewer": say judges, panel, Q&A, pitch defense.

**Project name:** ToughCrowd

**Tagline (max 200 characters):** A panel of AI judges reads your slides, grills you on
your project out loud, and tells you how your answers came across: what you said and how
you said it.

**Links:** https://toughcrowd.tech [check it works] · https://stormhacks-app.vercel.app ·
https://github.com/eric-30/stormhacks-app

**Built with:** javascript, html, css, node.js, vercel, elevenlabs, openrouter, claude,
gemini, pdf.js

---

## Inspiration

Every hackathon ends the same way. You've slept four hours, you've rehearsed the
three-minute pitch, and then a judge asks "who actually pays for this?" or "what happens
when that API goes down?" and your mind goes blank. The pitch gets practised. The
questions never do, because friends go easy on you and nobody wants to play the
skeptical engineer at 3 AM.

[One real example from the team: a time one of you froze on a judge's question.]

We wanted something that plays the panel for you: one that has actually read your
slides, asks the hard questions out loud, and tells you honestly how you did.

## What it does

- **Tell the judges about your project.** Upload your slides as a PDF (pictures and
  charts included), explain it out loud, fill in a few boxes, or paste a paragraph.
- **Pick your panel.** Four judges, each with their own angle and their own voice:
  - **The Investor:** "Who pays for this? Who are your competitors?"
  - **The Grandma:** "I don't get it. Explain it like I'm your grandma."
  - **The Engineer:** "How does this scale? What if the API is down?"
  - **The Teacher:** "What did you learn? Walk me through it, step by step."
- **Answer out loud.** The judge asks the question in their voice. You answer, and get:
  - coaching on what worked and the one thing to fix, with a score from 1 to 10
  - four pass/fail checks: answered the question, used your slides, concise, confident
  - delivery numbers: filler words ("um", "uh", "like"), words per minute and long pauses
  - your transcript, with fillers in red and pauses marked where they happened
  - a follow-up question when you dodged
- **Judges who cut in.** Turn on "Judges interrupt" and ramble past 45 seconds: the judge
  cuts in out loud and gives you 15 seconds to wrap up, just like a real panel.
- **A full judging round.** A 3-minute pitch on a timer, recorded, then rapid-fire
  questions, the same format as StormHacks judging, with feedback on all of it at the end.

The filler-word count, pace and pauses are measured by our own code from word
timestamps, not guessed by the AI.

## How we built it

Three parts, with a written contract between them so two people could build in parallel
without breaking each other's work.

- **The page** is plain HTML, CSS and JavaScript, no framework. pdf.js reads each slide's
  text and draws it as an image in the browser. The browser's MediaRecorder records
  answers.
- **The server** is five small Node functions on Vercel, one per job: read the slides,
  write questions, speak, transcribe, and give feedback. Only the server holds the API
  keys, and a shared passcode protects our credits on the public link.
- **The AI:**
  - Gemini 2.5 Flash (through OpenRouter) looks at the slide images once and writes a
    summary, including what charts and screenshots show. Every later request reuses that
    summary, so it stays fast and cheap.
  - Claude Sonnet 5.5 (through OpenRouter) plays the four judges: writing questions and
    grading answers. We picked it by testing four models on the same slides and the same
    saved answers. It asked the sharpest questions and graded a weak answer low, where the
    cheapest model gave it a 5 out of 10.
  - ElevenLabs text-to-speech gives each judge their own voice. The page makes every
    question's audio as soon as the session starts, so there's no waiting at the table.
  - ElevenLabs Scribe turns your answer into text with a timestamp on every word, in
    verbatim mode so "um" and "uh" stay in. Our code counts fillers, words per minute and
    every gap of 2 seconds or more.

A full session costs about 20 cents in AI calls and voices. Nothing is stored: the
session lives in your browser tab.

## Challenges we ran into

- **Keeping the "um"s.** Speech-to-text tools usually clean up filler words, which is the
  opposite of what we need. We had to make sure transcription runs in verbatim mode, and
  count fillers ourselves from word timestamps instead of asking the AI.
- **Grading that isn't just nice.** Our first model scored a rambling non-answer 5 out of
  10. We ran a side-by-side test of four models and switched to the one that was honest.
- **Interruptions.** When a judge cuts in, the grader needs to know why the answer ended
  early, without treating that note as part of the question.
- **Request limits.** Serverless functions limit how much data one request can carry,
  which shaped our 15-slide and 3-minute caps.
- [Anything else the team hit: deployment, the Wi-Fi, Git merge conflicts...]

## Accomplishments that we're proud of

- A judge that cuts you off mid-ramble, out loud. It's the moment everyone remembers.
- Delivery numbers that are measured, not guessed: the same recording always gives the
  same count.
- Four judges with genuinely different angles, grounded in your actual slides.
- Two people building the page and the server in parallel from a written contract, with
  no integration surprises.
- [Only if true: "We used ToughCrowd to prepare for this judging."]

## What we learned

- [Each teammate: one thing in your own words. Ideas: how serverless functions and API
  keys work; how speech-to-text timestamps work; choosing an AI model by testing instead
  of guessing; splitting work with a written contract.]

## What's next for ToughCrowd

- A history across sessions, so you can watch your filler count drop.
- Custom judges built from your real panel: a specific professor, a sponsor, a VC.
- Practice for class presentations, capstone and thesis defenses, and startup demo days:
  anywhere a panel questions you on your slides.

## Team

- Eric: the server, and presenting.
- Luca: the page.
- [Art teammate's name]: design, the app name and the pitch slides.
