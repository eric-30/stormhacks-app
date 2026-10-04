// Every request to the server goes through here, and sends only what the contract in
// CLAUDE.md says. Add ?mock to the page URL to use fake answers instead: no server
// needed and no credits spent.

export const isMock = new URLSearchParams(location.search).has('mock');

export class ApiError extends Error {}

// ---- Passcode: sent with every request, asked for when the server says 401 ----------

const PASSCODE_KEY = 'toughcrowd.passcode';
let passcode = '';
try {
  passcode = localStorage.getItem(PASSCODE_KEY) || '';
} catch {}

let askForPasscode = null; // set by the page: (wasWrong) => Promise<code or null>
let asking = null; // the prompt that's open now, shared by requests that fail together

export function onPasscodeNeeded(ask) {
  askForPasscode = ask;
}

function savePasscode(code) {
  passcode = code;
  try {
    localStorage.setItem(PASSCODE_KEY, code);
  } catch {}
}

async function post(path, init, as = 'json') {
  let res;
  for (;;) {
    const sent = passcode;
    try {
      res = await fetch(path, { method: 'POST', ...init, headers: { ...init.headers, 'X-Passcode': sent } });
    } catch {
      throw new ApiError('Could not reach the server. Check your connection and try again.');
    }
    if (res.status !== 401 || !askForPasscode) break;
    if (passcode !== sent) continue; // another request already got a new code
    asking ??= askForPasscode(Boolean(sent)).finally(() => (asking = null));
    const code = await asking;
    if (!code) throw new ApiError('The judges need the passcode. Ask your team for it.');
    if (code !== passcode) savePasscode(code);
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

// judge: {persona, custom}, where custom is {name, description} for a judge the person
// made, else null. scene: {difficulty: 1-5, setting: "hackathon" | "class" | ... | "custom",
// settingDescription: what the person wrote, for "custom"}.
const judgeFields = (judge, scene) => ({
  persona: judge.persona,
  ...(judge.custom ? { custom: judge.custom } : {}),
  difficulty: scene.difficulty,
  setting: scene.setting,
  ...(scene.setting === 'custom' ? { settingDescription: scene.settingDescription } : {}),
});

const real = {
  // slides: [{text, image}] -> summary string
  slides: (slides) => post('/api/slides', json({ slides })).then((r) => r.summary),
  // -> ["question", "question", "question"]
  questions: (summary, judge, scene) =>
    post('/api/questions', json({ summary, ...judgeFields(judge, scene) })).then((r) => r.questions),
  // -> audio/mpeg Blob
  speak: (text, persona) => post('/api/speak', json({ text, persona }), 'blob'),
  // audio/webm Blob -> {text, durationSeconds, wordsPerMinute, fillers, longPauses, words}
  transcribe: (audio) =>
    post('/api/transcribe', { headers: { 'Content-Type': 'audio/webm' }, body: audio }),
  // talk: {conversation: [{question, answer}], followUpsLeft} in a back-and-forth, else null.
  // -> {feedback, score, followUp, checks, reply?, satisfied?}
  feedback: (summary, question, judge, transcript, scene, talk = null) =>
    post('/api/feedback', json({ summary, question, transcript, ...judgeFields(judge, scene), ...(talk ?? {}) })),
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
  teacher: [
    "What did you learn building this that you didn't know on Friday?",
    'Walk me through what happens, step by step, when someone presses record.',
    'Why did you pick this approach over the obvious one?',
  ],
};

const customQuestions = ({ name }) => [
  `${name} here. What problem does this really solve?`,
  'What would you do differently if you started again?',
  "What's the weakest part of what you've built?",
];

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

// What a judge says out loud, in mock mode: a reaction before a follow-up, or a closing
// verdict when satisfied.
const MOCK_REACTIONS = ['Okay, fair.', 'Hmm. I hear you, but', 'Right. And', 'Interesting.'];
const MOCK_VERDICTS = [
  "Alright, that's what I needed. Good save on the numbers, but you took a while to get there.",
  'Okay, I buy it. Lead with that next time.',
  "Fair enough. That's a much clearer answer than your first one.",
];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

const mock = {
  async slides(slides) {
    await wait(1500);
    return slides
      .map((s, i) => `Slide ${i + 1}: ${s.text.slice(0, 160) || 'Mostly a picture, with little text.'}`)
      .join('\n\n');
  },
  async questions(summary, judge) {
    await wait(900 + Math.random() * 600);
    return judge.custom ? customQuestions(judge.custom) : MOCK_QUESTIONS[judge.persona];
  },
  async speak() {
    await wait(200);
    return null; // No audio: voice.js falls back to the browser voice.
  },
  async transcribe() {
    await wait(1000);
    const text =
      'So, um, basically our app reads your slides and, like, asks you the questions judges would ask. Uh, and then it tells you how you did.';
    // Fake word timings: a word every 0.35s, with one long pause after "ask."
    let t = 0.3;
    const words = text.split(' ').map((word) => {
      if (word === 'Uh,') t += 2.6;
      const w = { text: word, start: +t.toFixed(2), end: +(t + 0.28).toFixed(2) };
      t += 0.35;
      return w;
    });
    const seconds = words.at(-1).end;
    return {
      text,
      durationSeconds: +seconds.toFixed(1),
      wordsPerMinute: Math.round(words.length / (seconds / 60)),
      fillers: { um: 1, uh: 1, like: 1 },
      longPauses: 1,
      words,
    };
  },
  async feedback(summary, question, judge, transcript, scene, talk) {
    await wait(1200);
    const coin = () => Math.random() < 0.65;
    // Harder judges grade a little lower.
    const score = 4 + Math.floor(Math.random() * 6) - (scene.difficulty - 3);
    // In a back-and-forth, the judge gets more likely to be satisfied with each turn.
    const turns = talk?.conversation.length ?? 0;
    const wantsMore = talk ? talk.followUpsLeft > 0 && Math.random() < [0.8, 0.55, 0.35][turns] : Math.random() < 0.5;
    const followUp = wantsMore ? pick(MOCK_FOLLOW_UPS) : null;
    return {
      ...(talk ? { reply: followUp ? pick(MOCK_REACTIONS) : pick(MOCK_VERDICTS), satisfied: !followUp } : {}),
      feedback: pick(MOCK_FEEDBACK),
      score: Math.min(10, Math.max(1, score)),
      followUp,
      checks: {
        answered: coin(),
        usedSlides: coin(),
        concise: coin(),
        confident: transcript.durationSeconds ? coin() : true,
      },
    };
  },
};

export const api = isMock ? mock : real;
