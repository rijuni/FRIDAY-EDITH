import React, { useEffect, useState } from 'react';
import { Brain, Loader2, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { useFridayStore } from '../../../stores/fridayStore';

const CATEGORIES = [
  ['user_preference', 'User preference'],
  ['project_context', 'Project context'],
  ['coding_style', 'Coding style'],
  ['personal_fact', 'Personal fact']
];

export function FridayMemoryModal({ isOpen, onClose }) {
  const memories = useFridayStore((state) => state.memories);
  const isLoading = useFridayStore((state) => state.isLoadingMemories);
  const fetchMemories = useFridayStore((state) => state.fetchMemories);
  const saveMemory = useFridayStore((state) => state.saveMemory);
  const deleteMemory = useFridayStore((state) => state.deleteMemory);
  const [editingId, setEditingId] = useState(null);
  const [category, setCategory] = useState(CATEGORIES[0][0]);
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setEditingId(null);
    setCategory(CATEGORIES[0][0]);
    setContent('');
    setMessage('');
    fetchMemories();
  }, [isOpen, fetchMemories]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const resetForm = () => {
    setEditingId(null);
    setCategory(CATEGORIES[0][0]);
    setContent('');
  };

  const beginEdit = (memory) => {
    setEditingId(memory.id);
    setCategory(memory.category);
    setContent(memory.content);
    setMessage('');
  };

  const handleSave = async (event) => {
    event.preventDefault();
    const value = content.trim();
    if (!value) return;
    setIsSaving(true);
    setMessage('');
    const saved = await saveMemory({ id: editingId, category, content: value });
    setIsSaving(false);
    if (!saved) {
      setMessage('Could not save this memory. Check the connection and try again.');
      return;
    }
    setMessage(editingId ? 'Memory updated.' : 'Memory saved. Friday can use it in future replies.');
    resetForm();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this saved memory? Friday will no longer use it in future replies.')) return;
    const deleted = await deleteMemory(id);
    setMessage(deleted ? 'Memory deleted.' : 'Could not delete this memory. Try again.');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="friday-memory-title"
        className="frosted-glass-card flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-purple-300/20 p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-purple-500/20 p-2 text-purple-200"><Brain className="h-5 w-5" /></span>
            <div>
              <h2 id="friday-memory-title" className="font-semibold text-white">Friday Memory</h2>
              <p className="text-xs text-slate-400">Review and manage details used to personalize future replies.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close memory manager" className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        </header>

        <form onSubmit={handleSave} className="mb-4 grid gap-2 rounded-xl border border-white/10 bg-black/15 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
          <label className="sr-only" htmlFor="memory-category">Memory category</label>
          <select id="memory-category" value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-lg border border-white/10 bg-[#1b1726] px-2.5 py-2 text-xs text-white">
            {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <label className="sr-only" htmlFor="memory-content">Memory content</label>
          <input id="memory-content" value={content} onChange={(event) => setContent(event.target.value)} maxLength={2000} required placeholder="For example: I prefer concise answers." className="min-w-0 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white placeholder:text-slate-500" />
          <div className="flex gap-2">
            {editingId && <button type="button" onClick={resetForm} className="rounded-lg border border-white/10 px-2.5 text-xs text-slate-300">Cancel</button>}
            <button type="submit" disabled={!content.trim() || isSaving} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-40">
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : editingId ? <Save className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {editingId ? 'Update' : 'Add'}
            </button>
          </div>
        </form>

        {message && <p role="status" className="mb-3 text-xs text-purple-200">{message}</p>}
        <div className="min-h-24 flex-1 space-y-2 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Loading memories...</div>
          ) : memories.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">No saved memories yet. Add a preference or useful detail above.</p>
          ) : memories.map((memory) => (
            <article key={memory.id} className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/15 p-3">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-purple-200">{CATEGORIES.find(([value]) => value === memory.category)?.[1] || memory.category}</span>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-100">{memory.content}</p>
              </div>
              <button type="button" onClick={() => beginEdit(memory)} aria-label="Edit memory" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><Pencil className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => handleDelete(memory.id)} aria-label="Delete memory" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/15 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
