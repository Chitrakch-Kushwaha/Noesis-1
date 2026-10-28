"use client";
import katex from "katex";
import { useCallback, useRef, type PointerEvent as RPointerEvent, type ReactNode, type RefObject } from "react";

/** Convert a pointer position into the SVG's own user coordinates. */
export function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

/** Pointer-capture drag for an SVG handle. `onMove` receives SVG user coordinates. */
export function useSvgDrag(svgRef: RefObject<SVGSVGElement | null>, onMove: (p: { x: number; y: number }) => void, onEnd?: () => void) {
  const active = useRef(false);
  const down = useCallback((e: RPointerEvent<Element>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    active.current = true;
    (e.currentTarget as HTMLElement | SVGElement).focus?.({ preventScroll: true });
  }, []);
  const move = useCallback((e: RPointerEvent<Element>) => {
    if (!active.current || !svgRef.current) return;
    onMove(svgPoint(svgRef.current, e.clientX, e.clientY));
  }, [onMove, svgRef]);
  const up = useCallback((e: RPointerEvent<Element>) => {
    if (!active.current) return;
    active.current = false;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    onEnd?.();
  }, [onEnd]);
  return { onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: up };
}

export function Tex({ tex, display = false }: { tex: string; display?: boolean }) {
  const html = katex.renderToString(tex, { throwOnError: false, displayMode: display, output: "htmlAndMathml", strict: "ignore", trust: false });
  return <span className={display ? "tex tex--display" : "tex"} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Plain text with inline $…$ maths rendered by KaTeX and **bold** runs. */
export function RichText({ text }: { text: string }): ReactNode {
  const parts = text.split(/(\$[^$]+\$)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("$") && p.endsWith("$") && p.length > 2 ? <Tex key={i} tex={p.slice(1, -1)} /> : <Bold key={i} text={p} />,
      )}
    </>
  );
}
function Bold({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return <>{parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : p))}</>;
}

export const fmtNum = (x: number, sig = 3) => {
  if (!Number.isFinite(x)) return x > 0 ? "∞" : "−∞";
  const v = Number(x.toPrecision(sig));
  return (Object.is(v, -0) ? 0 : v).toString().replace("-", "−");
};

/** Arrowhead polygon points for a line ending at (x2, y2). */
export function arrowHead(x1: number, y1: number, x2: number, y2: number, size = 11) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const p = (d: number) => `${x2 - size * Math.cos(a + d)},${y2 - size * Math.sin(a + d)}`;
  return `${x2},${y2} ${p(0.42)} ${p(-0.42)}`;
}
