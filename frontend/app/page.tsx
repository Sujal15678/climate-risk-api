'use client';

import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Cell, Tooltip,
} from 'recharts';

const API = 'https://climate-risk-api-a2xq.onrender.com';

const INK = '#0B1119';
const PANEL = '#131C28';
const LINE = '#1F2B3A';
const RAIN = '#4EA8DE';
const DUST = '#C97B3C';
const TEXT = '#E4EBF2';
const MUTED = '#7387A0';

export default function Home() {
  const [districts, setDistricts] = useState([]);
  const [selected, setSelected] = useState('vikarabad');
  const [threshold, setThreshold] = useState(650);
  const [exitMm, setExitMm] = useState(300);
  const [sumInsured, setSumInsured] = useState(20000);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API}/districts`)
      .then((r) => r.json())
      .then(setDistricts)
      .catch(() => { });
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${API}/payout/${selected}?threshold_mm=${threshold}&exit_mm=${exitMm}&sum_insured=${sumInsured}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setData)
      .catch(() => setError('The API is waking from idle. Give it 30 seconds, then move any control to retry.'))
      .finally(() => setLoading(false));
  }, [selected, threshold, exitMm, sumInsured]);

  const byState = districts.reduce((acc, d) => {
    (acc[d.state] = acc[d.state] || []).push(d);
    return acc;
  }, {});

  return (
    <main className="min-h-screen" style={{ background: INK, color: TEXT }}>
      <div className="max-w-6xl mx-auto px-6 py-12">

        <div className="flex flex-wrap items-end justify-between gap-6 pb-8 mb-10"
          style={{ borderBottom: `1px solid ${LINE}` }}>
          <div>
            <div className="mono text-[11px] tracking-[0.2em] uppercase mb-3" style={{ color: MUTED }}>
              Parametric rainfall cover · Kharif season
            </div>
            <h1 className="text-4xl font-semibold tracking-tight">
              {data ? data.district : 'Loading'}
            </h1>
            <p className="mt-2 text-sm" style={{ color: MUTED }}>
              Twenty seasons of observed June–September rainfall, priced against your policy terms.
            </p>
          </div>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="mono text-sm px-4 py-2.5 rounded outline-none"
            style={{ background: PANEL, border: `1px solid ${LINE}`, color: TEXT }}
          >
            {Object.entries(byState).map(([state, list]) => (
              <optgroup key={state} label={state} style={{ background: PANEL }}>
                {list.map((d) => (
                  <option key={d.id} value={d.id} style={{ background: PANEL }}>
                    {d.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {error && (
          <div className="mb-8 px-5 py-4 rounded text-sm"
            style={{ background: PANEL, border: `1px solid ${DUST}` }}>
            {error}
          </div>
        )}

        {loading && !data && (
          <div className="mono text-sm py-24 text-center" style={{ color: MUTED }}>
            Fetching twenty years of daily observations…
          </div>
        )}

        {data && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-px mb-10"
              style={{ background: LINE, border: `1px solid ${LINE}` }}>
              <div className="lg:col-span-2 px-7 py-8" style={{ background: PANEL }}>
                <div className="mono text-[11px] tracking-[0.18em] uppercase mb-4" style={{ color: MUTED }}>
                  Burn rate
                </div>
                <div className="mono text-6xl font-medium leading-none" style={{ color: DUST }}>
                  {data.burn_rate_pct.toFixed(2)}<span className="text-3xl">%</span>
                </div>
                <div className="text-sm mt-4 leading-relaxed" style={{ color: MUTED }}>
                  Expected annual loss per rupee of cover. Price the premium above this to carry
                  expenses, capital and margin.
                </div>
              </div>

              <Metric label="Trigger rate" value={`${data.trigger_rate_pct}%`}
                note={`${data.trigger_years} of ${data.years_analysed} seasons`} />
              <Metric label="Average payout"
                value={`₹${Math.round(data.avg_annual_payout_inr).toLocaleString('en-IN')}`}
                note="across all seasons" />
              <Metric label="Long-period average"
                value={`${Math.round(data.avg_monsoon_rainfall_mm)}`}
                note="mm, June–September" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-px mb-10"
              style={{ background: LINE, border: `1px solid ${LINE}` }}>
              <div className="lg:col-span-2 px-7 py-7" style={{ background: PANEL }}>
                <div className="mono text-[11px] tracking-[0.18em] uppercase mb-6" style={{ color: MUTED }}>
                  Policy terms
                </div>
                <Slider label="Trigger" hint="Payout begins below this seasonal rainfall"
                  value={threshold} setValue={setThreshold} min={100} max={1600} step={25} unit="mm" />
                <Slider label="Exit" hint="Full sum insured pays at or below this level"
                  value={Math.min(exitMm, threshold - 25)} setValue={setExitMm}
                  min={0} max={Math.max(threshold - 25, 25)} step={25} unit="mm" />
                <Slider label="Sum insured" hint="Maximum cover per hectare"
                  value={sumInsured} setValue={setSumInsured}
                  min={5000} max={60000} step={1000} unit="₹" prefix />
              </div>

              <div className="px-7 py-7" style={{ background: PANEL }}>
                <div className="mono text-[11px] tracking-[0.18em] uppercase mb-6" style={{ color: MUTED }}>
                  Payout ramp
                </div>
                <Ramp threshold={threshold} exitMm={Math.min(exitMm, threshold - 25)} />
                <p className="text-xs mt-5 leading-relaxed" style={{ color: MUTED }}>
                  Between exit and trigger the payout scales with the shortfall, so a marginal
                  deficit does not settle the same as a total failure.
                </p>
              </div>
            </div>

            <div className="px-7 py-7 mb-10" style={{ background: PANEL, border: `1px solid ${LINE}` }}>
              <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
                <div className="mono text-[11px] tracking-[0.18em] uppercase" style={{ color: MUTED }}>
                  Twenty-season backtest
                </div>
                <div className="mono text-[11px]" style={{ color: MUTED }}>
                  <span style={{ color: RAIN }}>■</span> no claim
                  <span className="ml-4" style={{ color: DUST }}>■</span> claim
                </div>
              </div>
              <p className="text-sm mb-6" style={{ color: MUTED }}>
                Seasonal rainfall against the {threshold} mm trigger. Deeper shading marks a larger claim.
              </p>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={data.yearly} margin={{ top: 8, right: 0, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke={LINE} vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: MUTED, fontFamily: 'IBM Plex Mono' }}
                    axisLine={{ stroke: LINE }} tickLine={false} interval={1} />
                  <YAxis tick={{ fontSize: 11, fill: MUTED, fontFamily: 'IBM Plex Mono' }}
                    axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: '#ffffff08' }}
                    contentStyle={{ background: INK, border: `1px solid ${LINE}`, borderRadius: 2, fontSize: 12 }}
                    labelStyle={{ color: TEXT, fontFamily: 'IBM Plex Mono' }}
                    formatter={(v) => [`${v} mm`, 'Rainfall']}
                  />
                  <ReferenceLine y={threshold} stroke={DUST} strokeDasharray="3 3" />
                  <ReferenceLine y={Math.min(exitMm, threshold - 25)} stroke={DUST}
                    strokeDasharray="1 4" strokeOpacity={0.5} />
                  <Bar dataKey="monsoon_rainfall_mm" radius={[1, 1, 0, 0]}>
                    {data.yearly.map((y, i) => (
                      <Cell key={i} fill={y.triggered ? DUST : RAIN}
                        fillOpacity={y.triggered ? 0.4 + 0.6 * (y.payout_inr / sumInsured) : 0.7} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={{ background: PANEL, border: `1px solid ${LINE}` }}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="mono text-[11px] tracking-[0.15em] uppercase" style={{ color: MUTED }}>
                      <th className="text-left px-7 py-4 font-normal">Season</th>
                      <th className="text-right px-7 py-4 font-normal">Rainfall</th>
                      <th className="text-right px-7 py-4 font-normal">Dry spell</th>
                      <th className="text-right px-7 py-4 font-normal">Shortfall</th>
                      <th className="text-right px-7 py-4 font-normal">Payout</th>
                    </tr>
                  </thead>
                  <tbody className="mono">
                    {data.yearly.map((y) => (
                      <tr key={y.year} style={{ borderTop: `1px solid ${LINE}` }}>
                        <td className="px-7 py-3">{y.year}</td>
                        <td className="text-right px-7 py-3">{y.monsoon_rainfall_mm}</td>
                        <td className="text-right px-7 py-3" style={{ color: MUTED }}>
                          {y.longest_dry_spell_days ? `${y.longest_dry_spell_days} d` : '—'}
                        </td>
                        <td className="text-right px-7 py-3" style={{ color: MUTED }}>
                          {y.triggered ? `${Math.round(threshold - y.monsoon_rainfall_mm)} mm` : '—'}
                        </td>
                        <td className="text-right px-7 py-3"
                          style={{ color: y.triggered ? DUST : '#3D4C60' }}>
                          {y.triggered ? `₹${Math.round(y.payout_inr).toLocaleString('en-IN')}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="mono text-[11px] mt-8 leading-relaxed" style={{ color: MUTED }}>
              Daily rainfall from Open-Meteo ERA5 reanalysis · Monsoon window 1 June – 30 September ·
              Dry spell counts the longest run below the IMD rainy-day threshold of 2.5 mm
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value, note }) {
  return (
    <div className="px-6 py-8" style={{ background: '#131C28' }}>
      <div className="mono text-[11px] tracking-[0.18em] uppercase mb-4" style={{ color: '#7387A0' }}>
        {label}
      </div>
      <div className="mono text-3xl font-medium">{value}</div>
      <div className="text-xs mt-2" style={{ color: '#7387A0' }}>{note}</div>
    </div>
  );
}

function Slider({ label, hint, value, setValue, min, max, step, unit, prefix }) {
  return (
    <div className="mb-7 last:mb-0">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="mono text-lg" style={{ color: '#4EA8DE' }}>
          {prefix ? `${unit}${value.toLocaleString('en-IN')}` : `${value} ${unit}`}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => setValue(Number(e.target.value))} className="w-full" />
      <div className="text-xs mt-1.5" style={{ color: '#7387A0' }}>{hint}</div>
    </div>
  );
}

function Ramp({ threshold, exitMm }) {
  const W = 240, H = 130, P = 20;
  const maxX = threshold * 1.4;
  const x = (mm) => P + (mm / maxX) * (W - P * 2);
  const y = (frac) => H - P - frac * (H - P * 2);
  const path = `M ${x(0)} ${y(1)} L ${x(exitMm)} ${y(1)} L ${x(threshold)} ${y(0)} L ${x(maxX)} ${y(0)}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <line x1={P} y1={y(0)} x2={W - P} y2={y(0)} stroke="#1F2B3A" />
      <line x1={P} y1={y(0)} x2={P} y2={y(1)} stroke="#1F2B3A" />
      <line x1={x(exitMm)} y1={y(0)} x2={x(exitMm)} y2={y(1)} stroke="#1F2B3A" strokeDasharray="2 3" />
      <line x1={x(threshold)} y1={y(0)} x2={x(threshold)} y2={y(1)} stroke="#1F2B3A" strokeDasharray="2 3" />
      <path d={path} fill="none" stroke="#C97B3C" strokeWidth="2" />
      <text x={x(exitMm)} y={H - 5} fill="#7387A0" fontSize="9" textAnchor="middle" fontFamily="IBM Plex Mono">exit</text>
      <text x={x(threshold)} y={H - 5} fill="#7387A0" fontSize="9" textAnchor="middle" fontFamily="IBM Plex Mono">trigger</text>
      <text x={P - 5} y={y(1) + 3} fill="#7387A0" fontSize="9" textAnchor="end" fontFamily="IBM Plex Mono">100%</text>
    </svg>
  );
}