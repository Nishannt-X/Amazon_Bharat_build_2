"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { VoiceSession } from "../lib/voice-session";
import { contextQuestion } from "../lib/context-questions";
import type { VoiceLanguage } from "../lib/voice-language";
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
  const [language, setLanguage] = useState<VoiceLanguage>("en-IN");
  const hindi = language === "hi-IN";
  const [voiceMode, setVoiceMode] = useState(false);
  const voiceSession = useRef(new VoiceSession());
  const speechRequest = useRef<AbortController | null>(null);
  const speechSequence = useRef(0);
  const [speechBusy, setSpeechBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
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
    deepgram: false,
  });
  const [micPending, setMicPending] = useState(false);
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
  const playQuestion = useCallback(async (text: string) => {
    const token = voiceSession.current.current();
    const sequence = ++speechSequence.current;
    if (!text || !(voiceSession.current.isCurrent(token) && sequence === speechSequence.current)) return;
    speechRequest.current?.abort();
    const abort = new AbortController();
    speechRequest.current = abort;
    setSpeechBusy(true);
    setError("");
    try {
      const response = await fetch("/api/analysis/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language }),
        signal: AbortSignal.any([token.signal,abort.signal,AbortSignal.timeout(20000)]),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      const url = URL.createObjectURL(await response.blob());
      speech.current?.pause();
      if (speechUrl.current) URL.revokeObjectURL(speechUrl.current);
      if (!alive.current || !(voiceSession.current.isCurrent(token) && sequence === speechSequence.current)) {
        URL.revokeObjectURL(url);
        return;
      }
      speechUrl.current = url;
      const audio = new Audio(url);
      speech.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); if (alive.current && (voiceSession.current.isCurrent(token) && sequence === speechSequence.current)) setSpeaking(false); };
      audio.onerror = () => { URL.revokeObjectURL(url); if (alive.current && (voiceSession.current.isCurrent(token) && sequence === speechSequence.current)) { setSpeaking(false); setError(hindi ? "आवाज़ चल नहीं सकी। फिर कोशिश करें।" : "Audio playback failed. Try again."); } };
      await audio.play();
      if (alive.current && (voiceSession.current.isCurrent(token) && sequence === speechSequence.current)) setSpeaking(true);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      if (alive.current && (voiceSession.current.isCurrent(token) && sequence === speechSequence.current)) setError(e instanceof Error ? e.message : "Speech unavailable.");
    } finally { if (alive.current && (voiceSession.current.isCurrent(token) && sequence === speechSequence.current)) setSpeechBusy(false); }
  }, [language, hindi]);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);
  useEffect(() => {
    alive.current = true;
    const session = voiceSession.current;
    const previous = document.activeElement as HTMLElement | null;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    const abort = new AbortController();
    fetch(`/api/analysis/${analysis.id}?language=${language}`, {
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
          if (voiceSession.current.active && data.question) void playQuestion(data.question);
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
      session.stop();
      speechRequest.current?.abort();
      if (recorder.current) recorder.current.onstop = null;
      abort.abort();
      document.body.style.overflow = old;
      if (recordingTimer.current) clearTimeout(recordingTimer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
      speech.current?.pause();
      if (speechUrl.current) URL.revokeObjectURL(speechUrl.current);
      if (previous?.isConnected) previous.focus();
    };
  }, [analysis.id, language, playQuestion]);
  async function submit(payload: Record<string, unknown>) {
    if (!result) return;
    speechRequest.current?.abort();
    setSpeechBusy(false);
    speech.current?.pause();
    setSpeaking(false);
    setSending(true);
    setError("");
    try {
      const response = await fetch(`/api/analysis/${result.id}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({...payload,language}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (!alive.current) return;
      setResult(data.analysis);
      setQuestion(data.question);
      setMcq(data.mcq ?? null);
      setAnswer("");
      onResultRef.current(data.analysis);
      if (voiceSession.current.active && data.question) void playQuestion(data.question);
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "Evidence could not save.");
    } finally {
      if (alive.current) setSending(false);
    }
  }
  function stopVoice() {
    voiceSession.current.stop();
    speechRequest.current?.abort();
    speech.current?.pause();
    if (speechUrl.current) URL.revokeObjectURL(speechUrl.current);
    if (recordingTimer.current) clearTimeout(recordingTimer.current);
    if (recorder.current) { recorder.current.onstop = null; if (recorder.current.state === "recording") recorder.current.stop(); }
    stream.current?.getTracks().forEach(track=>track.stop());
    setVoiceMode(false);setMicPending(false);setRecording(false);setVoiceBusy(false);setSpeaking(false);setSpeechBusy(false);
  }
  async function record() {
    if (!voiceSession.current.active) return;
    const token = voiceSession.current.current();
    if (recorder.current?.state === "recording") {
      recorder.current.stop();
      return;
    }
    setError("");
    setMicPending(true);
    try {
      speechRequest.current?.abort();
      speech.current?.pause();
      setSpeaking(false);
      setSpeechBusy(false);
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error(
          "Recording is unavailable in this browser. Type your answer.",
        );
      const media = await navigator.mediaDevices.getUserMedia({ audio: {echoCancellation:true,noiseSuppression:true} });
      if (!alive.current || !voiceSession.current.isCurrent(token)) {
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
        if (!alive.current || !voiceSession.current.isCurrent(token)) return;
        setRecording(false);
        setVoiceBusy(true);
        try {
          const response = await fetch(`/api/analysis/voice?language=${language}`, {
            method: "POST",
            headers: { "Content-Type": mime },
            body: new Blob(chunks, { type: mime }),
            signal: AbortSignal.any([token.signal,AbortSignal.timeout(25000)]),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          if (!voiceSession.current.isCurrent(token)) return;
          if (data.status === "COMPLETED") { setAnswer(data.text); return; }
          for (let i = 0; i < 60 && alive.current && voiceSession.current.isCurrent(token); i++) {
            await new Promise((r) => setTimeout(r, 2000));
            if (!alive.current || !voiceSession.current.isCurrent(token)) return;
            const poll = await fetch(
              `/api/analysis/voice?jobId=${encodeURIComponent(data.jobId)}`,
              {signal:AbortSignal.any([token.signal,AbortSignal.timeout(20000)])},
            );
            const transcript = await poll.json();
            if (!poll.ok || transcript.status === "FAILED")
              throw new Error(transcript.error || "Transcription failed.");
            if (transcript.status === "COMPLETED") {
              if (!transcript.text?.trim()) throw new Error(hindi ? "आवाज़ स्पष्ट नहीं मिली। फिर रिकॉर्ड करें या उत्तर लिखें।" : "No clear speech was found. Record again or type your answer.");
              setAnswer(transcript.text);
              return;
            }
          }
          throw new Error(
            "Transcription took too long. Type your answer or retry.",
          );
        } catch (e) {
          if (alive.current && voiceSession.current.isCurrent(token))
            setError(e instanceof Error ? e.message : "Voice unavailable.");
        } finally {
          if (alive.current && voiceSession.current.isCurrent(token)) setVoiceBusy(false);
        }
      };
      rec.start();
      setRecording(true);
      recordingTimer.current = setTimeout(() => {
        if (rec.state === "recording") rec.stop();
      }, 30000);
    } catch (e) {
      if (voiceSession.current.isCurrent(token)) setError(e instanceof Error ? e.message : "Microphone access failed.");
    } finally { if(voiceSession.current.isCurrent(token))setMicPending(false); }
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
              "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
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
            <span className="ff-analysis-eyebrow">{hindi ? "वैकल्पिक जानकारी" : "Optional observations"}</span>
            <h2 id="context-title">{hindi ? "अतिरिक्त जानकारी जोड़ें" : "Add context"}</h2>
          </div>
          <button
            disabled={sending}
            onClick={onClose}
            aria-label="Close context chat"
          >
            ×
          </button>
        </header>
        <div className="ff-context-content" lang={hindi ? "hi" : "en"}>
          <div className="ff-context-toolbar">
          <label className="ff-voice-language" htmlFor="context-voice-language">
            {hindi ? "भाषा" : "Language"}
            <select id="context-voice-language" value={language} disabled={recording || voiceBusy || sending || speechBusy} onChange={event=>{stopVoice();setLoading(true);setLanguage(event.target.value as VoiceLanguage);}}>
              <option value="en-IN">English</option>
              <option value="hi-IN">हिन्दी</option>
            </select>
          </label>
          <span className="ff-context-confidence" aria-live="polite">{hindi ? "विश्वास" : "Confidence"} {result.contextConfidence ?? result.confidence}%</span>
          </div>
          <section
            className="ff-analysis-chat ff-context-chat"
            aria-label="Evidence follow-up chatbot"
          >
            {loading ? (
              <p role="status">{hindi ? "बातचीत खुल रही है…" : "Opening conversation…"}</p>
            ) : question ? (
              <>
                <div className="ff-context-step">{hindi ? `सवाल ${Math.min(result.answers.length+1,4)} / 4` : `Question ${Math.min(result.answers.length+1,4)} of 4`}</div>
                <p className="ff-analysis-question">{question}</p>


                {mcq && mcq.options && mcq.options.length > 0 && (
                  <div className="ff-mcq-container">
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
                    {hindi ? "आपका जवाब" : "Your reply"}
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
                          if (answer.trim() && !sending && !recording && !voiceBusy) {
                            void submit({ answer });
                          }
                        }
                      }}
                      placeholder={hindi ? "जानकारी लिखें और Enter दबाएं…" : "Type your answer…"}
                    />
                    <button
                      type="button"
                      className="ff-observation-send-btn"
                      disabled={!answer.trim() || sending || recording || voiceBusy}
                      onClick={() => void submit({ answer })}
                      aria-label={hindi ? "जानकारी भेजें" : "Send observation"}
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
                <div className="ff-analysis-voice">
                  {!voiceMode ? (
                    <button disabled={!providers.polly || sending} onClick={()=>{voiceSession.current.start();setVoiceMode(true);if(question)void playQuestion(question);}}>
                      {hindi ? "आवाज़ शुरू करें" : "Start voice"}
                    </button>
                  ) : (
                    <>
                      <button disabled={speechBusy || recording || voiceBusy} onClick={()=>{if(speaking){speech.current?.pause();setSpeaking(false);}else if(question)void playQuestion(question);}}>
                        {speechBusy ? (hindi ? "आवाज़ तैयार हो रही है…" : "Preparing audio…") : speaking ? (hindi ? "सवाल की आवाज़ रोकें" : "Pause question") : (hindi ? "सवाल फिर सुनें" : "Listen again")}
                      </button>
                      <button disabled={!providers.deepgram || voiceBusy || sending || micPending} onClick={()=>void record()}>
                        {recording ? (hindi ? "उत्तर की रिकॉर्डिंग पूरी करें" : "Finish voice reply") : voiceBusy ? (hindi ? "आवाज़ से लिख रहे हैं…" : "Transcribing…") : (hindi ? "बोलकर उत्तर दें" : "Reply by voice")}
                      </button>
                      <button onClick={stopVoice}>{hindi ? "आवाज़ बंद करें" : "Stop voice"}</button>
                    </>
                  )}
                </div>
                {voiceMode && <p role="status">{providers.deepgram ? (hindi ? "आवाज़ चालू है। नीचे लिखकर भी जवाब दे सकते हैं।" : "Voice on · Text replies also work.") : (hindi ? "सवाल सुन सकते हैं। बोलकर जवाब देने के लिए Deepgram की अभी जरूरत है; नीचे लिखकर जवाब दें।" : "Voice replies are not ready yet. Type your answer below.")}</p>}
                <small className="ff-context-helper">
                  {hindi ? "रिकॉर्डिंग 30 सेकंड बाद रुकती है। भेजने से पहले लिखे गए उत्तर को जांचें। चुनी हुई भाषा में स्पष्ट बोलें।" : "Review voice replies before sending · 30-second recording limit."}
                </small>
              </>
            ) : (
              <p>
                {error
                  ? "Conversation unavailable. Close and reopen to retry."
                  : hindi ? "जानकारी सहेज ली गई है। सार्वजनिक नक्शे के लिए स्वतंत्र प्रमाण की प्रतीक्षा है।" : "Observations saved. Awaiting independent evidence before global publication."}
              </p>
            )}
            <details className="ff-context-details">
              <summary>{hindi ? "जानकारी और पिछले जवाब" : "Details & previous answers"}</summary>
              {result.answers.length > 0 && <button disabled={sending || recording || voiceBusy} onClick={()=>void submit({reassess:true})}>{sending ? (hindi ? "जांच रहे हैं…" : "Re-evaluating…") : (hindi ? "जवाब फिर जांचें" : "Re-evaluate answers")}</button>}
            <p>
              {hindi ? "आपकी जानकारी से सुझाव बेहतर हो सकता है। इससे सुरक्षित रास्ता या मॉडल की सटीकता साबित नहीं होती।" : "Add observations to improve context for your suggestion. They do not prove a safe crossing or verified model accuracy."}
            </p>
            <p>
              <strong>Confidence: {result.contextConfidence ?? result.confidence}%</strong>
              <span> · Evidence-quality score, not a probability of accuracy.</span>
            </p>
            {result.answers.map((item, i) => (
              <div className="ff-analysis-turn" key={i}>
                <p>{hindi ? contextQuestion(i,language)?.question ?? item.question : item.question}</p>
                <strong>{hindi ? (()=>{ const id=contextQuestion(i)?.options.find(option=>option.label===item.answer)?.id; return contextQuestion(i,language)?.options.find(option=>option.id===id)?.label ?? item.answer; })() : item.answer}</strong>
              </div>
            ))}
            </details>
          </section>

          {error && (
            <p role="alert" className="ff-context-error">
              {error}
            </p>
          )}
        </div>
        <footer>
          <p>
            {hindi ? "जवाब देने के लिए पानी में न उतरें।" : "Do not enter water to answer."}
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
