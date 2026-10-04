# Decisions

Why things are the way they are, so we don't argue them again.

`CLAUDE.md` and `docs/` were written on October 2, before hacking started, as planning.
The rules allow planning in advance. No code or design assets were made before
12:00 PM on October 3.

## The idea

Picked this idea (first called MockJudge) over:

- **Outfit picker that spots dirty clothes:** a camera can't see sweat or smell, so the
  main feature doesn't work, and scanning 50 items is a bad demo.
- **Concussion detector:** medical claims invite "how do you know it's accurate?" Better
  version would be a baseline tracker (test when healthy, compare after a hit), but it
  doesn't naturally use AI or a sponsor prize. Avoid flashing lights: seizure risk.
- **Study competition:** crowded, and "how do you know they're studying?" Better version:
  AI quiz from your notes, compete on scores. About equal, not better.
- **Basketball with machine learning:** too hard to track shots reliably, needs a hoop.
- **Screen-time competition:** a web app can't read phone screen time.
- **Art theft finder:** needs a reverse image search API, and without a real stolen-art
  story or test data on the team, it's generic and hard to demo.

Why this idea: we are the users, judges are the target audience, it can be demoed live
on the judges, and it uses ElevenLabs for real (ElevenLabs prize).

## People

- **Eric owns the server and presents.** The server is the harder part to explain, and
  judges' "how does it work?" questions are almost all about it.
- **Luca owns the page.**
- **Art teammate owns the design, the app name and the pitch slides.** The app was called
  "MockJudge" as a placeholder; renamed to **ToughCrowd** on October 3. No design assets
  before noon Saturday.

## Tech

- **ElevenLabs for both speaking and listening.** Uses Eric's free credits. Filler words,
  pace and pauses are counted by our code from the word timings, so they're reliable and
  explainable.
- **Several OpenRouter models, pick one.** The model is a setting, not code.
- **Vercel for deployment.** Gives a live HTTPS link judges can open. That's why the
  server is one function per request in `api/` instead of one `server.js`.
- **Slides: PDF only, read by a model that can see pictures.** Plain text extraction
  misses screenshots, charts and text inside images. Reading .pptx in the browser gets
  text only, and Vercel can't run conversion tools. Every slide tool exports PDF. pdf.js
  draws each slide as a JPEG in the browser, one `/api/slides` call turns them into a
  summary, and every later request reuses that summary, so it stays fast and cheap.

## Logo

- **Two judges under one question.** `public/img/mark.svg` (and `favicon.svg`, the same
  mark on a dark rounded square). Two cream judge silhouettes seen from behind, each
  with two arms, under an amber speech bubble with a question mark. Says "tough crowd"
  in three shapes and reads at 16px. Replaced the amber dot, which said nothing.
- **Why it's plain.** Glasses, lapels and suits were tried and dropped: they turn into
  smudges at favicon size, and every added detail needed cleanup. Personality can go
  in a larger illustration for the landing page or Devpost, not in the mark.
- **Why it's an SVG traced from an AI render.** Luca liked a specific Higgsfield (Z
  Image) render best. The SVG traces that render's shapes exactly so it stays sharp at
  any size and matches the page's flat style. The render and the rejected variants are
  kept outside the repo.
