# Risks

Worst first. Each one has what we do about it and when we check.

| # | Risk | What we do | Check when |
| --- | --- | --- | --- |
| 1 | ElevenLabs free credits run out before or during judging | Test with typed answers (feature 4) and short clips. Reuse question audio instead of making it again. | Balance Saturday night and Sunday morning. |
| 2 | Speech-to-text drops "um" and "uh", so filler feedback doesn't work | Find out before building feature 6. If it drops them, show pace and pauses only, or look for a setting that keeps them. | Before Saturday, on the ElevenLabs site. |
| 3 | Anyone with the public Vercel link spends our credits | Shared passcode (feature 7). Only share the link at judging time. | Before the link goes anywhere public. |
| 4 | Too much to build for a beginner team | Follow `features.md` in order. Model comparison at most 30 minutes. No new features after 10 AM Sunday. | Every hour: are we on track for 1 to 6 by hour 6? |
| 5 | Long silences at the judging table while it speaks, transcribes and grades | Make question audio up front, thinking animation (feature 11). | When feature 5 works, time one full round. |
| 6 | Vercel request size and time limits | Slides capped at 15 and under 4 MB, recordings at about 3 minutes. | Checked Oct 3: Hobby plan with Fluid compute, so each function may run 300 s (the default and the maximum) and a request body may be 4.5 MB. No `maxDuration` needed. |
| 7 | Slides that are mostly pictures give bad questions | `/api/slides` reads the images (feature 12). | Test with a deck that has almost no text. |
| 8 | Recording doesn't work on a judge's browser | Chrome only; demo on our own laptop. | Before judging, on the laptop we'll demo on. |
| 9 | Wi-Fi at the venue is slow or drops | Have the demo video ready as a backup. Phone hotspot. | Sunday morning. |
