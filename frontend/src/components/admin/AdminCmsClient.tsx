'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { useAdminUi } from '@/components/admin/AdminUiProvider';
import { adminGet, adminSend, adminUpload } from '@/lib/admin';
import { apiGet, type ContentBlock, type HeroData, parseBlockData } from '@/lib/api';
import { Button } from '@/components/ui';

export function AdminHeroEditorClient() {
  const { ready, toast } = useAdminUi();
  const [headline, setHeadline] = useState('');
  const [subheadline, setSubheadline] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready) return;
    void apiGet<ContentBlock<unknown>>('/content/blocks/hero').then((block) => {
      const data = parseBlockData<HeroData>(block.data);
      setHeadline(data.headline || '');
      setSubheadline(data.subheadline || '');
    });
  }, [ready]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const block = await apiGet<ContentBlock<unknown>>('/content/blocks/hero');
      const data = parseBlockData<HeroData>(block.data);
      await adminSend('/content/blocks/hero', 'PUT', {
        data: { ...data, headline, subheadline },
        is_active: true,
      });
      toast('Content saved', 'content-saved-toast');
    } catch {
      toast('Could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell title="Hero editor">
      <form className="admin-form" onSubmit={(e) => void onSubmit(e)}>
        <label className="admin-field">
          <span className="ds-label">Headline</span>
          <input
            className="admin-input"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            data-testid="hero-headline-input"
          />
        </label>
        <label className="admin-field">
          <span className="ds-label">Subheadline</span>
          <input
            className="admin-input"
            value={subheadline}
            onChange={(e) => setSubheadline(e.target.value)}
          />
        </label>
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={busy}
          data-testid="save-content-block"
        >
          Save
        </Button>
      </form>
    </AdminShell>
  );
}

type AnnouncementData = { messages?: string[] };

export function AdminAnnouncementEditorClient() {
  const { ready, toast } = useAdminUi();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready) return;
    void apiGet<ContentBlock<unknown>>('/content/blocks/announcement_bar').then((block) => {
      const data = parseBlockData<AnnouncementData>(block.data);
      setMessage(data.messages?.[0] || '');
    });
  }, [ready]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await adminSend('/content/blocks/announcement_bar', 'PUT', {
        data: { messages: [message] },
        is_active: true,
      });
      toast('Announcement saved', 'content-saved-toast');
    } catch {
      toast('Could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell title="Announcement bar">
      <form className="admin-form" onSubmit={(e) => void onSubmit(e)}>
        <label className="admin-field">
          <span className="ds-label">Message</span>
          <input className="admin-input" value={message} onChange={(e) => setMessage(e.target.value)} />
        </label>
        <Button type="submit" variant="primary" size="md" disabled={busy} data-testid="save-content-block">
          Save
        </Button>
      </form>
    </AdminShell>
  );
}

type Highlight = {
  id: string;
  title: string;
  media_url: string;
  link_url?: string | null;
  position: number;
};

export function AdminHighlightsClient() {
  const { ready, toast } = useAdminUi();
  const [items, setItems] = useState<Highlight[]>([]);
  const [busy, setBusy] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newLink, setNewLink] = useState('');
  const [newMediaUrl, setNewMediaUrl] = useState('');

  async function reload() {
    const d = await adminGet<{ highlights: Highlight[] }>('/content/highlights');
    setItems(d.highlights);
  }

  useEffect(() => {
    if (!ready) return;
    void reload();
  }, [ready]);

  async function uploadMedia(file: File, folder = 'cms/highlights'): Promise<string> {
    const form = new FormData();
    form.append('file', file);
    form.append('folder', folder);
    const res = await adminUpload<{ url: string }>('/content/media', form);
    return res.url;
  }

  async function saveHighlight(h: Highlight) {
    setBusy(true);
    try {
      await adminSend(`/content/highlights/${h.id}`, 'PUT', {
        title: h.title,
        media_url: h.media_url,
        link_url: h.link_url || null,
        position: h.position,
        is_active: true,
      });
      toast('Highlight saved', 'content-saved-toast');
      await reload();
    } catch {
      toast('Could not save highlight');
    } finally {
      setBusy(false);
    }
  }

  async function onReplaceImage(h: Highlight, files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const url = await uploadMedia(files[0]);
      const next = { ...h, media_url: url };
      setItems((prev) => prev.map((item) => (item.id === h.id ? next : item)));
      await adminSend(`/content/highlights/${h.id}`, 'PUT', {
        title: next.title,
        media_url: next.media_url,
        link_url: next.link_url || null,
        position: next.position,
        is_active: true,
      });
      toast('Image updated', 'content-saved-toast');
      await reload();
    } catch {
      toast('Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function move(id: string, dir: -1 | 1) {
    const idx = items.findIndex((h) => h.id === id);
    const swap = items[idx + dir];
    if (!swap) return;
    setBusy(true);
    try {
      await adminSend(`/content/highlights/${id}`, 'PUT', {
        title: items[idx].title,
        media_url: items[idx].media_url,
        link_url: items[idx].link_url || null,
        position: swap.position,
        is_active: true,
      });
      await adminSend(`/content/highlights/${swap.id}`, 'PUT', {
        title: swap.title,
        media_url: swap.media_url,
        link_url: swap.link_url || null,
        position: items[idx].position,
        is_active: true,
      });
      await reload();
    } catch {
      toast('Could not reorder');
    } finally {
      setBusy(false);
    }
  }

  async function removeHighlight(id: string) {
    setBusy(true);
    try {
      await adminSend(`/content/highlights/${id}`, 'DELETE');
      toast('Highlight removed');
      await reload();
    } catch {
      toast('Could not remove');
    } finally {
      setBusy(false);
    }
  }

  async function onNewImage(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const url = await uploadMedia(files[0]);
      setNewMediaUrl(url);
      toast('Image uploaded');
    } catch {
      toast('Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function createHighlight(e: FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || !newMediaUrl) {
      toast('Title and image are required');
      return;
    }
    setBusy(true);
    try {
      const nextPos =
        items.reduce((max, h) => (h.position > max ? h.position : max), 0) + 1;
      await adminSend('/content/highlights', 'POST', {
        title: newTitle.trim(),
        media_url: newMediaUrl,
        link_url: newLink.trim() || null,
        position: nextPos,
        is_active: true,
      });
      setNewTitle('');
      setNewLink('');
      setNewMediaUrl('');
      toast('Highlight created', 'content-saved-toast');
      await reload();
    } catch {
      toast('Could not create highlight');
    } finally {
      setBusy(false);
    }
  }

  function updateLocal(id: string, patch: Partial<Highlight>) {
    setItems((prev) => prev.map((h) => (h.id === id ? { ...h, ...patch } : h)));
  }

  return (
    <AdminShell title="Highlights">
      <ul className="admin-hero-slides">
        {items.map((h) => (
          <li key={h.id} className="admin-hero-slide" data-testid="highlight-row">
            {h.media_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={h.media_url} alt="" className="admin-hero-slide__img" />
            ) : (
              <span className="admin-hero-slide__img admin-product-thumb--empty" />
            )}
            <div className="admin-cell-stack" style={{ gap: 'var(--space-2)' }}>
              <label className="admin-field">
                <span className="ds-label">Title</span>
                <input
                  className="admin-input"
                  value={h.title}
                  disabled={busy}
                  onChange={(e) => updateLocal(h.id, { title: e.target.value })}
                />
              </label>
              <label className="admin-field">
                <span className="ds-label">Link URL</span>
                <input
                  className="admin-input"
                  value={h.link_url || ''}
                  disabled={busy}
                  onChange={(e) => updateLocal(h.id, { link_url: e.target.value })}
                  placeholder="/shop"
                />
              </label>
              <label className="admin-field">
                <span className="ds-label">Replace image</span>
                <input
                  type="file"
                  accept="image/*"
                  disabled={busy}
                  data-testid="highlight-image-upload"
                  onChange={(e) => {
                    void onReplaceImage(h, e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
              <div className="admin-hero-slide__actions">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={busy}
                  onClick={() => void saveHighlight(h)}
                >
                  Save
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void move(h.id, -1)}
                >
                  Up
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void move(h.id, 1)}
                >
                  Down
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={busy}
                  onClick={() => void removeHighlight(h.id)}
                >
                  Remove
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <section className="admin-panel" style={{ marginTop: 'var(--space-8)' }}>
        <div className="admin-panel__head">
          <h2>Add highlight</h2>
        </div>
        <form className="admin-form admin-form--wide" onSubmit={(e) => void createHighlight(e)}>
          <label className="admin-field">
            <span className="ds-label">Title</span>
            <input
              className="admin-input"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              required
            />
          </label>
          <label className="admin-field">
            <span className="ds-label">Link URL</span>
            <input
              className="admin-input"
              value={newLink}
              onChange={(e) => setNewLink(e.target.value)}
              placeholder="/shop"
            />
          </label>
          <label className="admin-field">
            <span className="ds-label">Image</span>
            <input
              type="file"
              accept="image/*"
              disabled={busy}
              onChange={(e) => {
                void onNewImage(e.target.files);
                e.target.value = '';
              }}
            />
            {newMediaUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={newMediaUrl} alt="" className="admin-hero-slide__img" />
            ) : (
              <p className="ds-caption">Upload an image before creating.</p>
            )}
          </label>
          <Button type="submit" variant="primary" size="md" disabled={busy || !newMediaUrl}>
            Create highlight
          </Button>
        </form>
      </section>
    </AdminShell>
  );
}

type BlogPost = {
  id: string;
  title: string;
  slug: string;
  body: string;
  cover_image?: string | null;
  status: string;
  published_at?: string | null;
};

const emptyPost = {
  title: '',
  slug: '',
  body: '',
  cover_image: '',
  status: 'draft',
};

export function AdminBlogClient() {
  const { ready, toast } = useAdminUi();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyPost);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const r = await adminGet<{ posts: BlogPost[] }>('/blog');
    setPosts(r.posts);
  }

  useEffect(() => {
    if (!ready) return;
    void refresh();
  }, [ready]);

  function startCreate() {
    setEditingId(null);
    setForm(emptyPost);
  }

  function startEdit(p: BlogPost) {
    setEditingId(p.id);
    setForm({
      title: p.title,
      slug: p.slug,
      body: p.body || '',
      cover_image: p.cover_image || '',
      status: p.status || 'draft',
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const cover = form.cover_image.trim();
      const payload = {
        title: form.title.trim(),
        slug: form.slug.trim(),
        body: form.body.trim(),
        cover_image: cover ? cover : null,
        status: form.status,
        published_at:
          form.status === 'published' ? new Date().toISOString() : null,
      };
      if (editingId) {
        await adminSend(`/blog/${editingId}`, 'PUT', payload);
        toast('Post updated', 'content-saved-toast');
      } else {
        await adminSend('/blog', 'POST', payload);
        toast('Post created', 'content-saved-toast');
      }
      await refresh();
      startCreate();
    } catch {
      toast('Could not save post');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    setBusy(true);
    try {
      await adminSend(`/blog/${id}`, 'DELETE');
      toast('Post deleted', 'content-saved-toast');
      if (editingId === id) startCreate();
      await refresh();
    } catch {
      toast('Could not delete post');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell title="Style guide / Blog">
      <form className="admin-form" onSubmit={(e) => void onSubmit(e)}>
        <p className="ds-caption">
          {editingId ? 'Editing post' : 'New post'} — shown on the landing Style guide section when published.
        </p>
        <label className="admin-field">
          <span className="ds-label">Title</span>
          <input
            className="admin-input"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
          />
        </label>
        <label className="admin-field">
          <span className="ds-label">Slug</span>
          <input
            className="admin-input"
            value={form.slug}
            onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
            required
          />
        </label>
        <label className="admin-field">
          <span className="ds-label">Cover image URL</span>
          <input
            className="admin-input"
            value={form.cover_image}
            onChange={(e) => setForm((f) => ({ ...f, cover_image: e.target.value }))}
            placeholder="http://localhost:9000/ecommerce/cms/..."
          />
        </label>
        <label className="admin-field">
          <span className="ds-label">Body</span>
          <textarea
            className="admin-textarea"
            rows={8}
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            required
          />
        </label>
        <label className="admin-field">
          <span className="ds-label">Status</span>
          <select
            className="admin-input"
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="draft">draft</option>
            <option value="published">published</option>
          </select>
        </label>
        <div className="admin-actions">
          <Button type="submit" variant="primary" size="md" disabled={busy}>
            {editingId ? 'Save post' : 'Create post'}
          </Button>
          {editingId ? (
            <Button type="button" variant="secondary" size="md" onClick={startCreate}>
              Cancel
            </Button>
          ) : null}
        </div>
      </form>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {posts.map((p) => (
            <tr key={p.id}>
              <td>{p.title}</td>
              <td>{p.status}</td>
              <td>
                <Button type="button" variant="ghost" size="sm" onClick={() => startEdit(p)}>
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={busy}
                  onClick={() => void onDelete(p.id)}
                >
                  Delete
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminShell>
  );
}

export function AdminStatsClient() {
  const { ready, toast } = useAdminUi();
  const [key, setKey] = useState('items_sold_total');
  const [value, setValue] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await adminSend(`/content/stats/${key}`, 'PUT', {
      value: Number(value),
      is_manual_override: true,
    });
    toast('Stat updated', 'content-saved-toast');
  }

  return (
    <AdminShell title="Stats counters">
      <form className="admin-form" onSubmit={(e) => void onSubmit(e)}>
        <label className="admin-field">
          <span className="ds-label">Key</span>
          <input className="admin-input" value={key} onChange={(e) => setKey(e.target.value)} />
        </label>
        <label className="admin-field">
          <span className="ds-label">Value</span>
          <input className="admin-input" value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <Button type="submit" variant="primary" size="md" disabled={!ready}>
          Save override
        </Button>
      </form>
    </AdminShell>
  );
}

export function AdminShelvesClient() {
  const { ready, toast } = useAdminUi();
  const [key, setKey] = useState('new_arrivals');
  const [productIds, setProductIds] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const ids = productIds.split(',').map((s) => s.trim()).filter(Boolean);
    await adminSend(`/content/shelves/${key}`, 'PUT', {
      title: key,
      product_ids: ids,
      is_active: true,
    });
    toast('Shelf updated', 'content-saved-toast');
  }

  return (
    <AdminShell title="Curated shelves">
      <form className="admin-form" onSubmit={(e) => void onSubmit(e)}>
        <label className="admin-field">
          <span className="ds-label">Shelf key</span>
          <input className="admin-input" value={key} onChange={(e) => setKey(e.target.value)} />
        </label>
        <label className="admin-field">
          <span className="ds-label">Product IDs (comma-separated)</span>
          <input
            className="admin-input"
            value={productIds}
            onChange={(e) => setProductIds(e.target.value)}
          />
        </label>
        <Button type="submit" variant="primary" size="md" disabled={!ready}>
          Save shelf
        </Button>
      </form>
    </AdminShell>
  );
}
