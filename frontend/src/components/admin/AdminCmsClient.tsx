'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { useAdminUi } from '@/components/admin/AdminUiProvider';
import { adminGet, adminSend } from '@/lib/admin';
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
  position: number;
};

export function AdminHighlightsClient() {
  const { ready } = useAdminUi();
  const [items, setItems] = useState<Highlight[]>([]);

  async function reload() {
    const d = await adminGet<{ highlights: Highlight[] }>('/content/highlights');
    setItems(d.highlights);
  }

  useEffect(() => {
    if (!ready) return;
    void reload();
  }, [ready]);

  async function move(id: string, dir: -1 | 1) {
    const idx = items.findIndex((h) => h.id === id);
    const swap = items[idx + dir];
    if (!swap) return;
    await adminSend(`/content/highlights/${id}`, 'PUT', {
      title: items[idx].title,
      media_url: items[idx].media_url,
      position: swap.position,
    });
    await adminSend(`/content/highlights/${swap.id}`, 'PUT', {
      title: swap.title,
      media_url: swap.media_url,
      position: items[idx].position,
    });
    await reload();
  }

  return (
    <AdminShell title="Highlights">
      <ul className="admin-list">
        {items.map((h) => (
          <li key={h.id} className="admin-row" data-testid="highlight-row">
            <span className="ds-body">{h.title}</span>
            <span className="ds-caption">#{h.position}</span>
            <button type="button" className="ds-btn ds-btn--ghost ds-btn--sm" onClick={() => void move(h.id, -1)}>
              ↑
            </button>
            <button type="button" className="ds-btn ds-btn--ghost ds-btn--sm" onClick={() => void move(h.id, 1)}>
              ↓
            </button>
          </li>
        ))}
      </ul>
    </AdminShell>
  );
}

type BlogPost = {
  id: string;
  title: string;
  slug: string;
  status: string;
};

export function AdminBlogClient() {
  const { ready, toast } = useAdminUi();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');

  useEffect(() => {
    if (!ready) return;
    void adminGet<{ posts: BlogPost[] }>('/blog').then((r) => setPosts(r.posts));
  }, [ready]);

  async function createPost(e: FormEvent) {
    e.preventDefault();
    await adminSend('/blog', 'POST', {
      title,
      slug,
      body: 'Draft post body',
      status: 'draft',
    });
    toast('Post created', 'content-saved-toast');
    const r = await adminGet<{ posts: BlogPost[] }>('/blog');
    setPosts(r.posts);
  }

  return (
    <AdminShell title="Blog">
      <form className="admin-form" onSubmit={(e) => void createPost(e)}>
        <label className="admin-field">
          <span className="ds-label">Title</span>
          <input className="admin-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="admin-field">
          <span className="ds-label">Slug</span>
          <input className="admin-input" value={slug} onChange={(e) => setSlug(e.target.value)} />
        </label>
        <Button type="submit" variant="primary" size="md">
          Create post
        </Button>
      </form>
      <table className="admin-table">
        <tbody>
          {posts.map((p) => (
            <tr key={p.id}>
              <td>{p.title}</td>
              <td>{p.status}</td>
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
