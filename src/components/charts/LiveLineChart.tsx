import { useId, useState } from "react";
import type { ChartDataPoint } from "../../types/telemetry";
import { monotonePath } from "./curve";
import { useSize } from "./useSize";

interface Props {
  points: ChartDataPoint[];
  unit?: string | null;
  formatValue?: (v: number) => string;
  color?: string;
}

const MARGIN = { top: 14, right: 84, bottom: 28, left: 56 };
const Y_TICKS = 4;
const X_TICKS = 5;

const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour12: false });
const defaultFmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(3));

/**
 * Bklit-style live line chart: smooth 2px line over a soft fill, dashed grid, pulsing head dot with
 * value badge at the tip, crosshair with time pill and tooltip on hover.
 */
export function LiveLineChart({ points, unit, formatValue = defaultFmt, color = "#3ecf8e" }: Props) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId();

  const w = Math.max(width - MARGIN.left - MARGIN.right, 1);
  const h = Math.max(height - MARGIN.top - MARGIN.bottom, 1);
  const ready = width > 0 && height > 0 && points.length > 1;

  let content: React.ReactNode = null;
  if (ready) {
    const vs = points.map((p) => p.v);
    let lo = Math.min(...vs);
    let hi = Math.max(...vs);
    const pad = (hi - lo || Math.abs(hi) * 0.02 || 1) * 0.15;
    lo -= pad;
    hi += pad;
    const t0 = points[0]!.t;
    const t1 = points[points.length - 1]!.t;
    const tSpan = t1 - t0 || 1;
    const sx = (t: number) => ((t - t0) / tSpan) * w;
    const sy = (v: number) => h - ((v - lo) / (hi - lo)) * h;
    const xy = points.map((p) => [sx(p.t), sy(p.v)] as const);
    const line = monotonePath(xy);
    const head = xy[xy.length - 1]!;
    const area = `${line}L${head[0]},${h}L${xy[0]![0]},${h}Z`;
    const headPoint = points[points.length - 1]!;
    const hp = hover !== null ? points[hover] : undefined;
    const hxy = hover !== null ? xy[hover] : undefined;

    const move = (e: React.MouseEvent<SVGRectElement>) => {
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
    };

    const yTicks = Array.from({ length: Y_TICKS + 1 }, (_, i) => lo + ((hi - lo) * i) / Y_TICKS);
    const xTicks = Array.from({ length: X_TICKS }, (_, i) => t0 + (tSpan * i) / (X_TICKS - 1));
    const badgeText = `${formatValue(headPoint.v)}${unit ? ` ${unit}` : ""}`;
    const badgeW = Math.min(MARGIN.right - 8, badgeText.length * 6.6 + 14);

    content = (
      <svg width={width} height={height} className="block select-none">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
          <clipPath id={`${gid}-clip`}>
            <rect x={0} y={-4} width={w} height={h + 8} />
          </clipPath>
        </defs>
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={0} x2={w} y1={sy(v)} y2={sy(v)} stroke="#2e2e2e" strokeDasharray="2 4" />
              <text x={-10} y={sy(v)} dy="0.32em" textAnchor="end" className="fill-smoke font-mono" fontSize={10.5}>
                {formatValue(v)}
              </text>
            </g>
          ))}
          {xTicks.map((t, i) => (
            <text
              key={t}
              x={sx(t)}
              y={h + 18}
              textAnchor={i === 0 ? "start" : i === X_TICKS - 1 ? "end" : "middle"}
              className="fill-smoke font-mono"
              fontSize={10.5}
            >
              {clock(t)}
            </text>
          ))}

          <g clipPath={`url(#${gid}-clip)`}>
            <path d={area} fill={`url(#${gid})`} />
            <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </g>

          {/* head: pulsing dot + value badge */}
          <circle cx={head[0]} cy={head[1]} r={4} fill={color}>
            <animate attributeName="r" values="4;9;4" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.35;0;0.35" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx={head[0]} cy={head[1]} r={4} fill={color} />
          <g transform={`translate(${w + 10},${head[1] - 11})`}>
            <rect width={badgeW} height={22} rx={11} fill={color} />
            <text x={badgeW / 2} y={11} dy="0.34em" textAnchor="middle" className="fill-obsidian font-mono" fontSize={11} fontWeight={500}>
              {badgeText}
            </text>
          </g>

          {/* crosshair */}
          {hp && hxy && (
            <g pointerEvents="none">
              <line x1={hxy[0]} x2={hxy[0]} y1={0} y2={h} stroke="#898989" strokeDasharray="3 3" />
              <circle cx={hxy[0]} cy={hxy[1]} r={4.5} fill="#121212" stroke={color} strokeWidth={2} />
              <g transform={`translate(${Math.min(Math.max(hxy[0], 34), w - 34)},${h + 4})`}>
                <rect x={-34} width={68} height={18} rx={9} fill="#242424" stroke="#2e2e2e" />
                <text y={9} dy="0.34em" textAnchor="middle" className="fill-snow font-mono" fontSize={10.5}>
                  {clock(hp.t)}
                </text>
              </g>
              <g transform={`translate(${hxy[0] > w / 2 ? hxy[0] - 12 : hxy[0] + 12},${Math.max(hxy[1] - 34, 0)})`}>
                {(() => {
                  const txt = `${formatValue(hp.v)}${unit ? ` ${unit}` : ""}`;
                  const tw = txt.length * 7 + 16;
                  const x = hxy[0] > w / 2 ? -tw : 0;
                  return (
                    <>
                      <rect x={x} width={tw} height={24} rx={8} fill="#242424" stroke="#2e2e2e" />
                      <text x={x + tw / 2} y={12} dy="0.34em" textAnchor="middle" className="fill-snow font-mono" fontSize={12} fontWeight={500}>
                        {txt}
                      </text>
                    </>
                  );
                })()}
              </g>
            </g>
          )}
          <rect x={0} y={0} width={w} height={h} fill="transparent" onMouseMove={move} onMouseLeave={() => setHover(null)} />
        </g>
      </svg>
    );
  }

  return (
    <div ref={ref} className="h-full w-full">
      {content}
    </div>
  );
}
