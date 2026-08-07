'use client';

import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Cell,
} from 'recharts';

const API = 'https://climate-risk-api-a2xq.onrender.com';

export default function Home() {
  const [districts, setDistricts] = useState([]);
  const [selected, setSelected] = useState('vikarabad');
  const [threshold, setThreshold] = useState(650);
  const [exitMm, setExitMm] = useState(300);
  const [sumInsured, setSumInsured] = useState(20000);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API}/districts`)
      .then((r) => r.json())
      .then(setDistricts)
      .catch(() => setError('Could not load districts'));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    fetch(
      `${API}/payout/${selected}?threshold_mm=${threshold}&exit_mm=${exitMm}&sum_insured=${sumInsured}`
    )
      .then((r) => {
        if (!r.ok) throw new Error('Request failed');
        return r.json();
      })
      .then(setData)
      .catch(() =>
        setError('Could not load data. The API may be waking up — try again in 30s.')
      )
      .finally(() => setLoading(false));
  }, [selected, threshold, exitMm, sumInsured]);

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">
            Parametric Climate Risk Simulator
          </h1>
          <p className="text-slate-600 mt-2">
            District-level rainfall analytics and payout modelling for Indian
            agriculture, based on 20 years of observed data.
          </p>
        </header>

        <section className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                District
              </label>
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2"
              >
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Trigger (mm)
              </label>
              <input
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Exit (mm)
              </label>
              <input
                type="number"
                value={exitMm}
                onChange={(e) => setExitMm(Number(e.target.value))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Sum Insured (₹)
              </label>
              <input
                type="number"
                value={sumInsured}
                onChange={(e) => setSumInsured(Number(e.target.value))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2"
              />
            </div>
          </div>
        </section>

        {loading && (
          <div className="text-slate-500 py-10 text-center">Loading…</div>
        )}

        {error && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-4 mb-6">
            {error}
          </div>
        )}

        {data && !loading && (
          <>
            <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Stat label="Trigger rate" value={`${data.trigger_rate_pct}%`} />
              <Stat
                label="Years triggered"
                value={`${data.trigger_years} / ${data.years_analysed}`}
              />
              <Stat
                label="Avg annual payout"
                value={`₹${data.avg_annual_payout_inr.toLocaleString('en-IN')}`}
              />
              <Stat label="Burn rate" value={`${data.burn_rate_pct}%`} />
            </section>

            <section className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
              <h2 className="font-semibold text-slate-900 mb-1">
                Monsoon rainfall vs trigger
              </h2>
              <p className="text-sm text-slate-500 mb-4">
                Red bars fall below the trigger and generate a payout.
              </p>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.yearly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <ReferenceLine y={threshold} stroke="#dc2626" strokeDasharray="4 4" />
                  <Bar dataKey="monsoon_rainfall_mm">
                    {data.yearly.map((entry, i) => (
                      <Cell key={i} fill={entry.triggered ? '#dc2626' : '#0284c7'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </section>

            <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="text-left px-4 py-3">Year</th>
                    <th className="text-right px-4 py-3">Rainfall (mm)</th>
                    <th className="text-right px-4 py-3">Payout (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.yearly.map((y) => (
                    <tr key={y.year} className="border-t border-slate-100">
                      <td className="px-4 py-2">{y.year}</td>
                      <td className="text-right px-4 py-2">{y.monsoon_rainfall_mm}</td>
                      <td
                        className={`text-right px-4 py-2 ${y.triggered ? 'text-red-600 font-medium' : 'text-slate-400'
                          }`}
                      >
                        {y.payout_inr.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-2xl font-semibold text-slate-900 mt-1">{value}</div>
    </div>
  );
}