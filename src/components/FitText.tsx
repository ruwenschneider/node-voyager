import { useLayoutEffect, useRef, useState } from "react";

interface Props {
  children: React.ReactNode;
  max?: number;
  min?: number;
  className?: string;
}

/** Renders on one line and shrinks the font so the content always fits the parent's width. */
export function FitText({ children, max = 32, min = 12, className = "" }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState(max);

  const fit = () => {
    const b = box.current;
    const i = inner.current;
    if (!b || !i) return;
    i.style.fontSize = `${max}px`;
    const ratio = b.clientWidth / Math.max(i.scrollWidth, 1);
    const next = Math.max(min, Math.min(max, Math.floor(max * Math.min(ratio, 1))));
    i.style.fontSize = `${next}px`;
    setSize(next);
  };

  useLayoutEffect(fit);
  useLayoutEffect(() => {
    const b = box.current;
    if (!b) return;
    const ro = new ResizeObserver(fit);
    ro.observe(b);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={box} className={`min-w-0 overflow-hidden whitespace-nowrap ${className}`} style={{ height: max * 1.2 }}>
      <span ref={inner} style={{ fontSize: size, lineHeight: 1.2 }} className="inline-block">
        {children}
      </span>
    </div>
  );
}
