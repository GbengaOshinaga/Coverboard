"use client";

import { useEffect, useId, useRef, useState } from "react";
import { HelpCircle } from "lucide-react";
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary";

/**
 * A small "?" after a term that opens its plain-English meaning
 * (src/lib/glossary.ts). Opens on tap or click, not only hover, so it works
 * on phones; closes on a second tap, a tap elsewhere or Escape.
 */
export function TermHint({ term, className }: { term: GlossaryKey; className?: string }) {
  const entry = GLOSSARY[term];
  const [open, setOpen] = useState(false);
  // Shift left so the note stays on screen when the "?" is near the right edge.
  const [shift, setShift] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className={`relative inline-flex align-middle ${className ?? ""}`}>
      <button
        type="button"
        aria-label={`What does ${entry.term} mean?`}
        aria-expanded={open}
        aria-controls={id}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const rect = ref.current?.getBoundingClientRect();
          if (rect) {
            const width = Math.min(288, window.innerWidth - 32);
            setShift(Math.max(0, rect.left + width - (window.innerWidth - 16)));
          }
          setOpen((v) => !v);
        }}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <HelpCircle className="h-4 w-4" />
      </button>
      {open && (
        <span
          id={id}
          role="note"
          style={{ left: -shift }}
          className="absolute left-0 top-6 z-50 w-72 max-w-[calc(100vw-2rem)] rounded-md border border-gray-200 bg-white p-3 text-left text-xs font-normal leading-relaxed text-gray-700 shadow-lg"
        >
          <span className="block font-semibold text-gray-900">{entry.term}</span>
          <span className="mt-1 block">{entry.meaning}</span>
          {"link" in entry && entry.link && (
            <a
              href={entry.link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-block font-medium text-brand-600 hover:underline"
            >
              {entry.link.includes("ico.org.uk") ? "More from the ICO" : "More on GOV.UK"}
            </a>
          )}
        </span>
      )}
    </span>
  );
}
