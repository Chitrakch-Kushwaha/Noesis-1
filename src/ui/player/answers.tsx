"use client";
// Answer inputs for every format. Each gives the same CheckInput whether the student types, clicks,
// uses the keyboard or drags, so all routes are checked by the same engine.
import { useId, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from "react";
import { toLatex } from "@/src/checking/expr/latex";
import { parseExpression } from "@/src/checking/expr/parse";
import type { QuestionInstance } from "@/src/content/instantiate";
import { RichText, Tex } from "@/src/widgets/shared";

// ---------------------------------------------------------------- typed answers

const KEYS: Record<string, { label: string; insert: string; aria?: string }[]> = {
  maths: [
    { label: "√", insert: "√(", aria: "square root" }, { label: "x²", insert: "^2", aria: "squared" }, { label: "xⁿ", insert: "^", aria: "power" },
    { label: "π", insert: "π", aria: "pi" }, { label: "(", insert: "(" }, { label: ")", insert: ")" }, { label: "÷", insert: "/", aria: "divide" }, { label: "−", insert: "-", aria: "minus" },
  ],
  interval: [
    { label: "[", insert: "[" }, { label: "]", insert: "]" }, { label: "(", insert: "(" }, { label: ")", insert: ")" },
    { label: "∞", insert: "∞", aria: "infinity" }, { label: "−∞", insert: "-∞", aria: "minus infinity" }, { label: "∪", insert: " ∪ ", aria: "union" }, { label: ",", insert: ", ", aria: "comma" },
  ],
  set: [{ label: "{", insert: "{" }, { label: "}", insert: "}" }, { label: ",", insert: ", ", aria: "comma" }, { label: "∅", insert: "∅", aria: "empty set" }],
  none: [],
};

/** A typeset preview of what the student typed, when it parses as maths. */
function preview(format: QuestionInstance["format"], text: string, variables: string[]): string | null {
  if (!text.trim() || !["expression", "antiderivative", "equation", "number"].includes(format)) return null;
  try {
    const sides = format === "equation" ? text.split("=") : [text];
    if (sides.length > 2) return null;
    return sides.map((s) => toLatex(parseExpression(s, { variables }).ast)).join(" = ");
  } catch { return null; }
}

export function TextAnswer({ q, value, onChange, onSubmit, disabled, invalid, describedBy }: {
  q: QuestionInstance; value: string; onChange(v: string): void; onSubmit(): void; disabled: boolean; invalid: boolean; describedBy?: string;
}) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  const keypad = q.input?.keypad ?? "none";
  const vars = q.check.kind === "expression" || q.check.kind === "equation" ? q.check.variables : q.check.kind === "antiderivative" ? [q.check.variable, ...(q.check.constants ?? ["C"])] : [];
  const tex = preview(q.format, value, vars);
  const insert = (s: string) => {
    const el = ref.current;
    if (!el) return onChange(value + s);
    const a = el.selectionStart ?? value.length, b = el.selectionEnd ?? value.length;
    const next = value.slice(0, a) + s + value.slice(b);
    onChange(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + s.length, a + s.length); });
  };
  return (
    <div className="field">
      <label htmlFor={id}>{q.input?.label ?? "Your answer"}</label>
      <input
        ref={ref} id={id} value={value} disabled={disabled} placeholder={q.input?.placeholder} autoComplete="off" autoCapitalize="off" spellCheck={false}
        inputMode="text" aria-invalid={invalid} aria-describedby={describedBy} data-testid="answer-input"
        onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onSubmit(); } }}
      />
      {KEYS[keypad]!.length > 0 && (
        <div className="keypad" role="group" aria-label="Symbols">
          {KEYS[keypad]!.map((k) => (
            <button key={k.label} type="button" className="key" onClick={() => insert(k.insert)} disabled={disabled} aria-label={k.aria ? `Insert ${k.aria}` : `Insert ${k.label}`}>{k.label}</button>
          ))}
        </div>
      )}
      {tex && <div className="tex-preview" aria-hidden="true" data-testid="answer-preview"><span className="muted">Reads as </span><Tex tex={tex} /></div>}
    </div>
  );
}

// ---------------------------------------------------------------- choices

export function ChoiceAnswer({ q, value, onChange, disabled, multiple }: { q: QuestionInstance; value: string[]; onChange(v: string[]): void; disabled: boolean; multiple: boolean }) {
  const name = useId();
  return (
    <fieldset className="choices" disabled={disabled} data-testid="choices">
      <legend className="sr-only">{multiple ? "Choose every correct answer" : "Choose one answer"}</legend>
      {multiple && <p className="muted small">Choose every correct answer.</p>}
      {(q.options ?? []).map((o) => {
        const checked = value.includes(o.id);
        return (
          <label key={o.id} className="choice" data-checked={checked}>
            <input
              type={multiple ? "checkbox" : "radio"} name={name} value={o.id} checked={checked}
              onChange={(e) => onChange(multiple ? (e.target.checked ? [...value, o.id] : value.filter((x) => x !== o.id)) : [o.id])}
            />
            <span><RichText text={o.text} /></span>
          </label>
        );
      })}
    </fieldset>
  );
}

// ---------------------------------------------------------------- shared pointer drag (works for mouse, pen and touch)

function usePointerDrag(onDrop: (id: string, target: HTMLElement | null, e: RPointerEvent) => void, onMove?: (id: string, e: RPointerEvent) => void) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const handlers = (id: string) => ({
    onPointerDown: (e: RPointerEvent) => {
      if (e.button !== 0) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setDragging(id); setPos({ x: e.clientX, y: e.clientY });
    },
    onPointerMove: (e: RPointerEvent) => { if (dragging === id) { setPos({ x: e.clientX, y: e.clientY }); onMove?.(id, e); } },
    onPointerUp: (e: RPointerEvent) => {
      if (dragging !== id) return;
      const under = document.elementsFromPoint(e.clientX, e.clientY).find((el) => (el as HTMLElement).dataset?.drop) as HTMLElement | undefined;
      setDragging(null); setPos(null);
      onDrop(id, under ?? null, e);
    },
    onPointerCancel: () => { setDragging(null); setPos(null); },
  });
  return { dragging, pos, handlers };
}

// ---------------------------------------------------------------- ordering

export function OrderingAnswer({ q, order, onChange, disabled }: { q: QuestionInstance; order: string[]; onChange(o: string[]): void; disabled: boolean }) {
  const text = (id: string) => q.items?.find((i) => i.id === id)?.text ?? id;
  const [status, setStatus] = useState("");
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x!);
    onChange(next);
    setStatus(`${text(x!)} moved to position ${to + 1} of ${order.length}.`);
  };
  const drag = usePointerDrag((id, target) => {
    const to = target?.dataset.drop?.startsWith("pos:") ? Number(target.dataset.drop.slice(4)) : -1;
    if (to >= 0) move(order.indexOf(id), to);
  });
  const onKey = (i: number) => (e: KeyboardEvent) => {
    if (e.altKey && e.key === "ArrowUp") { e.preventDefault(); move(i, i - 1); }
    if (e.altKey && e.key === "ArrowDown") { e.preventDefault(); move(i, i + 1); }
  };
  return (
    <div className="ordering" data-testid="ordering">
      <p className="muted small" id="ordering-help">Drag a card by its handle, or use Move up and Move down (Alt + arrow keys also work). First is greatest.</p>
      <ol className="order-list" aria-describedby="ordering-help">
        {order.map((id, i) => (
          <li key={id} className="order-item" data-drop={`pos:${i}`} data-dragging={drag.dragging === id} data-testid={`order-${id}`} onKeyDown={onKey(i)}>
            <span className="drag-handle" aria-hidden="true" {...(disabled ? {} : drag.handlers(id))} data-testid={`order-handle-${id}`}>⋮⋮</span>
            <span className="order-pos" aria-hidden="true">{i + 1}</span>
            <span className="order-text"><RichText text={text(id)} /></span>
            <span className="order-buttons">
              <button type="button" className="btn btn--small" onClick={() => move(i, i - 1)} disabled={disabled || i === 0} aria-label={`Move ${text(id)} up`}>Move up</button>
              <button type="button" className="btn btn--small" onClick={() => move(i, i + 1)} disabled={disabled || i === order.length - 1} aria-label={`Move ${text(id)} down`}>Move down</button>
            </span>
          </li>
        ))}
      </ol>
      <p className="sr-only" aria-live="polite">{status}</p>
    </div>
  );
}

// ---------------------------------------------------------------- mapping

export function MappingAnswer({ q, value, onChange, disabled }: { q: QuestionInstance; value: Record<string, string>; onChange(v: Record<string, string>): void; disabled: boolean }) {
  const [status, setStatus] = useState("");
  const targets = q.targets ?? [];
  const tText = (id: string) => targets.find((t) => t.id === id)?.text ?? "";
  const set = (item: string, target: string) => {
    const next = { ...value };
    if (target) next[item] = target; else delete next[item];
    onChange(next);
    const it = q.items?.find((i) => i.id === item)?.text ?? item;
    setStatus(target ? `${it} matched with ${tText(target)}.` : `${it} cleared.`);
  };
  const drag = usePointerDrag((id, target) => { if (target?.dataset.drop?.startsWith("target:")) set(id, target.dataset.drop.slice(7)); });
  return (
    <div className="mapping" data-testid="mapping">
      <p className="muted small">Choose from each list, or drag a card onto a source below.</p>
      <ul className="map-items">
        {(q.items ?? []).map((it) => (
          <li key={it.id} className="map-item" data-dragging={drag.dragging === it.id}>
            <span className="drag-handle" aria-hidden="true" {...(disabled ? {} : drag.handlers(it.id))} data-testid={`map-handle-${it.id}`}>⋮⋮</span>
            <label className="map-label" htmlFor={`map-${it.id}`}><RichText text={it.text} /></label>
            <select id={`map-${it.id}`} value={value[it.id] ?? ""} onChange={(e) => set(it.id, e.target.value)} disabled={disabled} data-testid={`map-select-${it.id}`}>
              <option value="">Choose…</option>
              {targets.map((t) => <option key={t.id} value={t.id}>{t.text}</option>)}
            </select>
          </li>
        ))}
      </ul>
      <ul className="map-targets" aria-hidden="true">
        {targets.map((t) => {
          const here = Object.entries(value).filter(([, v]) => v === t.id).map(([k]) => q.items?.find((i) => i.id === k)?.text ?? k);
          return (
            <li key={t.id} className="map-target" data-drop={`target:${t.id}`} data-testid={`map-target-${t.id}`} data-active={!!drag.dragging}>
              <strong>{t.text}</strong>
              {here.map((h) => <span key={h} className="chip">{h}</span>)}
            </li>
          );
        })}
      </ul>
      {drag.pos && drag.dragging && (
        <div className="drag-ghost" style={{ left: drag.pos.x, top: drag.pos.y }} aria-hidden="true">{q.items?.find((i) => i.id === drag.dragging)?.text}</div>
      )}
      <p className="sr-only" aria-live="polite">{status}</p>
    </div>
  );
}
