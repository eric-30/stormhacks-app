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

// A judge you make yourself: the server sees persona "custom" plus a name and a
// description, and the judge speaks with the voice of the built-in judge in `voice`.
export const CUSTOM_IMG = 'img/judge-custom.jpg';

// What you're practising for. The key is the `setting` the server is told; the minutes
// are the defaults for the full run-through, and can be changed.
export const OCCASIONS = {
  hackathon: { label: 'Hackathon judging', pitch: 3, qa: 1 },
  class: { label: 'Class presentation', pitch: 5, qa: 3 },
  defense: { label: 'Thesis or capstone defense', pitch: 10, qa: 10 },
  'demo-day': { label: 'Startup demo day', pitch: 2, qa: 2 },
  elevator: { label: 'Elevator pitch', pitch: 1, qa: 1 },
  custom: { label: 'Something else', pitch: 5, qa: 3 }, // described by the person
};

// Difficulty 1 to 5. Harder judges ask sharper questions, grade more strictly and
// cut in sooner.
export const DIFFICULTY = {
  1: { name: 'Friendly', blurb: 'Encouraging questions and generous grading. Good for a first run.' },
  2: { name: 'Supportive', blurb: 'Fair questions, and the benefit of the doubt.' },
  3: { name: 'Realistic', blurb: 'Like a real panel: fair, but they notice the gaps.' },
  4: { name: 'Tough', blurb: 'Pointed questions about your weakest spots, and stricter grading.' },
  5: { name: 'Brutal', blurb: 'Skeptical from the start. They poke every hole and cut in fast.' },
};
