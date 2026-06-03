import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client.js';
import { StatusBadge, Spinner, Modal, useToast, dt } from '../components/ui.jsx';

const EMPTY = { name: '', content: '', metaTemplateName: '', language: 'en_US', category: 'UTILITY', status: 'active' };

export default function Templates() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | {} (new) | template

  const load = useCallback(async () => {
    const { data } = await api.get('/templates');
    setItems(data.items);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!editing.name || !editing.content) return toast('Name and content are required', '⚠️');
    try {
      if (editing._id) await api.put(`/templates/${editing._id}`, editing);
      else await api.post('/templates', editing);
      toast('Template saved', '✅');
      setEditing(null);
      load();
    } catch (err) {
      toast(err.response?.data?.error || 'Save failed', '⚠️');
    }
  };

  const del = async (id) => {
    await api.delete(`/templates/${id}`);
    toast('Template deleted', '🗑️');
    load();
  };

  const detectedVars = editing ? [...new Set([...editing.content.matchAll(/{{\s*([\w.]+)\s*}}/g)].map((m) => m[1]))] : [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Message Templates</h1>
          <div className="sub">Reusable WhatsApp templates with {'{{variable}}'} personalisation.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({ ...EMPTY })}>＋ New template</button>
      </div>

      {loading ? <Spinner /> : (
        <div className="grid grid-3">
          {items.length === 0 && <div className="empty"><div className="big">❏</div>No templates yet.</div>}
          {items.map((t) => (
            <div className="card card-pad" key={t._id}>
              <div className="flex between items-center mb">
                <h3 style={{ fontSize: 15 }}>{t.name}</h3>
                <StatusBadge status={t.status} />
              </div>
              <div className="card-pad" style={{ background: 'var(--brand-soft)', borderRadius: 10, fontSize: 13, minHeight: 70 }}>
                {t.content}
              </div>
              <div className="flex gap" style={{ flexWrap: 'wrap', margin: '12px 0' }}>
                {t.variables?.map((v) => <span key={v} className="badge b-neutral">{`{{${v}}}`}</span>)}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {t.metaTemplateName ? `Meta: ${t.metaTemplateName} · ${t.language}` : 'No Meta template linked'}
              </div>
              <div className="flex gap mt">
                <button className="btn btn-sm" onClick={() => setEditing(t)}>Edit</button>
                <button className="btn btn-sm btn-danger" onClick={() => del(t._id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Modal title={editing._id ? 'Edit template' : 'New template'} onClose={() => setEditing(null)} width={580}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}>Save template</button>
          </>}>
          <div className="field">
            <label>Name *</label>
            <input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </div>
          <div className="field">
            <label>Content *</label>
            <textarea className="textarea" value={editing.content}
              placeholder="Hi {{name}}, your {{course}} class starts tomorrow at 10 AM."
              onChange={(e) => setEditing({ ...editing, content: e.target.value })} />
            <div className="hint">
              {detectedVars.length ? <>Detected variables: {detectedVars.map((v) => <span key={v} className="badge b-neutral" style={{ marginRight: 6 }}>{`{{${v}}}`}</span>)}</> : 'Use {{name}}, {{course}}, {{batch}}, {{city}} for personalisation.'}
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>Meta template name</label>
              <input className="input" value={editing.metaTemplateName}
                placeholder="approved_template_name"
                onChange={(e) => setEditing({ ...editing, metaTemplateName: e.target.value })} />
              <div className="hint">Required for cold sends (outside 24h window).</div>
            </div>
            <div className="field">
              <label>Language</label>
              <input className="input" value={editing.language} onChange={(e) => setEditing({ ...editing, language: e.target.value })} />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>Category</label>
              <select className="select" value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })}>
                <option>UTILITY</option><option>MARKETING</option><option>AUTHENTICATION</option>
              </select>
            </div>
            <div className="field">
              <label>Status</label>
              <select className="select" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                <option value="active">Active</option><option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
