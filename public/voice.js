// The judges' voices. Three modes:
//   eleven:  realistic voice from /api/speak (costs ElevenLabs credits)
//   browser: the browser's built-in voice (free, robotic)
//   off:     no sound, the question is only shown
// Each question's audio is made once and kept, so replaying it costs nothing.

import { api } from './api.js';
import { JUDGES } from './judges.js';

const cache = new Map(); // "persona\ntext" -> Promise<object URL | null>
let current = null; // { stop() } for whatever is playing now

function audioUrl(text, persona) {
  const key = `${persona}\n${text}`;
  if (!cache.has(key)) {
    const made = api.speak(text, persona).then((blob) => (blob ? URL.createObjectURL(blob) : null));
    made.catch(() => cache.delete(key)); // let a failed one be tried again
    cache.set(key, made);
  }
  return cache.get(key);
}

// Start making the audio now so it's ready when the question comes up.
export function prefetch(text, persona, mode) {
  if (mode === 'eleven') audioUrl(text, persona).catch(() => {});
}

// Resolves when the judge has finished speaking (or was stopped).
export async function speak(text, persona, mode, onStart = () => {}) {
  stop();
  if (mode === 'off') return;
  if (mode === 'eleven') {
    const url = await audioUrl(text, persona);
    if (url) return playUrl(url, onStart);
  }
  return browserSpeak(text, persona, onStart);
}

export function stop() {
  const playing = current;
  current = null;
  playing?.stop();
}

function playUrl(url, onStart) {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    current = {
      stop: () => {
        audio.pause();
        resolve();
      },
    };
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error('The audio could not be played.'));
    audio.play().then(onStart, reject);
  });
}

function browserSpeak(text, persona, onStart) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve();
    const { pitch, rate, pick } = JUDGES[persona].browserVoice;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = pitch;
    utterance.rate = rate;
    const voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
    if (voices.length) utterance.voice = voices[pick % voices.length];
    utterance.onstart = onStart;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    current = {
      stop: () => {
        speechSynthesis.cancel();
        resolve();
      },
    };
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  });
}

// Chrome loads its voice list late; ask early so it's ready for the first question.
if ('speechSynthesis' in window) speechSynthesis.getVoices();
