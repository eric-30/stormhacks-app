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

## Why it matters (mentors: sell this harder)

- **The gap:** "Everyone practises the pitch. Nobody practises the questions, because
  there's no one to ask them." Make this line land.
- **Who hurts:** first-time hackers, students in class presentations, anyone defending a
  thesis, non-native speakers. The people who freeze aren't the ones with bad ideas.
- **What's at stake:** grades, prizes, scholarships, funding. A good project loses in one
  minute of Q&A.
- Don't invent statistics. Our real case competition story plus a clear "who and why" is
  stronger than a made-up number.

## Who it's for

Hackathons, class presentations, capstone and thesis defenses, startup demo days.
Anywhere a panel questions you on your slides.

The four judges: the Investor, the Grandma, the Engineer and the Teacher.

## Shape

The words are in `pitch-script.md`. Budget: about 1:40 of talking (about 240 words at
140 to 150 a minute) plus about 75 seconds of demo, so 3:00 with a little slack.

First timed run, Saturday 5 PM: 2:23 of talking **without** the demo, 179 words a minute,
7 fillers. Too long and too fast: cut about 40% of the words, then slow down.

- Problem, about 25 seconds: grade 9, our first case competition, a judge asked about our
  financials and we both froze.
- Where pitches break, about 10 seconds: one sentence.
- Solution, about 20 seconds: a flight simulator for your pitch, any panel, friendly to
  brutal.
- Live demo, about 75 seconds: see "Demo plan" below.
- How it works, about 25 seconds: Gemini reads the slides, Claude plays the judges,
  ElevenLabs voices and timestamps, our code counts ums, pace and pauses.
- Why it's new, about 8 seconds: speaker coaches tell you how you talk; we also question
  you on your project.
- What's next, about 8 seconds: "Next, we take it from one person to a whole event:
  organizers load their real rubric, and every team gets a practice panel before
  judging." It also answers "who pays?" before anyone asks.

## Demo plan

**Judging is at our table** (a mentor confirmed): judges come to us and watch on our
laptops, no projector. Use two laptops: **laptop A shows the slides**, facing the judges,
and Eric presents from it; **laptop B runs ToughCrowd**, and Darren drives it.

About 75 seconds. Eric talks and faces the judges; Darren clicks.

**The cafeteria will be loud.** Before judging, test one recording at our table: is the
judge's voice loud enough (volume to max, a small speaker if anyone has one), and do
neighbours' voices end up in the transcript? If they do, hold laptop B closer to Eric, or
use earbuds with a microphone.

**Set up before the judges arrive (nothing is typed live):**
- Laptop B, Chrome, sound on and loud enough, microphone allowed, phone hotspot on.
- The app open on https://toughcrowd.tech (or the vercel.app link if the domain acts up),
  passcode already entered.
- This deck already uploaded and the slide summary ready, so no waiting for slides.
- Settings: **one judge, the Engineer**, difficulty **Brutal**, **Judges interrupt** on,
  realistic voices, practice mode (not the full judging round).
- Close every other tab and notification.

**On the table:**
1. (0:00) "Let's try it on this exact deck." Darren starts. The Engineer asks a question
   out loud. Brutal makes it sharp.
2. (0:08) Eric answers and keeps going on purpose: a long, "um"-heavy ramble.
3. (0:33) On Brutal the judge cuts in at 25 seconds. Stop, let the room react, then wrap
   up in one sentence. Darren stops the recording.
4. (0:45) While it grades (a few seconds), say: "It's transcribing every word with a
   timestamp, and our code is counting the ums."
5. (0:55) Show the result: point at the score, the failed "Concise" check, and the "um"s
   in red in the transcript. "The judge cut me off, and it noticed."
6. (1:15) Back to the slides.

**If something breaks:** say it calmly and keep going. "Live Wi-Fi, so here's one we ran
earlier." Have screenshots of a finished result open in another window, and the demo
video ready. If only the voice fails, the question still shows as text: read it out.

**Optional, only if we're under time and a judge seems curious:** "Want to try it? Answer
one question." Turn laptop B toward them.

**Rehearse it 3 times tonight** with the real setup, timing each run.

## Lines to have ready

- "We used it to prepare for this judging." Only say it if it's true.
- How do you know the filler count is right? It comes from the word timings, not the AI.
  The Engineer judge scored "it's very accurate" a 5: that's a claim, not evidence.
  **Tested Saturday evening:** Eric read a script with exactly 10 "um"s and 4 "uh"s at
  normal speed, and it caught all 14. Say: "We tested it with a script of 14 fillers and it
  caught all 14." Admit one limit: every "like" counts, even "I like it", and it's only as
  good as the transcription on mumbled words.
- How do you detect rambling? Be honest: **it's a timer**, like a real moderator. The
  judge cuts in after a set time that depends on difficulty (45 s on Realistic, 25 s on
  Brutal, shorter in the rapid-fire round). Detecting rambling from meaning is a next
  step.
- How fast does the judge respond? Questions take about 3 seconds, grading 3 to 4. The
  next question's voice is made while you're still answering the current one.
- What does it cost? "About 25 cents for a full session with all four judges." Worked out
  on Saturday, for a session of 12 questions and 12 spoken answers:
  - Reading the slides once (Gemini 2.5 Flash, 15 images): about 1 cent.
  - Questions (Claude Sonnet 5.5, 4 calls at about half a cent): about 2 cents.
  - Grading (12 calls at about 0.65 cents): about 8 cents.
  - Judge voices (ElevenLabs Flash, about 0.22 credits per character, 12 questions of
    about 130 characters): about 350 credits, roughly 7 cents.
  - Speech-to-text: about 50 credits per minute of audio, measured on Eric's first run
    (135 credits for 2:36, assuming nobody else recorded in that window). A session
    sends about 4 to 5 minutes of audio, so about 250 credits, roughly 5 cents. Typed
    answers send none.
  OpenRouter's real spend for all of Saturday's testing was 5 cents.
- How is this different from InterVU? InterVU asked about you, for a job. ToughCrowd
  reads your slides and a panel asks about your project: four judges, each with their
  own angle, who cut in when you ramble.
