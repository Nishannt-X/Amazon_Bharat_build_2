"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PublicAnalysis } from "../lib/photo-analysis";
interface McqOption {
  id: string;
  label: string;
  depthMm?: number | null;
  confidenceBonus: number;
  movingWater?: boolean | null;
  hazard?: string | null;
}

interface QuantitativeQuestion {
  question: string;
  category: string;
  options: McqOption[];
  turnIndex: number;
}

interface Props {
  analysis: PublicAnalysis;
  onResult: (result: PublicAnalysis) => void;
  onClose: () => void;
}
export default function EvidenceContextOverlay({
  analysis,
  onResult,
  onClose,
}: Props) {
  const [result, setResult] = useState(analysis);
  const [question, setQuestion] = useState<string | null>(null);
  const [mcq, setMcq] = useState<QuantitativeQuestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [providers, setProviders] = useState({
    transcribe: false,
    polly: false,
  });
  const [recording, setRecording] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const alive = useRef(true);
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onResultRef = useRef(onResult);
  const speech = useRef<HTMLAudioElement | null>(null);
  const speechUrl = useRef<string | null>(null);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);
  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement as HTMLElement | null;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    const abort = new AbortController();
    fetch(`/api/analysis/${analysis.id}`, {
      signal: abort.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Conversation could not load.");
        if (!abort.signal.aborted) {
          setResult(data.analysis);
          setQuestion(data.question ?? null);
          setMcq(data.mcq ?? null);
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    fetch("/api/analysis", { signal: abort.signal })
      .then((r) => r.json())
      .then((data) => {
        if (!abort.signal.aborted) setProviders(data.providers);
      })
      .catch(() => {});
    return () => {
      alive.current = false;
      abort.abort();
      document.body.style.overflow = old;
      if (recordingTimer.current) clearTimeout(recordingTimer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
      speech.current?.pause();
      if (speechUrl.current) URL.revokeObjectURL(speechUrl.current);
      if (previous?.isConnected) previous.focus();
    };
  }, [analysis.id]);
  async function submit(payload: Record<string, unknown>) {
    if (!result) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch(`/api/analysis/${result.id}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (!alive.current) return;
      setResult(data.analysis);
      setQuestion(data.question);
      setMcq(data.mcq ?? null);
      setAnswer("");
      onResultRef.current(data.analysis);
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "Evidence could not save.");
    } finally {
      if (alive.current) setSending(false);
    }
  }
  async function record() {
    if (recorder.current?.state === "recording") {
      recorder.current.stop();
      return;
    }
    setError("");
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error(
          "Recording is unavailable in this browser. Type your answer.",
        );
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      const mime = ["audio/webm", "audio/ogg", "audio/mp4"].find((m) =>
        MediaRecorder.isTypeSupported(m),
      );
      if (!mime) {
        media.getTracks().forEach((t) => t.stop());
        throw new Error("No supported recording format.");
      }
      const chunks: BlobPart[] = [];
      const rec = new MediaRecorder(media, { mimeType: mime });
      recorder.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = async () => {
        media.getTracks().forEach((t) => t.stop());
        if (recordingTimer.current) clearTimeout(recordingTimer.current);
        if (!alive.current) return;
        setRecording(false);
        setVoiceBusy(true);
        try {
          const response = await fetch("/api/analysis/voice", {
            method: "POST",
            headers: { "Content-Type": mime },
            body: new Blob(chunks, { type: mime }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          for (let i = 0; i < 30 && alive.current; i++) {
            await new Promise((r) => setTimeout(r, 2000));
            if (!alive.current) return;
            const poll = await fetch(
              `/api/analysis/voice?jobId=${encodeURIComponent(data.jobId)}`,
            );
            const transcript = await poll.json();
            if (!poll.ok || transcript.status === "FAILED")
              throw new Error(transcript.error || "Transcription failed.");
            if (transcript.status === "COMPLETED") {
              setAnswer(transcript.text);
              return;
            }
          }
          throw new Error(
            "Transcription took too long. Type your answer or retry.",
          );
        } catch (e) {
          if (alive.current)
            setError(e instanceof Error ? e.message : "Voice unavailable.");
        } finally {
          if (alive.current) setVoiceBusy(false);
        }
      };
      rec.start();
      setRecording(true);
      recordingTimer.current = setTimeout(() => {
        if (rec.state === "recording") rec.stop();
      }, 30000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Microphone access failed.");
    }
  }
  async function listen() {
    if (!question) return;
    setError("");
    try {
      const response = await fetch("/api/analysis/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: question }),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      const url = URL.createObjectURL(await response.blob());
      speech.current?.pause();
      if (speechUrl.current) URL.revokeObjectURL(speechUrl.current);
      if (!alive.current) {
        URL.revokeObjectURL(url);
        return;
      }
      speechUrl.current = url;
      const audio = new Audio(url);
      speech.current = audio;
      audio.onended = () => URL.revokeObjectURL(url);
      audio.onerror = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speech unavailable.");
    }
  }

  return createPortal(
    <div className="ff-themed ff-analysis-backdrop ff-context-backdrop">
      <div
        className="ff-analysis-dialog ff-context-dialog"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="context-title"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !sending) {
            e.preventDefault();
            onClose();
          }
          if (e.key === "Tab") {
            const items = dialog.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),a[href]",
            );
            if (!items?.length) return;
            const first = items[0],
              last = items[items.length - 1];
            if (
              e.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === dialog.current)
            ) {
              e.preventDefault();
              last.focus();
            } else if (
              !e.shiftKey &&
              (document.activeElement === last ||
                document.activeElement === dialog.current)
            ) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <header>
          <div>
            <span className="ff-analysis-eyebrow">Optional observations</span>
            <h2 id="context-title">Help in adding context</h2>
          </div>
          <button
            disabled={sending}
            onClick={onClose}
            aria-label="Close context chat"
          >
            ×
          </button>
        </header>
        <div className="ff-context-content">
          <section
            className="ff-analysis-chat ff-context-chat"
            aria-label="Evidence follow-up chatbot"
          >
            <h3>Help fill the gaps</h3>
            <p>
              Add observations to improve context for your suggestion. They do
              not prove a safe crossing or verified model accuracy.
            </p>
            <p aria-live="polite">
              <strong>{result.demoConfidence ? `Confidence: ${result.demoConfidence.value}%` : `Combined evidence index: ${result.contextConfidence ?? result.confidence} / 100`}</strong>
              {!result.demoConfidence && <span> · Photo index {result.photoConfidence ?? result.confidence}. Experimental evidence quality, not a probability.</span>}
            </p>
            {result.contextEvidence && <small>{result.contextEvidence.reasons.join(". ")} Context contributes at most 10 points and cannot promote publication.</small>}
            {result.answers.map((item, i) => (
              <div className="ff-analysis-turn" key={i}>
                <p>{item.question}</p>
                <strong>{item.answer}</strong>
              </div>
            ))}
            {loading ? (
              <p role="status">Opening conversation…</p>
            ) : question ? (
              <>
                <p className="ff-analysis-question">{question}</p>
                <div className="ff-analysis-voice">
                  <button
                    disabled={!providers.polly}
                    onClick={() => void listen()}
                  >
                    Listen to question
                  </button>
                  <button
                    disabled={!providers.transcribe || voiceBusy || sending}
                    onClick={() => void record()}
                  >
                    {recording
                      ? "Stop recording"
                      : voiceBusy
                        ? "Transcribing…"
                        : "Speak answer"}
                  </button>
                </div>

                {mcq && mcq.options && mcq.options.length > 0 && (
                  <div className="ff-mcq-container">
                    <span className="ff-mcq-prompt-hint">Tap a quantitative estimate below:</span>
                    <div className="ff-mcq-options-grid">
                      {mcq.options.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          className="ff-mcq-option-pill"
                          disabled={sending || recording}
                          onClick={() => void submit({ answer: opt.label, option: opt })}
                        >
                          <span className="ff-mcq-pill-bullet" />
                          <span className="ff-mcq-pill-text">{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="ff-observation-box">
                  <label htmlFor="observation-input" className="ff-observation-label">
                    Or type specific observation (press Enter to send):
                  </label>
                  <div className="ff-observation-input-wrap">
                    <textarea
                      id="observation-input"
                      value={answer}
                      maxLength={2000}
                      rows={2}
                      onChange={(e) => setAnswer(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          if (answer.trim() && !sending && !recording) {
                            void submit({ answer });
                          }
                        }
                      }}
                      placeholder="Type observation and press Enter to send…"
                    />
                    <button
                      type="button"
                      className="ff-observation-send-btn"
                      disabled={!answer.trim() || sending || recording}
                      onClick={() => void submit({ answer })}
                      aria-label="Send observation"
                      title="Send observation (Enter)"
                    >
                      {sending ? (
                        <span className="ff-send-spinner" aria-hidden="true" />
                      ) : (
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <line x1="22" y1="2" x2="11" y2="13" />
                          <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                <small>
                  Voice requires Amazon Transcribe and Polly setup. Recordings
                  stop after 30 seconds. Review the transcript before sending.
                </small>
              </>
            ) : (
              <p>
                {error
                  ? "Conversation unavailable. Close and reopen to retry."
                  : "Observations saved. Awaiting independent evidence before global publication."}
              </p>
            )}
          </section>

          {error && (
            <p role="alert" className="ff-context-error">
              {error}
            </p>
          )}
        </div>
        <footer>
          <p>
            Context stays with this photo’s report. Photo-only measurements
            remain separate.
          </p>
          <button disabled={sending} onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
