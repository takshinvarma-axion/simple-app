import { useState, useEffect, useCallback } from "react";

const API = import.meta.env.VITE_API_URL ?? "";

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

function NoteForm({ initial, onSave, onCancel }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await onSave({ title, body });
      if (!initial) {
        setTitle("");
        setBody("");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <input
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      <textarea
        placeholder="Write your note..."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        required
      />
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button className="btn-primary" type="submit" disabled={saving}>
          {saving ? "Saving..." : initial ? "Update" : "Add Note"}
        </button>
        {onCancel && (
          <button className="btn-secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function NoteCard({ note, onDelete, onUpdate }) {
  const [editing, setEditing] = useState(false);

  async function handleDelete() {
    if (!window.confirm("Delete this note?")) return;
    await onDelete(note.id);
  }

  async function handleUpdate(data) {
    await onUpdate(note.id, data);
    setEditing(false);
  }

  const date = new Date(note.created_at + "Z").toLocaleString();

  if (editing) {
    return (
      <NoteForm initial={note} onSave={handleUpdate} onCancel={() => setEditing(false)} />
    );
  }

  return (
    <div className="note-card">
      <div className="note-header">
        <span className="note-title">{note.title}</span>
        <div className="note-actions">
          <button className="btn-edit" onClick={() => setEditing(true)}>Edit</button>
          <button className="btn-danger" onClick={handleDelete}>Delete</button>
        </div>
      </div>
      <p className="note-body">{note.body}</p>
      <p className="note-meta">{date}</p>
    </div>
  );
}

export default function App() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchNotes = useCallback(async () => {
    try {
      const data = await apiFetch("/api/notes");
      setNotes(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  async function handleCreate(data) {
    const note = await apiFetch("/api/notes", {
      method: "POST",
      body: JSON.stringify(data),
    });
    setNotes((prev) => [note, ...prev]);
  }

  async function handleDelete(id) {
    await apiFetch(`/api/notes/${id}`, { method: "DELETE" });
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  async function handleUpdate(id, data) {
    const updated = await apiFetch(`/api/notes/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
  }

  return (
    <>
      <h1>Notes</h1>
      <NoteForm onSave={handleCreate} />
      {loading ? (
        <p className="empty">Loading...</p>
      ) : notes.length === 0 ? (
        <p className="empty">No notes yet. Add your first one above.</p>
      ) : (
        <div className="notes-list">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onDelete={handleDelete}
              onUpdate={handleUpdate}
            />
          ))}
        </div>
      )}
    </>
  );
}
