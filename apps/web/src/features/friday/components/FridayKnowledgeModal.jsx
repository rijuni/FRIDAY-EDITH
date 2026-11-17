import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, FileText, Loader2, Plus, Trash2, Upload, X } from 'lucide-react';
import { apiFetch, safeParseJson } from '../../../lib/apiClient.js';

const MAX_FILE_BYTES = 1024 * 1024 * 1024;
const FILE_MIME_TYPES = {
  '.txt': 'text/plain', '.md': 'text/markdown', '.markdown': 'text/markdown',
  '.csv': 'text/csv', '.json': 'application/json', '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

function resolveFileMime(file) {
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  return FILE_MIME_TYPES[extension] || file.type || 'application/octet-stream';
}

export function FridayKnowledgeModal({ isOpen, onClose }) {
  const [knowledgeBases, setKnowledgeBases] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [documents, setDocuments] = useState([]);
  const [baseName, setBaseName] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const documentRequestRef = useRef(0);

  const loadBases = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await apiFetch('/v1/friday/knowledge-bases');
      const payload = await safeParseJson(response);
      if (!response.ok) throw new Error(payload?.message || 'Unable to load knowledge bases.');
      const bases = payload?.data?.knowledgeBases || [];
      setKnowledgeBases(bases);
      setSelectedId((current) => bases.some((base) => base.id === current) ? current : (bases[0]?.id || ''));
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load knowledge bases.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadDocuments = useCallback(async (id) => {
    const requestId = ++documentRequestRef.current;
    if (!id) { setDocuments([]); return; }
    setIsLoading(true);
    try {
      const response = await apiFetch(`/v1/friday/knowledge-bases/${encodeURIComponent(id)}/documents`);
      const payload = await safeParseJson(response);
      if (!response.ok) throw new Error(payload?.message || 'Unable to load indexed documents.');
      if (requestId === documentRequestRef.current) setDocuments(payload?.data?.documents || []);
    } catch (loadError) {
      if (requestId === documentRequestRef.current) setError(loadError?.message || 'Unable to load indexed documents.');
    } finally {
      if (requestId === documentRequestRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setStatus('');
    loadBases();
  }, [isOpen, loadBases]);

  useEffect(() => { if (isOpen) loadDocuments(selectedId); }, [isOpen, selectedId, loadDocuments]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCreateBase = async (event) => {
    event.preventDefault();
    setError('');
    setIsSaving(true);
    try {
      const response = await apiFetch('/v1/friday/knowledge-bases', {
        method: 'POST',
        body: JSON.stringify({ name: baseName.trim(), description: description.trim() })
      });
      const payload = await safeParseJson(response);
      if (!response.ok || !payload?.data?.knowledgeBase) throw new Error(payload?.message || 'Unable to create knowledge base.');
      const created = payload.data.knowledgeBase;
      setKnowledgeBases((current) => [created, ...current]);
      setSelectedId(created.id);
      setBaseName('');
      setDescription('');
      setStatus(`Created “${created.name}”.`);
    } catch (saveError) {
      setError(saveError?.message || 'Unable to create knowledge base.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteBase = async () => {
    const current = knowledgeBases.find((base) => base.id === selectedId);
    if (!current || !window.confirm(`Delete “${current.name}” and all its indexed content?`)) return;
    setError('');
    try {
      const response = await apiFetch(`/v1/friday/knowledge-bases/${encodeURIComponent(current.id)}`, { method: 'DELETE' });
      const payload = await safeParseJson(response);
      if (!response.ok) throw new Error(payload?.message || 'Unable to delete knowledge base.');
      setKnowledgeBases((items) => items.filter((base) => base.id !== current.id));
      setSelectedId('');
      setDocuments([]);
      setStatus('Knowledge base and its indexed content deleted.');
    } catch (deleteError) {
      setError(deleteError?.message || 'Unable to delete knowledge base.');
    }
  };

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selectedId) return;
    if (file.size === 0 || file.size > MAX_FILE_BYTES) {
      setError('Choose a non-empty file no larger than 1 GB.');
      return;
    }
    if (!FILE_MIME_TYPES[file.name.slice(file.name.lastIndexOf('.')).toLowerCase()]) {
      setError('Supported formats: TXT, Markdown, CSV, JSON, PDF, DOCX, and XLSX.');
      return;
    }
    setError('');
    setStatus(`Uploading and scanning ${file.name}. Large documents can take a while...`);
    setIsSaving(true);
    try {
      const uploadUrl = new URL(`/v1/friday/knowledge-bases/${encodeURIComponent(selectedId)}/documents/upload`, window.location.origin);
      uploadUrl.searchParams.set('filename', file.name);
      const response = await apiFetch(`${uploadUrl.pathname}${uploadUrl.search}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'X-File-Mime-Type': resolveFileMime(file) },
        body: file
      });
      const payload = await safeParseJson(response);
      if (!response.ok) throw new Error(payload?.message || 'Unable to index this document.');
      const document = payload?.data?.document;
      setStatus(`Indexed ${document?.filename || file.name} into ${document?.chunkCount ?? 0} searchable sections.`);
      await Promise.all([loadDocuments(selectedId), loadBases()]);
    } catch (uploadError) {
      setError(uploadError?.message || `Unable to index ${file.name}.`);
      setStatus('');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteDocument = async (filename) => {
    if (!selectedId || !window.confirm(`Remove “${filename}” from this knowledge base?`)) return;
    setError('');
    try {
      const response = await apiFetch(`/v1/friday/knowledge-bases/${encodeURIComponent(selectedId)}/documents`, {
        method: 'DELETE',
        body: JSON.stringify({ filename })
      });
      const payload = await safeParseJson(response);
      if (!response.ok) throw new Error(payload?.message || 'Unable to remove document.');
      setDocuments((current) => current.filter((document) => document.filename !== filename));
      await loadBases();
      setStatus(`Removed ${filename}.`);
    } catch (deleteError) {
      setError(deleteError?.message || 'Unable to remove document.');
    }
  };

  const selectedBase = knowledgeBases.find((base) => base.id === selectedId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="friday-knowledge-title" className="frosted-glass-card flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-cyan-300/20 p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-cyan-500/15 p-2 text-cyan-200"><BookOpen className="h-5 w-5" /></span>
            <div><h2 id="friday-knowledge-title" className="font-semibold text-white">Friday Knowledge Bases</h2><p className="text-xs text-slate-400">Index documents so Friday can retrieve relevant passages in chat.</p></div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close knowledge bases" className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[minmax(12rem,0.85fr)_minmax(0,1.5fr)]">
          <div className="flex min-h-0 flex-col gap-3">
            <form onSubmit={handleCreateBase} className="space-y-2 rounded-xl border border-white/10 bg-black/15 p-3">
              <h3 className="text-xs font-semibold text-cyan-100">Create a knowledge base</h3>
              <input value={baseName} onChange={(event) => setBaseName(event.target.value)} maxLength={120} required placeholder="Name" className="w-full rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-xs text-white placeholder:text-slate-500" />
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} rows={2} placeholder="Description (optional)" className="w-full resize-y rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-xs text-white placeholder:text-slate-500" />
              <button type="submit" disabled={!baseName.trim() || isSaving} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-cyan-700/80 px-3 py-2 text-xs font-medium text-white hover:bg-cyan-600 disabled:opacity-40"><Plus className="h-3.5 w-3.5" />Create</button>
            </form>
            <div className="min-h-20 flex-1 space-y-1 overflow-y-auto">
              <h3 className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Your knowledge bases</h3>
              {knowledgeBases.map((base) => (
                <button key={base.id} type="button" onClick={() => { setSelectedId(base.id); setStatus(''); setError(''); }} className={`w-full rounded-lg border px-3 py-2 text-left ${selectedId === base.id ? 'border-cyan-300/30 bg-cyan-500/10' : 'border-transparent hover:bg-white/5'}`}>
                  <span className="block truncate text-xs font-medium text-slate-100">{base.name}</span>
                  <span className="text-[10px] text-slate-400">{base._count?.chunks || 0} indexed sections</span>
                </button>
              ))}
              {!isLoading && knowledgeBases.length === 0 && <p className="px-2 py-2 text-xs text-slate-500">No knowledge bases yet.</p>}
            </div>
          </div>

          <div className="flex min-h-0 flex-col rounded-xl border border-white/10 bg-black/10 p-3">
            {selectedBase ? (
              <>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0"><h3 className="truncate text-sm font-semibold text-white">{selectedBase.name}</h3><p className="mt-0.5 text-[11px] text-slate-400">{selectedBase.description || 'No description provided.'}</p></div>
                  <button type="button" onClick={handleDeleteBase} aria-label="Delete knowledge base" title="Delete knowledge base and indexed contents" className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-red-500/15 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                <input ref={fileInputRef} type="file" accept=".txt,.md,.markdown,.csv,.json,.pdf,.docx,.xlsx,text/plain,text/markdown,text/csv,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleUpload} className="hidden" />
                <button type="button" disabled={isSaving} onClick={() => fileInputRef.current?.click()} className="mb-3 inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-300/20 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-40"><Upload className="h-3.5 w-3.5" />Upload document (up to 1 GB)</button>
                <div className="min-h-20 flex-1 space-y-1 overflow-y-auto">
                  {documents.map((document) => (
                    <div key={document.filename} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-white/5">
                      <FileText className="h-4 w-4 shrink-0 text-cyan-200" />
                      <div className="min-w-0 flex-1"><p className="truncate text-xs text-slate-100">{document.filename}</p><p className="text-[10px] text-slate-500">{document.chunkCount} sections indexed</p></div>
                      <button type="button" onClick={() => handleDeleteDocument(document.filename)} aria-label={`Remove ${document.filename}`} title="Remove document" className="rounded-lg p-1.5 text-slate-500 hover:bg-red-500/15 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                  {!isLoading && documents.length === 0 && <p className="py-6 text-center text-xs text-slate-500">No indexed documents. Upload a supported document to get started.</p>}
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-center text-xs text-slate-500">Create or select a knowledge base to manage its documents.</div>
            )}
          </div>
        </div>
        {isLoading && <p className="mt-3 flex items-center gap-2 text-[11px] text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading knowledge data...</p>}
        {error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}
        {status && <p role="status" className="mt-3 text-xs text-cyan-200">{status}</p>}
      </section>
    </div>
  );
}
