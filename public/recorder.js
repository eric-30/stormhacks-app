// Records an answer from the microphone as audio/webm.

export const MAX_SECONDS = 170; // stays under the 4 MB limit for /api/transcribe
export const MAX_BYTES = 4 * 1024 * 1024;

// Ask for the microphone once at the start, so the permission prompt doesn't
// interrupt the first answer.
export async function warmUpMic() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((t) => t.stop());
}

export class Recorder {
  // onTick(seconds), onLevel(0..1), onLimit() when `limit` seconds are reached.
  // A lower bitsPerSecond fits a longer recording under 4 MB (24000 is about 17 minutes).
  async start({ onTick, onLevel, onLimit, limit = MAX_SECONDS, bitsPerSecond = 64000 }) {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';
    const chunks = [];
    this.recorder = new MediaRecorder(this.stream, { mimeType, audioBitsPerSecond: bitsPerSecond });
    this.recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    this.stopped = new Promise((resolve) => {
      this.recorder.onstop = () => resolve(new Blob(chunks, { type: 'audio/webm' }));
    });
    this.recorder.start(1000);
    this.startedAt = performance.now();
    this.pausedFor = 0; // ms spent paused, left out of elapsed()
    this.pausedAt = null;

    this.context = new AudioContext();
    const analyser = this.context.createAnalyser();
    analyser.fftSize = 512;
    this.context.createMediaStreamSource(this.stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);

    this.loop = () => {
      if (this.recorder?.state !== 'recording') return;
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const s of samples) sum += ((s - 128) / 128) ** 2;
      onLevel?.(Math.min(1, Math.sqrt(sum / samples.length) * 5));
      const seconds = this.elapsed();
      onTick?.(seconds);
      if (seconds >= limit) return onLimit?.();
      this.frame = requestAnimationFrame(this.loop);
    };
    this.loop();
  }

  // True from start() until stop(), paused or not.
  get recording() {
    return Boolean(this.recorder) && this.recorder.state !== 'inactive';
  }

  get paused() {
    return this.recorder?.state === 'paused';
  }

  // Nothing is recorded while paused, so the audio has no gap where the pause was.
  pause() {
    if (this.recorder?.state !== 'recording') return;
    this.recorder.pause();
    this.pausedAt = performance.now();
    cancelAnimationFrame(this.frame);
  }

  resume() {
    if (!this.paused) return;
    this.pausedFor += performance.now() - this.pausedAt;
    this.pausedAt = null;
    this.recorder.resume();
    this.loop();
  }

  // Seconds recorded so far, not counting pauses.
  elapsed() {
    const now = this.pausedAt ?? performance.now();
    return (now - this.startedAt - this.pausedFor) / 1000;
  }

  // Resolves to { blob, seconds }.
  async stop() {
    if (!this.recorder) return null;
    const seconds = this.elapsed();
    cancelAnimationFrame(this.frame);
    if (this.recorder.state !== 'inactive') this.recorder.stop();
    const blob = await this.stopped;
    this.stream.getTracks().forEach((t) => t.stop());
    this.context.close();
    this.recorder = null;
    return { blob, seconds };
  }
}
