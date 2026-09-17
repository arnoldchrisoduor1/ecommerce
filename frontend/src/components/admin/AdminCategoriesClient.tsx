'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { useAdminUi } from '@/components/admin/AdminUiProvider';
import { adminGet, adminSend, slugify } from '@/lib/admin';

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  parent_id?: string | null;
  position: number;
  product_count: number;
};

export function AdminCategoriesClient() {
  const { ready, toast } = useAdminUi();
  const [rows, setRows] = useState<CategoryRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const r = await adminGet<{ categories: CategoryRow[] }>('/categories');
    setRows(r.categories || []);
  }, []);

  useEffect(() => {
    if (!ready) return;
    void load().catch(() => setRows([]));
  }, [ready, load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await adminSend('/categories', 'POST', {
        name: newName.trim(),
        slug: newSlug.trim() || slugify(newName),
      });
      setNewName('');
      setNewSlug('');
      setSlugTouched(false);
      toast('Category created');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create category');
    } finally {
      setBusy(false);
    }
  }

  function startEdit(row: CategoryRow) {
    setEditId(row.id);
    setEditName(row.name);
    setEditSlug(row.slug);
    setError('');
  }

  async function saveEdit() {
    if (!editId) return;
    setBusy(true);
    setError('');
    try {
      await adminSend(`/categories/${editId}`, 'PUT', {
        name: editName.trim(),
        slug: editSlug.trim() || slugify(editName),
      });
      setEditId(null);
      toast('Category updated');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update category');
    } finally {
      setBusy(false);
    }
  }

  async function moveRow(id: string, dir: -1 | 1) {
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const next = idx + dir;
    if (next < 0 || next >= rows.length) return;
    const order = rows.map((r) => r.id);
    [order[idx], order[next]] = [order[next], order[idx]];
    setBusy(true);
    try {
      await adminSend('/categories/reorder', 'PUT', { order });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function removeRow(row: CategoryRow) {
    setError('');
    setBusy(true);
    try {
      await adminSend(`/categories/${row.id}`, 'DELETE');
      toast('Category deleted');
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not delete';
      if (row.product_count > 0) {
        const target = rows.find((r) => r.id !== row.id && r.product_count === 0);
        if (
          target &&
          window.confirm(
            `"${row.name}" has ${row.product_count} product(s). Move them to "${target.name}" and delete?`,
          )
        ) {
          try {
            await adminSend(`/categories/${row.id}?reassign_to=${target.id}`, 'DELETE');
            toast('Category deleted; products reassigned');
            await load();
            return;
          } catch (inner) {
            setError(inner instanceof Error ? inner.message : 'Reassign failed');
            return;
          }
        }
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell title="Categories">
      <p className="ds-caption admin-lead">
        Manage storefront categories — order controls nav and filter display.
      </p>

      <form className="admin-form admin-form--inline" onSubmit={onCreate} data-testid="category-create">
        <label className="admin-field">
          <span className="ds-label">New category</span>
          <input
            className="admin-input"
            value={newName}
            placeholder="Name"
            data-testid="category-new-name"
            onChange={(e) => {
              setNewName(e.target.value);
              if (!slugTouched) setNewSlug(slugify(e.target.value));
            }}
            required
          />
        </label>
        <label className="admin-field">
          <span className="ds-label">Slug</span>
          <input
            className="admin-input"
            value={newSlug}
            placeholder="slug"
            data-testid="category-new-slug"
            onChange={(e) => {
              setSlugTouched(true);
              setNewSlug(e.target.value);
            }}
          />
        </label>
        <button type="submit" className="ds-btn ds-btn--primary" disabled={busy} data-testid="category-create-btn">
          Add
        </button>
      </form>

      {error ? (
        <p className="ds-caption admin-form__error" data-testid="category-error">
          {error}
        </p>
      ) : null}

      <div className="admin-table-scroll"><table className="admin-table" data-testid="categories-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Name</th>
            <th>Slug</th>
            <th>Products</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} data-testid="category-row">
              <td>
                <div className="admin-categories__order">
                  <button
                    type="button"
                    className="ds-btn ds-btn--ghost ds-btn--xs"
                    aria-label="Move up"
                    disabled={busy}
                    onClick={() => void moveRow(row.id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="ds-btn ds-btn--ghost ds-btn--xs"
                    aria-label="Move down"
                    disabled={busy}
                    onClick={() => void moveRow(row.id, 1)}
                  >
                    ↓
                  </button>
                </div>
              </td>
              <td>
                {editId === row.id ? (
                  <input
                    className="admin-input"
                    value={editName}
                    data-testid="category-edit-name"
                    onChange={(e) => setEditName(e.target.value)}
                  />
                ) : (
                  row.name
                )}
              </td>
              <td className="ds-caption">
                {editId === row.id ? (
                  <input
                    className="admin-input"
                    value={editSlug}
                    data-testid="category-edit-slug"
                    onChange={(e) => setEditSlug(e.target.value)}
                  />
                ) : (
                  row.slug
                )}
              </td>
              <td>{row.product_count}</td>
              <td>
                <div className="admin-row-actions">
                  {editId === row.id ? (
                    <>
                      <button
                        type="button"
                        className="ds-btn ds-btn--primary ds-btn--xs"
                        disabled={busy}
                        data-testid="category-save-btn"
                        onClick={() => void saveEdit()}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="ds-btn ds-btn--ghost ds-btn--xs"
                        onClick={() => setEditId(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="ds-btn ds-btn--ghost ds-btn--xs"
                        data-testid="category-edit-btn"
                        onClick={() => startEdit(row)}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="ds-btn ds-btn--ghost ds-btn--xs"
                        data-testid="category-delete-btn"
                        disabled={busy}
                        onClick={() => void removeRow(row)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </AdminShell>
  );
}
