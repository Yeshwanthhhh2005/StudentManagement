import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { api } from '../api/client.js';
import { socket } from '../api/socket.js';
import { StatCard, StatusBadge, Spinner, fmt, pct } from '../components/ui.jsx';

const FUNNEL_COLORS = ['#4f46e5', '#2563eb', '#25d366', '#16a34a', '#dc2626'];

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [overview, rc] = await Promise.all([
      api.get('/analytics/overview'),
      api.get('/analytics/recent-campaigns'),
    ]);
    setData(overview.data);
    setRecent(rc.data.items);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // Refresh metrics whenever the worker/webhook reports progress.
    const onUpdate = () => load();
    socket.on('campaign:counters', onUpdate);
    socket.on('campaign:enqueued', onUpdate);
    const poll = setInterval(load, 15000);
    return () => {
      socket.off('campaign:counters', onUpdate);
      clearInterval(poll);
    };
  }, [load]);

  if (loading) return <Spinner />;

  const funnel = [
    { name: 'Recipients', value: data.totalRecipients },
    { name: 'Sent', value: data.sent },
    { name: 'Delivered', value: data.delivered },
    { name: 'Read', value: data.read },
    { name: 'Failed', value: data.failed },
  ];
  const pie = [
    { name: 'Delivered', value: data.delivered },
    { name: 'Read', value: data.read },
    { name: 'Failed', value: data.failed },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <div className="sub">Campaign performance and delivery analytics across the platform.</div>
        </div>
        <Link to="/campaigns/new" className="btn btn-primary">＋ New Campaign</Link>
      </div>

      <div className="grid grid-4 mb">
        <StatCard label="Students" value={fmt(data.students)} meta="Total in database" icon="◍" tone="violet" />
        <StatCard label="Campaigns" value={fmt(data.campaigns)} meta="All time" icon="✉" tone="blue" />
        <StatCard label="Messages Sent" value={fmt(data.sent)} meta={`${fmt(data.totalRecipients)} recipients`} icon="➤" tone="green" />
        <StatCard label="Failed" value={fmt(data.failed)} meta="Delivery failures" icon="⚠" tone="red" />
      </div>

      <div className="grid grid-3 mb">
        <StatCard label="Delivery Rate" value={pct(data.deliveryRate)} meta="Delivered / Sent" icon="✓" tone="green" />
        <StatCard label="Read Rate" value={pct(data.readRate)} meta="Read / Delivered" icon="👁" tone="blue" />
        <StatCard label="Delivered" value={fmt(data.delivered)} meta={`${fmt(data.read)} read`} icon="✉" tone="violet" />
      </div>

      <div className="grid grid-2 mb">
        <div className="card">
          <div className="card-head"><h3>Delivery Funnel</h3></div>
          <div className="card-pad" style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnel} margin={{ top: 8, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f5" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => fmt(v)} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {funnel.map((_e, i) => <Cell key={i} fill={FUNNEL_COLORS[i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Outcome Split</h3></div>
          <div className="card-pad" style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" innerRadius={64} outerRadius={96} paddingAngle={3}>
                  {pie.map((_e, i) => <Cell key={i} fill={['#25d366', '#16a34a', '#dc2626'][i]} />)}
                </Pie>
                <Legend />
                <Tooltip formatter={(v) => fmt(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Recent Campaigns</h3>
          <Link to="/campaigns" className="btn btn-ghost btn-sm">View all →</Link>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Campaign</th><th>Status</th><th>Recipients</th><th>Sent</th>
                <th>Delivered</th><th>Read</th><th>Delivery</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr><td colSpan={7}><div className="empty"><div className="big">📭</div>No campaigns yet</div></td></tr>
              )}
              {recent.map((c) => (
                <tr key={c._id}>
                  <td className="t-strong"><Link to={`/campaigns/${c._id}`}>{c.name}</Link></td>
                  <td><StatusBadge status={c.status} /></td>
                  <td>{fmt(c.totalRecipients)}</td>
                  <td>{fmt(c.sentCount)}</td>
                  <td>{fmt(c.deliveredCount)}</td>
                  <td>{fmt(c.readCount)}</td>
                  <td className="t-muted">{pct(c.sentCount ? c.deliveredCount / c.sentCount : 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
