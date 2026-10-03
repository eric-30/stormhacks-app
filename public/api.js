// Every request to the server goes through here, and sends only what the contract in
// CLAUDE.md says. Add ?mock to the page URL to use fake answers instead: no server
// needed and no credits spent.

export const isMock = new URLSearchParams(location.search).has('mock');

export class ApiError extends Error {}

async function post(path, init, as = 'json') {
  let res;
  try {
    res = await fetch(path, { method: 'POST', ...init });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.');
  }
  if (!res.ok) {
    let message = '';
    try {
      message = (await res.json()).error;
    } catch {}
    // A plain file server (or a missing endpoint) answers like this.
    if (!message && [404, 405, 501].includes(res.status)) {
      message = `No server is answering ${path} here. Run "vercel dev", or try the page with fake judges.`;
    }
    throw new ApiError(message || `The server had a problem with ${path} (status ${res.status}).`);
  }
  return as === 'blob' ? res.blob() : res.json();
}

const json = (body) => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const real = {
  // slides: [{text, image}] -> summary string
  slides: (slides) => post('/api/slides', json({ slides })).then((r) => r.summary),
  // -> ["question", "question", "question"]
  questions: (summary, persona) =>
    post('/api/questions', json({ summary, persona })).then((r) => r.questions),
  // -> audio/mpeg Blob
  speak: (text, persona) => post('/api/speak', json({ text, persona }), 'blob'),
  // audio/webm Blob -> {text, durationSeconds, wordsPerMinute, fillers, longPauses}
  transcribe: (audio) =>
    post('/api/transcribe', { headers: { 'Content-Type': 'audio/webm' }, body: audio }),
  // -> {feedback, score, followUp}
  feedback: (summary, question, persona, transcript) =>
    post('/api/feedback', json({ summary, question, persona, transcript })),
};

// ---- Mock mode -------------------------------------------------------------------

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const MOCK_QUESTIONS = {
  business: [
    'Who actually pays for this, and how much?',
    'Who are your competitors, and why would someone pick you over them?',
    'What does it cost you to run one session?',
  ],
  confused: [
    "I don't get it. What does it do, in one sentence?",
    'Why would I need this instead of just practising with a friend?',
    'What happens when I press the big red button?',
  ],
  technical: [
    'What happens if the speech-to-text API is down during a demo?',
    'How do you know the filler-word count is accurate?',
    'How does this scale to a thousand users at once?',
  ],
};

const MOCK_FEEDBACK = [
  'You answered the question, but it took a while to get there. Lead with the answer, then give the reason.',
  'Clear and confident. Mentioning the numbers from your slides made it believable.',
  'You drifted into features instead of answering. The judge asked about cost: say a number.',
  'Good structure: answer, example, done. A bit fast in the middle, so slow down on the key point.',
];

const MOCK_FOLLOW_UPS = [
  'You said it scales. What breaks first?',
  'Okay, but why would a hackathon pay for that?',
  'Can you say that again without the jargon?',
];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

const mock = {
  async slides(slides) {
    await wait(1500);
    return slides
      .map((s, i) => `Slide ${i + 1}: ${s.text.slice(0, 160) || 'Mostly a picture, with little text.'}`)
      .join('\n\n');
  },
  async questions(summary, persona) {
    await wait(900 + Math.random() * 600);
    return MOCK_QUESTIONS[persona];
  },
  async speak() {
    await wait(200);
    return null; // No audio: voice.js falls back to the browser voice.
  },
  async transcribe(audio) {
    await wait(1000);
    const seconds = Math.max(3, Math.round(audio.size / 8000));
    return {
      text: 'So, um, basically our app reads your slides and, like, asks you the questions judges would ask. Uh, and then it tells you how you did.',
      durationSeconds: seconds,
      wordsPerMinute: 120 + Math.round(Math.random() * 70),
      fillers: { um: 1, uh: 1, like: 1 },
      longPauses: Math.round(Math.random() * 3),
    };
  },
  async feedback() {
    await wait(1200);
    return {
      feedback: pick(MOCK_FEEDBACK),
      score: 4 + Math.floor(Math.random() * 6),
      followUp: Math.random() < 0.5 ? pick(MOCK_FOLLOW_UPS) : null,
    };
  },
};

export const api = isMock ? mock : real;
