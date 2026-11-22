// A quick tooltip for the usage card. Native title tooltips wait about a
// second on macOS; this one shows after 100ms, sits above its row inside the
// window, and hides at once on leave.
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const DELAY_MS = 100;
const GAP = 4;
const EDGE = 8;

type Tip = { row: DOMRect; content: ReactNode };

export function useUsageTip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const timer = useRef(0);

  const show = (row: Element, content: ReactNode) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setTip({ row: row.getBoundingClientRect(), content }), DELAY_MS);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setTip(null);
  };
  return { show, hide, layer: tip && <TipLayer tip={tip} /> };
}

function TipLayer({ tip }: { tip: Tip }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const { width, height } = ref.current!.getBoundingClientRect();
    const center = tip.row.left + tip.row.width / 2;
    const left = Math.min(Math.max(center - width / 2, EDGE), window.innerWidth - width - EDGE);
    const above = tip.row.top - GAP - height;
    setPos({ left, top: above >= EDGE ? above : tip.row.bottom + GAP });
  }, [tip]);
  return createPortal(
    <div ref={ref} className="bbb-tip" role="tooltip" data-open={pos ? "" : undefined} style={pos ?? undefined}>
      {tip.content}
    </div>,
    document.body,
  );
}

/** The bars' value scale: plain, then the warning color, then destructive. */
export function tipLevel(usedPercent: number): "warn" | "high" | undefined {
  if (usedPercent >= 90) return "high";
  if (usedPercent >= 70) return "warn";
  return undefined;
}
