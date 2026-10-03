# Features

Build in this order. Must-haves first, and within each group the most essential and
least risky first. Don't start a group until the one above it works on the Vercel URL.

Owner: **S** = server (Eric), **P** = page (Luca), **S+P** = both, change the contract first.

## Must have: without these there is no demo

| # | Feature | Owner | Risk | Notes |
| --- | --- | --- | --- | --- |
| 1 | Paste slide text, get 3 questions from the `business` judge | S+P | Low | Hour 1: fake questions, deployed. Then real ones. |
| 2 | Deployed on Vercel, keys in Environment Variables | S | Low | Do in hour 1, not at the end. |
| 3 | The judge speaks the question (ElevenLabs text-to-speech) | S+P | Low | |
| 4 | Type an answer, get feedback, a score and a follow-up | S+P | Low | Keep this forever as the "test without using speech credits" switch. |
| 5 | Answer out loud: record, transcribe, feedback | S+P | Medium | MediaRecorder on the page, audio upload to `/api/transcribe`. Chrome only. |
| 6 | Delivery numbers: filler words, words per minute, long pauses | S | Medium | Counted by our code from word timings. Depends on speech-to-text keeping "um" (see `risks.md`). |

Target: 1 to 6 done by hour 6.

## Should have: what makes it good, and safe to demo

| # | Feature | Owner | Risk | Notes |
| --- | --- | --- | --- | --- |
| 7 | Shared passcode | S+P | Low | Protects our credits on the public link. |
| 8 | `confused` and `technical` judges, each with their own voice | S | Low | Mostly prompts and voice IDs. |
| 9 | Clear scoring guide instead of a vague 1 to 10 | S+P | Low | Answered the question / Used something from your slides / Concise / Confident delivery, each pass or fail. Changes the `/api/feedback` response. |
| 10 | Delivery report card | P | Low | "8 ums, 190 words a minute (aim for 130 to 160), 3 long pauses" next to the feedback. |
| 11 | Make all question audio as soon as the session starts, "the judge is thinking..." animation | P | Low | Hides the waiting at the judging table. |
| 12 | PDF upload, slides read with pictures (`/api/slides`) | S+P | Medium | Size limits, a model that accepts images. Until then, pasted text goes in `summary`. |
| 13 | Fillers in red and pauses shown as "⏸ 3.1s" in the transcript | S+P | Medium | Needs the word timings sent to the page: contract change. |
| 14 | 3-minute pitch timer, then 1 minute of rapid-fire questions | P | Medium | Matches StormHacks judging exactly. |

## Nice to have: only if everything above works

| # | Feature | Owner | Risk | Notes |
| --- | --- | --- | --- | --- |
| 15 | A .tech domain pointed at the app | S | Low | For the MLH .Tech prize. About 15 minutes, Sunday morning. |
| 16 | Before and after: answer the same question twice, see the score go up | P | Low | Good way to end the demo. |
| 17 | Speech-to-text on the whole 3-minute pitch, not only answers | S+P | Medium | Reuses `/api/transcribe`; recordings over 3 minutes hit the size limit. |
| 18 | PowerPoint upload, text only | P | Medium | Only if users keep uploading .pptx; otherwise the page says "export as PDF". |

## Pitch only, not built

- Judges that interrupt you mid-answer.
