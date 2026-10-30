import { useId, useState } from "react";
import type { ChartDataPoint } from "../../types/telemetry";
import { monotonePath } from "./curve";
import { useSize } from "./useSize";

interface Props {
  points: ChartDataPoint[];
  color?: string;
  height?: number;
  onHover?: (p: ChartDataPoint | null) => void;
}

/** Bklit-style area sparkline: one path, dashed crosshair + dot on hover, rest of the series dims to 50 %. */
export function Sparkline({ points, color = "#3ecf8e", height = 40, onHover }: Props) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId();
  const pad = 4;

  const vs = points.map((p) => p.v);
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  const span = hi - lo || 1;
  const t0 = points[0]?.t ?? 0;
  const tSpan = (points[points.length - 1]?.t ?? 1) - t0 || 1;
  const xy = points.map((p) => [pad + ((p.t - t0) / tSpan) * Math.max(width - pad * 2, 1), height - pad - ((p.v - lo) / span) * (height - pad * 2)] as const);
  const line = monotonePath(xy);
  const last = xy[xy.length - 1];
  const first = xy[0];
  const area = last && first ? `${line}L${last[0]},${height}L${first[0]},${height}Z` : "";
  const hp = hover !== null ? xy[hover] : undefined;

  const move = (e: React.MouseEvent<SVGSVGElement>) => {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    let best = 0;
    let bd = Infinity;
    xy.forEach((q, i) => {
      const d = Math.abs(q[0] - x);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setHover(best);
    onHover?.(points[best] ?? null);
  };
  const leave = () => {
    setHover(null);
    onHover?.(null);
  };

  return (
    <div ref={ref} style={{ height }} className="w-full">
      {width > 0 && points.length > 1 && (
        <svg width={width} height={height} onMouseMove={move} onMouseLeave={leave} className="block overflow-visible">
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <g opacity={hover !== null ? 0.5 : 1}>
            <path d={area} fill={`url(#${gid})`} />
            <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
          </g>
          {hp && (
            <>
              <line x1={hp[0]} x2={hp[0]} y1={0} y2={height} stroke="#898989" strokeDasharray="3 3" />
              <circle cx={hp[0]} cy={hp[1]} r={3.5} fill="#121212" stroke={color} strokeWidth={1.5} />
            </>
          )}
          {hover === null && last && <circle cx={last[0]} cy={last[1]} r={2.5} fill={color} />}
        </svg>
      )}
    </div>
  );
}
