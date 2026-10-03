// The judges. `persona` is always one of these keys (see CLAUDE.md).
// `interrupt` is what the judge says when cutting off an answer that runs too long.
export const JUDGES = {
  business: {
    name: 'The Investor',
    role: 'Sponsor or investor',
    sample: 'Who pays for this? Who are your competitors?',
    img: 'img/judge-business.jpg',
    interrupt: "Sorry, let me stop you there. What's the one-sentence answer?",
    browserVoice: { pitch: 0.9, rate: 1.05, pick: 0 },
  },
  confused: {
    name: 'The Grandma',
    role: 'Not technical at all',
    sample: "I don't get it. Explain it like I'm your grandma.",
    img: 'img/judge-confused.jpg',
    interrupt: "Hold on, you've lost me. Can you say that in plain words?",
    browserVoice: { pitch: 1.25, rate: 0.92, pick: 1 },
  },
  technical: {
    name: 'The Engineer',
    role: 'Skeptical engineer',
    sample: 'How does this scale? What if the API is down?',
    img: 'img/judge-technical.jpg',
    interrupt: 'Let me jump in. Skip the background. What actually happens?',
    browserVoice: { pitch: 0.8, rate: 1.1, pick: 2 },
  },
  teacher: {
    name: 'The Teacher',
    role: 'Teacher or professor',
    sample: 'What did you learn building this? Walk me through it, step by step.',
    img: 'img/judge-teacher.jpg',
    interrupt: "Let me pause you there. What's the main point you want me to take away?",
    browserVoice: { pitch: 1.0, rate: 0.95, pick: 3 },
  },
};

export const PERSONAS = Object.keys(JUDGES);
