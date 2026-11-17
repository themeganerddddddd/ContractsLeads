"use client";

import { useState } from "react";

import { compactMoney } from "@/lib/format";

type AnnualPoint = { year: string | number; activity: string | number | null };

export function ContractHistoryChart({ annual }: { annual: AnnualPoint[] }) {
  const [period, setPeriod] = useState<"5" | "all">("5");
  const history = [...annual].filter(row => Number.isFinite(Number(row.year)) && row.activity !== null).sort((a, b) => Number(a.year) - Number(b.year));
  const visible = period === "5" ? history.slice(-5) : history;
  const maximum = Math.max(1, ...visible.map(point => Math.abs(Number(point.activity))));
  const width = 830, plotStart = 53, plotWidth = 738, baseline = 135, halfHeight = 91;
  const interval = plotWidth / Math.max(visible.length, 1);

  if (!history.length) {
    return <div className="empty-panel"><strong>Annual contract history is not available.</strong><p>No reported U.S. transaction obligations were found for this company.</p></div>;
  }

  return <div className="studio-history">
    <div className="studio-history-heading">
      <div><p className="studio-chart-kicker">GOVERNMENT BUSINESS / ANNUAL HISTORY</p><h3>Annual net U.S. obligations</h3><p>Disclosed federal transaction obligations, including deobligations. Not company revenue or contract ceiling.</p></div>
      <div className="studio-range-selector" aria-label="Historical chart period">
        <button type="button" aria-pressed={period === "5"} className={period === "5" ? "active" : ""} onClick={() => setPeriod("5")}>Latest 5</button>
        <button type="button" aria-pressed={period === "all"} className={period === "all" ? "active" : ""} onClick={() => setPeriod("all")}>All years</button>
      </div>
    </div>
    <div className="studio-history-chart">
      <svg role="img" aria-label="Bar chart of annual net U.S. government contract obligations with positive and negative values" width="100%" viewBox={`0 0 ${width} 275`} preserveAspectRatio="xMidYMid meet">
        <line x1="47" y1="44" x2="805" y2="44" className="studio-grid-line" />
        <line x1="47" y1={baseline} x2="805" y2={baseline} className="studio-zero-line" />
        <line x1="47" y1="227" x2="805" y2="227" className="studio-grid-line" />
        <text x="8" y="48" className="studio-chart-axis">+</text>
        <text x="8" y={baseline + 4} className="studio-chart-axis">0</text>
        <text x="8" y="231" className="studio-chart-axis">−</text>
        {visible.map((point, index) => {
          const value = Number(point.activity);
          const barHeight = (Math.abs(value) / maximum) * halfHeight;
          const barWidth = Math.min(55, Math.max(12, interval * .62));
          const x = plotStart + index * interval + (interval - barWidth) / 2;
          const y = value >= 0 ? baseline - barHeight : baseline;
          const labelY = value >= 0 ? Math.max(18, y - 9) : Math.min(247, y + barHeight + 18);
          return <g key={point.year}>
            <rect x={x} y={y} rx="4" width={barWidth} height={Math.max(1, barHeight)} className={value < 0 ? "studio-bar negative" : "studio-bar positive"}><title>{`${point.year}: ${compactMoney(value)} net obligations`}</title></rect>
            <text className="studio-chart-value" x={x + barWidth / 2} y={labelY} textAnchor="middle">{compactMoney(value)}</text>
            <text className="studio-chart-year" x={x + barWidth / 2} y="269" textAnchor="middle">{point.year}</text>
          </g>;
        })}
      </svg>
    </div>
    <div className="studio-chart-footer"><span><i className="studio-chart-legend" /> Net obligations (USD)</span><span>Values can be negative after deobligations · <a href="/methodology">Methodology ↗</a></span></div>
  </div>;
}
