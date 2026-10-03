# Pitch

Eric presents. 3 minutes, then 1 minute of judge questions.

## Words

Never say "interview" or "interviewer", except once in the opening line below. Say
judges, panel, Q&A, pitch defense. ToughCrowd is a panel grilling you on your project,
not questions about you.

## Not last year's winner

Last year's winner, InterVU, was an AI mock job interviewer that used ElevenLabs. Say
what's different in the first 20 seconds, but **don't name InterVU in the pitch**: "last
year's winner" is enough, and naming them only spends time on someone else's project.
Use the name only if a judge brings it up. Opening line:

> "Last year's winner prepped you for a job interview about yourself. ToughCrowd preps
> you for the panel that's about to tear apart your project."

A softer ending if that one feels too much: "...preps you for the panel that grills you
on your project."

## Who it's for

Hackathons, class presentations, capstone and thesis defenses, startup demo days.
Anywhere a panel questions you on your slides.

The four judges: the Investor, the Grandma, the Engineer and the Teacher.

## Shape

- Problem, about 30 seconds: freezing on judge questions, with a real example.
- Live demo, about 90 seconds: upload our own slides, turn on **Judges interrupt**, and
  let a judge ask a question out loud. Answer it and run long on purpose, so the judge
  cuts in and you get 15 seconds to wrap up. That's our most memorable moment. Then show
  the feedback, the checks and the filler-word count.
- How it works, about 40 seconds: the box drawing. Slides read once by a model that can
  see pictures, ElevenLabs voices and transcription, filler words and pace counted by
  our code from word timings, not guessed by the AI.
- What's next, about 20 seconds: a history across sessions, so you watch your filler
  count drop, and custom judges built from your real panel (a professor, a sponsor).

## Lines to have ready

- "We used it to prepare for this judging." Only say it if it's true.
- How do you know the filler count is right? It comes from the word timings, not the AI.
- What does it cost? "About 20 cents for a full session with all four judges." Worked out
  from prices on Saturday, for a session of 12 questions and 12 spoken answers:
  - Reading the slides once (Gemini 2.5 Flash, 15 images): about 1 cent.
  - Questions (Claude Sonnet 5.5, 4 calls at about half a cent): about 2 cents.
  - Grading (12 calls at about 0.65 cents): about 8 cents.
  - Judge voices (ElevenLabs Flash, about 0.22 credits per character, 12 questions of
    about 130 characters): about 350 credits, roughly 7 cents.
  - Speech-to-text: ElevenLabs charges per second of audio; the rate for our plan isn't
    measured yet. A session sends about 4 to 5 minutes of audio (full judging round:
    up to 3 min pitch plus about 1 min of answers; or 6 practice answers of 30 to 45 s;
    plus up to 2 min if they explain the project out loud). Typed answers send none.
    Balance was 130,622 at 2:26 PM Saturday, before Luca's first live voice test: the
    drop after it, minus the voices, gives credits per minute.
  OpenRouter's real spend for all of Saturday's testing was 5 cents.
- How is this different from InterVU? InterVU asked about you, for a job. ToughCrowd
  reads your slides and a panel asks about your project: four judges, each with their
  own angle, who cut in when you ramble.
