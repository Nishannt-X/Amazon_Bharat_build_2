"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import styles from "./report-photo-viewer.module.css";

interface ReportPhotoThumbProps {
  src: string;
  alt: string;
  title: string;
  sample?: boolean;
  className?: string;
}

/** Popup thumbnail that opens the report's own uploaded photo full size in a
 *  modal <dialog>. The dialog is inert to the page (and so to the map), traps
 *  focus, closes on Escape, and returns focus to the thumbnail.
 */
export default function ReportPhotoThumb({ src, alt, title, sample = false, className }: ReportPhotoThumbProps) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  return <>
    <button ref={trigger} type="button" className={styles.thumb} aria-haspopup="dialog" aria-label={`View full photo: ${title}`} onClick={() => setOpen(true)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={className} />
    </button>
    {open ? <PhotoDialog src={src} alt={alt} title={title} sample={sample} trigger={trigger} onClose={() => setOpen(false)} /> : null}
  </>;
}

function PhotoDialog({ src, alt, title, sample, trigger, onClose }: { src: string; alt: string; title: string; sample: boolean; trigger: React.RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const opener = trigger.current;
    if (!el.open) el.showModal();
    return () => {
      if (el.open) el.close();
      // Popups can re-render while the viewer is open; fall back to the map if the trigger is gone.
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [trigger]);

  const url = attempt ? `${src}${src.includes("?") ? "&" : "?"}retry=${attempt}` : src;
  return (
    <dialog ref={dialog} className={styles.dialog} aria-label={`Full photo: ${title}`}
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div className={styles.bar}>
        <div className={styles.caption}>
          <p className={styles.title}>{title}</p>
          {sample ? <span className={styles.badge}>Sample · not live</span> : null}
        </div>
        <button type="button" className={styles.close} onClick={close} aria-label="Close photo" autoFocus>
          <X size={22} aria-hidden="true" />
        </button>
      </div>
      <div className={styles.stage} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
        {state === "loading" ? <div className={styles.status} role="status"><span className={styles.spinner} aria-hidden="true" />Loading photo…</div> : null}
        {state === "error" ? <div className={styles.status} role="alert">
          <p>The photo couldn’t be loaded.</p>
          <button type="button" className={styles.retry} onClick={() => { setState("loading"); setAttempt((n) => n + 1); }}>Try again</button>
        </div> : null}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={attempt} src={url} alt={alt} className={`${styles.image} ${state === "ready" ? "" : styles.hidden}`}
          onLoad={() => setState("ready")} onError={() => setState("error")} />
      </div>
    </dialog>
  );
}
