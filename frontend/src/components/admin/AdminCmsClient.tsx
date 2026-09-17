'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { useAdminUi } from '@/components/admin/AdminUiProvider';
import { AdminStatusPill } from '@/components/admin/AdminStatusPill';
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

type AnnouncementData = {
  messages?: string[];
  rotation_interval_seconds?: number;
};

export function AdminAnnouncementEditorClient() {
  const { ready, toast } = useAdminUi();
  const [messages, setMessages] = useState<string[]>([]);
  const [intervalSec, setIntervalSec] = useState('4');
  const [draft, setDraft] = useState('');
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready) return;
    void apiGet<ContentBlock<unknown>>('/content/blocks/announcement_bar').then((block) => {
      const data = parseBlockData<AnnouncementData>(block.data);
      setMessages((data.messages || []).filter(Boolean));
      setIntervalSec(String(data.rotation_interval_seconds ?? 4));
    });
  }, [ready]);

  async function save(nextMessages: string[], nextInterval?: string) {
    setBusy(true);
    const sec = Number(nextInterval ?? intervalSec);
    try {
      await adminSend('/content/blocks/announcement_bar', 'PUT', {
        data: {
          messages: nextMessages.filter((m) => m.trim()),
          rotation_interval_seconds: Number.isFinite(sec) && sec >= 2 ? sec : 4,
        },
        is_active: true,
      });
      setMessages(nextMessages.filter((m) => m.trim()));
      toast('Announcement saved', 'content-saved-toast');
    } catch {
      toast('Could not save');
    } finally {
      setBusy(false);
    }
  }

  async function onSaveAll(e: FormEvent) {
    e.preventDefault();
    await save(messages);
  }

  function addMessage() {
    const text = draft.trim();
    if (!text) return;
    const next = [...messages, text];
    setDraft('');
    void save(next);
  }

  function removeMessage(idx: number) {
    const next = messages.filter((_, i) => i !== idx);
    void save(next);
  }

  function startEdit(idx: number) {
    setEditIdx(idx);
    setEditText(messages[idx] || '');
  }

  function commitEdit() {
    if (editIdx == null) return;
    const next = [...messages];
    next[editIdx] = editText.trim();
    setEditIdx(null);
    void save(next);
  }

  function moveMessage(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= messages.length) return;
    const next = [...messages];
    [next[idx], next[j]] = [next[j], next[idx]];
    void save(next);
  }

  return (
    <AdminShell title="Announcement bar">
      <p className="ds-caption admin-lead">
        Add multiple messages — they rotate on the home page. One message = static bar.
      </p>
      <form className="admin-form" onSubmit={(e) => void onSaveAll(e)} data-testid="announcement-editor">
        <label className="admin-field">
          <span className="ds-label">Rotation interval (seconds)</span>
          <input
            className="admin-input"
            type="number"
            min={2}
            max={120}
            value={intervalSec}
            data-testid="announce-interval"
            onChange={(e) => setIntervalSec(e.target.value)}
          />
        </label>

        <div className="admin-announce-add">
          <label className="admin-field admin-field--grow">
            <span className="ds-label">New message</span>
            <input
              className="admin-input"
              value={draft}
              placeholder="Free delivery over KES 3000"
              data-testid="announce-new-message"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addMessage();
                }
              }}
            />
          </label>
          <Button
            type="button"
            variant="ghost"
            size="md"
            disabled={busy || !draft.trim()}
            data-testid="announce-add-btn"
            onClick={() => addMessage()}
          >
            Add
          </Button>
        </div>

        <table className="admin-table" data-testid="announce-messages-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Message</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {messages.length === 0 ? (
              <tr>
                <td colSpan={3} className="ds-caption">
                  No messages yet.
                </td>
              </tr>
            ) : (
              messages.map((msg, idx) => (
                <tr key={`${idx}-${msg.slice(0, 12)}`} data-testid="announce-message-row">
                  <td>
                    <div className="admin-categories__order">
                      <button
                        type="button"
                        className="ds-btn ds-btn--ghost ds-btn--xs"
                        aria-label="Move up"
                        disabled={busy || idx === 0}
                        onClick={() => moveMessage(idx, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="ds-btn ds-btn--ghost ds-btn--xs"
                        aria-label="Move down"
                        disabled={busy || idx === messages.length - 1}
                        onClick={() => moveMessage(idx, 1)}
                      >
                        ↓
                      </button>
                    </div>
                  </td>
                  <td>
                    {editIdx === idx ? (
                      <input
                        className="admin-input"
                        value={editText}
                        data-testid="announce-edit-input"
                        onChange={(e) => setEditText(e.target.value)}
                      />
                    ) : (
                      msg
                    )}
                  </td>
                  <td>
                    <div className="admin-row-actions">
                      {editIdx === idx ? (
                        <>
                          <button
                            type="button"
                            className="ds-btn ds-btn--primary ds-btn--xs"
                            disabled={busy}
                            onClick={() => commitEdit()}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="ds-btn ds-btn--ghost ds-btn--xs"
                            onClick={() => setEditIdx(null)}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="ds-btn ds-btn--ghost ds-btn--xs"
                            onClick={() => startEdit(idx)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="ds-btn ds-btn--ghost ds-btn--xs"
                            data-testid="announce-delete-btn"
                            disabled={busy}
                            onClick={() => removeMessage(idx)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <Button type="submit" variant="primary" size="md" disabled={busy} data-testid="save-content-block">
          Save interval
        </Button>
      </form>
    </AdminShell>
  );
}

type HighlightSlide = {
  id: string;
  image_url: string;
  caption: string;
  caption_position: string;
  sort_order: number;
  product_id?: string | null;
  product_slug?: string | null;
};

type Highlight = {
  id: string;
  title: string;
  media_url: string;
  link_url?: string | null;
  position: number;
  slides?: HighlightSlide[];
};

type ProductOption = {
  id: string;
  name: string;
  slug: string;
};

function captionPositionClass(pos: string) {
  const normalized = pos === 'center' ? 'centre' : pos || 'bottom';
  if (normalized === 'top' || normalized === 'centre') return normalized;
  return 'bottom';
}

function HighlightSlidePreview({ slide }: { slide: HighlightSlide }) {
  const pos = captionPositionClass(slide.caption_position);
  const image = slide.image_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={slide.image_url} alt="" />
  ) : (
    <span className="admin-product-thumb--empty" style={{ display: 'block', width: '100%', height: '100%' }} />
  );

  return (
    <div className="admin-highlight-slide__preview" data-testid="highlight-slide-preview">
      {slide.product_slug ? (
        <Link href={`/product/${slide.product_slug}`} className="admin-highlight-slide__preview-link">
          {image}
        </Link>
      ) : (
        image
      )}
      <p
        className={`admin-highlight-caption-preview admin-highlight-caption-preview--${pos}`}
        data-testid="highlight-caption-preview"
      >
        {slide.caption.trim() || 'Caption preview'}
      </p>
    </div>
  );
}

export function AdminHighlightsClient() {
  const { ready, toast } = useAdminUi();
  const [items, setItems] = useState<Highlight[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
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
    void adminGet<{ products: ProductOption[] }>('/products').then((d) => setProducts(d.products));
  }, [ready]);

  async function uploadMedia(file: File, folder = 'cms/highlights'): Promise<string> {
    const form = new FormData();
    form.append('file', file);
    form.append('folder', folder);
    const res = await adminUpload<{ url: string; object_key: string }>('/content/media', form);
    return res.url || res.object_key;
  }

  async function saveHighlight(h: Highlight) {
    setBusy(true);
    try {
      await adminSend(`/content/highlights/${h.id}`, 'PUT', {
        title: h.title,
        media_url: h.media_url || h.slides?.[0]?.image_url || '',
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

  function updateSlideLocal(highlightId: string, slideId: string, patch: Partial<HighlightSlide>) {
    setItems((prev) =>
      prev.map((h) => {
        if (h.id !== highlightId) return h;
        return {
          ...h,
          slides: (h.slides || []).map((s) => (s.id === slideId ? { ...s, ...patch } : s)),
        };
      }),
    );
  }

  async function addSlide(h: Highlight, files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const url = await uploadMedia(files[0]);
      await adminSend(`/content/highlights/${h.id}/slides`, 'POST', {
        image_url: url,
        caption: '',
        caption_position: 'bottom',
      });
      toast('Slide added', 'content-saved-toast');
      await reload();
    } catch {
      toast('Could not add slide');
    } finally {
      setBusy(false);
    }
  }

  async function saveSlide(h: Highlight, s: HighlightSlide) {
    setBusy(true);
    try {
      await adminSend(`/content/highlights/${h.id}/slides/${s.id}`, 'PUT', {
        image_url: s.image_url,
        caption: s.caption,
        caption_position: s.caption_position,
        sort_order: s.sort_order,
        product_id: s.product_id || null,
      });
      toast('Slide saved', 'content-saved-toast');
      await reload();
    } catch {
      toast('Could not save slide');
    } finally {
      setBusy(false);
    }
  }

  async function removeSlide(h: Highlight, slideId: string) {
    setBusy(true);
    try {
      await adminSend(`/content/highlights/${h.id}/slides/${slideId}`, 'DELETE');
      toast('Slide removed');
      await reload();
    } catch {
      toast('Could not remove slide');
    } finally {
      setBusy(false);
    }
  }

  async function moveSlide(h: Highlight, slideId: string, dir: -1 | 1) {
    const slides = [...(h.slides || [])].sort((a, b) => a.sort_order - b.sort_order);
    const idx = slides.findIndex((s) => s.id === slideId);
    const swap = slides[idx + dir];
    if (!swap) return;
    const next = [...slides];
    [next[idx], next[idx + dir]] = [next[idx + dir], next[idx]];
    setBusy(true);
    try {
      await adminSend(`/content/highlights/${h.id}/slides/reorder`, 'PUT', {
        slide_ids: next.map((s) => s.id),
      });
      await reload();
    } catch {
      toast('Could not reorder slides');
    } finally {
      setBusy(false);
    }
  }

  function onSlideProductChange(highlightId: string, slideId: string, productId: string) {
    const product = products.find((p) => p.id === productId);
    updateSlideLocal(highlightId, slideId, {
      product_id: productId || null,
      product_slug: product?.slug || null,
    });
  }

  return (
    <AdminShell title="Highlights">
      <ul className="admin-hero-slides">
        {items.map((h) => {
          const orderedSlides = [...(h.slides || [])].sort((a, b) => a.sort_order - b.sort_order);
          return (
            <li key={h.id} className="admin-highlight-card" data-testid="highlight-row">
              <section className="admin-highlight-section admin-highlight-section--meta">
                <h3 className="admin-highlight-section__title">Highlight metadata</h3>
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
                <div className="admin-hero-slide__actions">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={busy}
                    onClick={() => void saveHighlight(h)}
                  >
                    Save highlight
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
              </section>

              <section className="admin-highlight-section admin-highlight-section--slides" data-testid="highlight-slides">
                <h3 className="admin-highlight-section__title">
                  Slides ({orderedSlides.length})
                </h3>
                <ol className="admin-highlight-slide-list">
                  {orderedSlides.map((s) => (
                    <li key={s.id} className="admin-highlight-slide" data-testid="highlight-slide-row">
                      <HighlightSlidePreview slide={s} />
                      <div className="admin-highlight-slide__fields">
                        <p className="admin-highlight-slide__index" />
                        <label className="admin-field">
                          <span className="ds-label">Caption</span>
                          <input
                            className="admin-input"
                            value={s.caption}
                            disabled={busy}
                            onChange={(e) =>
                              updateSlideLocal(h.id, s.id, { caption: e.target.value })
                            }
                          />
                        </label>
                        <label className="admin-field">
                          <span className="ds-label">Caption position</span>
                          <select
                            className="admin-input"
                            value={s.caption_position || 'bottom'}
                            disabled={busy}
                            onChange={(e) =>
                              updateSlideLocal(h.id, s.id, { caption_position: e.target.value })
                            }
                          >
                            <option value="top">Top</option>
                            <option value="centre">Centre</option>
                            <option value="bottom">Bottom</option>
                          </select>
                        </label>
                        <label className="admin-field">
                          <span className="ds-label">Link to product</span>
                          <select
                            className="admin-input"
                            value={s.product_id || ''}
                            disabled={busy}
                            onChange={(e) => onSlideProductChange(h.id, s.id, e.target.value)}
                          >
                            <option value="">None</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="admin-hero-slide__actions">
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            disabled={busy}
                            onClick={() => void saveSlide(h, s)}
                          >
                            Save slide
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => void moveSlide(h, s.id, -1)}
                          >
                            Up
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => void moveSlide(h, s.id, 1)}
                          >
                            Down
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            disabled={busy || orderedSlides.length <= 1}
                            onClick={() => void removeSlide(h, s.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
                <label className="admin-field">
                  <span className="ds-label">Add slide image</span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={busy}
                    data-testid="highlight-slide-upload"
                    onChange={(e) => {
                      void addSlide(h, e.target.files);
                      e.target.value = '';
                    }}
                  />
                </label>
              </section>
            </li>
          );
        })}
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
  const [coverPreview, setCoverPreview] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [sort, setSort] = useState('reads');
  const [analytics, setAnalytics] = useState<
    {
      post_id: string;
      title: string;
      slug: string;
      total_reads: number;
      unique_readers: number;
      currently_reading: number;
      avg_seconds: number;
      completion_rate: number;
    }[]
  >([]);

  async function refresh() {
    const r = await adminGet<{ posts: BlogPost[] }>('/blog');
    setPosts(r.posts);
  }

  async function refreshAnalytics() {
    const q = new URLSearchParams({ from, to, sort });
    const r = await adminGet<{ posts: typeof analytics }>(`/analytics/blog-reads?${q}`);
    setAnalytics(r.posts ?? []);
  }

  useEffect(() => {
    if (!ready) return;
    void refresh();
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    void refreshAnalytics().catch(() => setAnalytics([]));
  }, [ready, from, to, sort]);

  function startCreate() {
    setEditingId(null);
    setForm(emptyPost);
    setCoverPreview('');
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
    setCoverPreview(p.cover_image || '');
  }

  async function onCoverUpload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', files[0]);
      fd.append('folder', 'cms/blog');
      const res = await adminUpload<{ url: string; object_key: string }>('/content/media', fd);
      setForm((f) => ({ ...f, cover_image: res.object_key || res.url }));
      setCoverPreview(res.url);
      toast('Cover uploaded', 'content-saved-toast');
    } catch {
      toast('Upload failed');
    } finally {
      setBusy(false);
    }
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
      <section className="admin-panel" data-testid="blog-analytics-panel">
        <div className="admin-panel__head">
          <h2 className="ds-display ds-display--sm">Blog analytics</h2>
          <div className="admin-date-range">
            <input
              className="admin-input"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="From"
            />
            <input
              className="admin-input"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-label="To"
            />
            <select
              className="admin-input"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              aria-label="Sort"
            >
              <option value="reads">Total reads</option>
              <option value="unique">Unique</option>
              <option value="reading">Reading now</option>
              <option value="avg_time">Avg time</option>
              <option value="completion">Completion</option>
              <option value="title">Title</option>
            </select>
          </div>
        </div>
        <table className="admin-table" data-testid="blog-analytics-table">
          <thead>
            <tr>
              <th>Post</th>
              <th>Reads</th>
              <th>Unique</th>
              <th>Reading</th>
              <th>Avg time</th>
              <th>Completion</th>
            </tr>
          </thead>
          <tbody>
            {analytics.map((r) => (
              <tr key={r.post_id} data-testid="blog-analytics-row">
                <td>{r.title}</td>
                <td>{r.total_reads}</td>
                <td>{r.unique_readers}</td>
                <td>{r.currently_reading}</td>
                <td>{Math.round(r.avg_seconds)}s</td>
                <td>{Math.round(r.completion_rate)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

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
        <div className="admin-field">
          <span className="ds-label">Cover image</span>
          <input
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={(e) => { void onCoverUpload(e.target.files); e.target.value = ''; }}
          />
          {coverPreview ? (
            <img
              src={coverPreview}
              alt="Cover preview"
              style={{ marginTop: 8, maxHeight: 120, borderRadius: 4, objectFit: 'cover' }}
            />
          ) : form.cover_image ? (
            <p className="ds-caption" style={{ marginTop: 4 }}>Stored: {form.cover_image}</p>
          ) : null}
        </div>
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
              <td>
                <AdminStatusPill status={p.status} />
              </td>
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
