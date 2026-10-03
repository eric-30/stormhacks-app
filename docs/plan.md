# Build plan

Hacking runs from 12:00 PM Saturday, October 3 to 12:00 PM Sunday, October 4.
Hour 1 starts at noon.

## Setup, first thing at noon

1. `git init` in this folder, make the GitHub repo, Luca clones it.
2. Copy `.gitignore` from `~/work/scratch-repo-luca/hackathon-starter/` before anything
   else, then make `.env`. Check `git status` doesn't list `.env`.
3. Connect the repo to Vercel and add the keys in its Environment Variables.

## Order

Follow `features.md` from the top.

1. **End to end by hour 1, deployed:** the page sends pasted text to `/api/questions`,
   the server answers with fake questions, and it works on the Vercel URL, not just
   locally. Commit and push.
2. **Must-haves (features 1 to 6) by hour 6.**
3. **Then should-haves, then nice-to-haves**, in order.

Until feature 12 (PDF upload) is done, the page sends pasted text as `summary`.

## Model comparison

At most 30 minutes, around hour 3. Same slides, same recorded answer, three or four
models. Write down what each one gave back in `docs/models.md`, pick one, set
`OPENROUTER_MODEL` on Vercel, and stop.

## Credits

- Check the ElevenLabs balance Saturday night and Sunday morning.
- Test feedback with a saved transcript instead of recording every time.
- Keep the judge audio for a question once it's made, instead of making it again.

## The last 2 hours (10 AM to noon Sunday)

- No new features. Fix only what breaks the demo.
- README: what it does, the box drawing, how to run it.
- Record the demo video, up to 3 minutes.
- Devpost final submission before noon, not at noon.
- Practise the pitch: see `pitch.md`.
