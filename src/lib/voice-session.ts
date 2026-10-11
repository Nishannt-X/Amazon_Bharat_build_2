/** Session cancellation prevents late playback/transcripts after switching back to text. */
export class VoiceSession {
  private generation = 0;
  private controller = new AbortController();
  active = false;
  start() { this.stop(); this.active = true; return this.current(); }
  stop() { this.controller.abort(); this.generation++; this.controller = new AbortController(); this.active = false; }
  current() { return {generation:this.generation,signal:this.controller.signal}; }
  isCurrent(token: ReturnType<VoiceSession["current"]>) { return this.active && token.generation === this.generation && !token.signal.aborted; }
}
