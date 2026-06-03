import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api, downloadFile } from '../api/client.js';
import { socket } from '../api/socket.js';
import { StatusBadge, StatCard, Spinner, Progress, useToast, fmt, pct, dt } from '../components/ui.jsx';

const STATUS_TABS = ['all', 'queued', 'sent', 'delivered', 'read', 'failed'];

export default function CampaignDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [campaign, setCampaign] = useState(null);
  const [breakdown, setBreakdown] = useState({});
  const [messages, setMessages] = useState([]);
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const loadCampaign = useCallback(async () => {
    const { data } = await api.get(`/analytics/campaigns/${id}`);
    setCampaign(data.campaign);
    setBreakdown(data.statusBreakdown);
    setLoading(false);
  }, [id]);

  const loadMessages = useCallback(async () => {
    const { data } = await api.get(`/campaigns/${id}/messages`, {
      params: { status: tab === 'all' ? undefined : tab, page, limit: 50 },
    });
    setMessages(data.items);
    setPages(data.pages);
  }, [id, tab, page]);

  useEffect(() => { loadCampaign(); }, [loadCampaign]);
  useEffect(() => { loadMessages(); }, [loadMessages]);

  // Real-time: refresh counters + visible message list as events stream in.
  useEffect(() => {
    const onMsg = (evt) => {
      if (evt.campaignId !== id) return;
      loadCampaign();
      loadMessages();
    };
    socket.on('message:status', onMsg);
    socket.on('campaign:counters', onMsg);
    return () => {
      socket.off('message:status', onMsg);
      socket.off('campaign:counters', onMsg);
    };
  }, [id, loadCampaign, loadMessages]);

  const send = async () => {
    try {
      await api.post(`/campaigns/${id}/send`);
      toast('Campaign queued for sending', '🚀');
      loadCampaign();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed', '⚠️');
    }
  };

  const duplicate = async () => {
    try {
      const { data } = await api.post(`/campaigns/${id}/duplicate`);
      toast('Campaign duplicated as draft', '📋');
      nav(`/campaigns/${data._id}`);
    } catch (err) {
      toast(err.response?.data?.error || 'Failed', '⚠️');
    }
  };

  const retryFailed = async () => {
    try {
      const { data } = await api.post(`/campaigns/${id}/retry-failed`);
      toast(data.message, '🔁');
      loadCampaign();
      loadMessages();
    } catch (err) {
      toast(err.response?.data?.error || 'Failed', '⚠️');
    }
  };

  const remove = async () => {
    if (!confirm('Delete this campaign and all its message records?')) return;
    try {
      await api.delete(`/campaigns/${id}`);
      toast('Campaign deleted', '🗑️');
      nav('/campaigns');
    } catch (err) {
      toast(err.response?.data?.error || 'Failed', '⚠️');
    }
  };

  const exportReport = () => {
    downloadFile(`/analytics/campaigns/${id}/export`, `campaign-${id}.csv`);
    toast('Exporting report…', '📤');
  };

  if (loading || !campaign) return <Spinner />;

  const done = campaign.sentCount + campaign.failedCount;
  const progress = campaign.totalRecipients ? (done / campaign.totalRecipients) * 100 : 0;
  const canSend = ['draft', 'scheduled', 'queued'].includes(campaign.status);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="flex items-center gap" style={{ marginBottom: 6 }}>
            <Link to="/campaigns" className="btn btn-ghost btn-sm">← Campaigns</Link>
            <StatusBadge status={campaign.status} />
          </div>
          <h1>{campaign.name}</h1>
          <div className="sub">Created {dt(campaign.createdAt)} · {fmt(campaign.totalRecipients)} recipients</div>
        </div>
        <div className="flex gap" style={{ flexWrap: 'wrap' }}>
          {canSend && <button className="btn btn-primary" onClick={send}>🚀 Send now</button>}
          {['draft', 'scheduled'].includes(campaign.status) && (
            <button className="btn" onClick={() => nav(`/campaigns/new?edit=${id}`)}>✏️ Edit</button>
          )}
          {campaign.failedCount > 0 && (
            <button className="btn" onClick={retryFailed}>🔁 Retry failed ({fmt(campaign.failedCount)})</button>
          )}
          <button className="btn" onClick={duplicate}>📋 Duplicate</button>
          <button className="btn" onClick={exportReport}>📤 Export</button>
          {campaign.status !== 'sending' && (
            <button className="btn btn-danger" onClick={remove}>🗑️ Delete</button>
          )}
        </div>
      </div>

      <div className="grid grid-4 mb">
        <StatCard label="Recipients" value={fmt(campaign.totalRecipients)} icon="◍" tone="violet" />
        <StatCard label="Sent" value={fmt(campaign.sentCount)} meta={pct(campaign.totalRecipients ? campaign.sentCount / campaign.totalRecipients : 0)} icon="➤" tone="blue" />
        <StatCard label="Delivered" value={fmt(campaign.deliveredCount)} meta={pct(campaign.sentCount ? campaign.deliveredCount / campaign.sentCount : 0)} icon="✓" tone="green" />
        <StatCard label="Failed" value={fmt(campaign.failedCount)} icon="⚠" tone="red" />
      </div>

      <div className="card card-pad mb">
        <div className="flex between items-center mb">
          <h3>Sending progress</h3>
          <span className="muted">{fmt(done)} / {fmt(campaign.totalRecipients)} processed</span>
        </div>
        <Progress value={progress} />
        <div className="grid grid-4 mt" style={{ gap: 10 }}>
          {['read', 'delivered', 'sent', 'failed'].map((s) => (
            <div key={s} className="flex between" style={{ fontSize: 13 }}>
              <span className="muted" style={{ textTransform: 'capitalize' }}>{s}</span>
              <span className="t-strong">{fmt(breakdown[s] || 0)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Message Tracking</h3>
          <div className="flex gap">
            {STATUS_TABS.map((t) => (
              <button key={t} className={`btn btn-sm ${tab === t ? 'btn-accent' : 'btn-ghost'}`}
                onClick={() => { setTab(t); setPage(1); }}>
                {t === 'all' ? 'All' : t[0].toUpperCase() + t.slice(1)}
                {t !== 'all' && breakdown[t] ? ` (${fmt(breakdown[t])})` : ''}
              </button>
            ))}
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Recipient</th><th>Phone</th><th>Status</th>
                <th>Message ID</th><th>Sent</th><th>Delivered</th><th>Read</th><th>Error</th>
              </tr>
            </thead>
            <tbody>
              {messages.length === 0 && (
                <tr><td colSpan={8}><div className="empty"><div className="big">🔍</div>No messages in this view yet.</div></td></tr>
              )}
              {messages.map((m) => (
                <tr key={m._id}>
                  <td className="t-strong">{m.studentId?.name || '—'}</td>
                  <td className="mono">{m.phone}</td>
                  <td><StatusBadge status={m.status} /></td>
                  <td className="mono t-muted" title={m.messageId}>{m.messageId ? `${m.messageId.slice(0, 16)}…` : '—'}</td>
                  <td className="t-muted">{m.sentAt ? dt(m.sentAt) : '—'}</td>
                  <td className="t-muted">{m.deliveredAt ? dt(m.deliveredAt) : '—'}</td>
                  <td className="t-muted">{m.readAt ? dt(m.readAt) : '—'}</td>
                  <td style={{ color: 'var(--danger)', fontSize: 12 }}>{m.error || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pagination">
          <button className="btn btn-sm btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
          <span>Page {page} of {pages}</span>
          <button className="btn btn-sm btn-ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      </div>
    </>
  );
}
