import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useToast, fmt } from '../components/ui.jsx';

export default function CampaignCreate() {
  const nav = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');

  const [templates, setTemplates] = useState([]);
  const [filters, setFilters] = useState({ courses: [], batches: [], cities: [] });
  const [form, setForm] = useState({ name: '', templateId: '' });
  const [segment, setSegment] = useState({ course: '', batch: '', city: '', status: 'active' });
  const [mode, setMode] = useState('now'); // now | schedule | draft
  const [scheduledAt, setScheduledAt] = useState('');
  const [audience, setAudience] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/templates').then((r) => setTemplates(r.data.items));
    api.get('/students/filters').then((r) => setFilters(r.data));
  }, []);

  // Edit mode: hydrate the form from an existing draft/scheduled campaign.
  useEffect(() => {
    if (!editId) return;
    api.get(`/campaigns/${editId}`).then((r) => {
      const c = r.data;
      setForm({ name: c.name, templateId: c.templateId?._id || c.templateId });
      setSegment({ course: '', batch: '', city: '', status: 'active', ...(c.segment || {}) });
      if (c.scheduledAt) {
        setMode('schedule');
        setScheduledAt(new Date(c.scheduledAt).toISOString().slice(0, 16));
      } else {
        setMode('draft');
      }
    });
  }, [editId]);

  // Live audience count whenever the segment changes.
  useEffect(() => {
    const seg = cleanSegment(segment);
    const t = setTimeout(() => {
      api.post('/campaigns/preview-audience', { segment: seg }).then((r) => setAudience(r.data.count));
    }, 350);
    return () => clearTimeout(t);
  }, [segment]);

  const cleanSegment = (s) => Object.fromEntries(Object.entries(s).filter(([, v]) => v));

  const selectedTemplate = templates.find((t) => t._id === form.templateId);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.templateId) return toast('Name and template are required', '⚠️');
    setBusy(true);
    try {
      const payload = {
        name: form.name,
        templateId: form.templateId,
        segment: cleanSegment(segment),
        sendNow: mode === 'now',
        scheduledAt: mode === 'schedule' ? scheduledAt : null,
      };
      let campaignId = editId;
      if (editId) {
        // Update the existing draft; then optionally launch it now.
        await api.put(`/campaigns/${editId}`, payload);
        if (mode === 'now') await api.post(`/campaigns/${editId}/send`);
        toast('Campaign updated', '✅');
      } else {
        const { data } = await api.post('/campaigns', payload);
        campaignId = data._id;
        toast(mode === 'now' ? 'Campaign queued for sending' : 'Campaign saved', '🚀');
      }
      nav(`/campaigns/${campaignId}`);
    } catch (err) {
      toast(err.response?.data?.error || 'Failed to save campaign', '⚠️');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{editId ? 'Edit Campaign' : 'New Campaign'}</h1>
          <div className="sub">Choose a template, target an audience, and send.</div>
        </div>
        <button className="btn btn-ghost" onClick={() => nav('/campaigns')}>← Back</button>
      </div>

      <form onSubmit={submit} className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="card card-pad">
          <h3 style={{ marginBottom: 16 }}>Campaign details</h3>
          <div className="field">
            <label>Campaign name</label>
            <input className="input" value={form.name} placeholder="e.g. JEE Batch Reminder"
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label>Message template</label>
            <select className="select" value={form.templateId} onChange={(e) => setForm({ ...form, templateId: e.target.value })}>
              <option value="">Select a template…</option>
              {templates.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
          </div>
          {selectedTemplate && (
            <div className="field">
              <label>Preview</label>
              <div className="card-pad" style={{ background: 'var(--brand-soft)', borderRadius: 12, fontSize: 13.5 }}>
                {selectedTemplate.content}
              </div>
              {!selectedTemplate.metaTemplateName && (
                <div className="hint" style={{ color: 'var(--warn)' }}>
                  ⚠ No Meta template name set — only deliverable inside an open 24h session window.
                </div>
              )}
            </div>
          )}

          <h3 style={{ margin: '22px 0 16px' }}>Audience segmentation</h3>
          <div className="row">
            <div className="field">
              <label>Course</label>
              <select className="select" value={segment.course} onChange={(e) => setSegment({ ...segment, course: e.target.value })}>
                <option value="">All</option>
                {filters.courses.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Batch</label>
              <select className="select" value={segment.batch} onChange={(e) => setSegment({ ...segment, batch: e.target.value })}>
                <option value="">All</option>
                {filters.batches.map((b) => <option key={b}>{b}</option>)}
              </select>
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>City</label>
              <select className="select" value={segment.city} onChange={(e) => setSegment({ ...segment, city: e.target.value })}>
                <option value="">All</option>
                {filters.cities.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Status</label>
              <select className="select" value={segment.status} onChange={(e) => setSegment({ ...segment, status: e.target.value })}>
                <option value="">Any</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>

        <div className="card card-pad" style={{ position: 'sticky', top: 90 }}>
          <h3 style={{ marginBottom: 16 }}>Audience &amp; delivery</h3>
          <div className="card-pad" style={{ background: 'var(--accent-soft)', borderRadius: 12, textAlign: 'center', marginBottom: 18 }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase' }}>Estimated recipients</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--accent)' }}>
              {audience == null ? '…' : fmt(audience)}
            </div>
          </div>

          <div className="field">
            <label>Delivery</label>
            {[
              ['now', '🚀 Send immediately'],
              ['schedule', '🕑 Schedule for later'],
              ['draft', '📝 Save as draft'],
            ].map(([val, label]) => (
              <label key={val} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', fontWeight: 500 }}>
                <input type="radio" name="mode" checked={mode === val} onChange={() => setMode(val)} />
                {label}
              </label>
            ))}
          </div>

          {mode === 'schedule' && (
            <div className="field">
              <label>Scheduled time</label>
              <input className="input" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            </div>
          )}

          <button className="btn btn-primary mt" style={{ width: '100%', justifyContent: 'center' }} disabled={busy || !audience}>
            {busy ? 'Working…' : mode === 'now' ? `Send to ${fmt(audience || 0)} recipients` : mode === 'schedule' ? 'Schedule campaign' : 'Save draft'}
          </button>
        </div>
      </form>
    </>
  );
}
