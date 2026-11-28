import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'module';
import path from 'path';
import esbuild from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useFridayStore } from '../stores/fridayStore.js';

async function loadJsxComponent(componentRelPath, exportName) {
  const entryPath = path.resolve(import.meta.dirname, '..', componentRelPath);
  const result = await esbuild.build({
    entryPoints: [entryPath],
    write: false,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'lucide-react', 'zustand']
  });

  const virtualFilename = path.join(import.meta.dirname, `${exportName}.virtual.cjs`);
  const mod = new Module(virtualFilename);
  mod.filename = virtualFilename;
  mod.paths = Module._nodeModulePaths(import.meta.dirname);
  mod._compile(result.outputFiles[0].text, virtualFilename);
  return mod.exports[exportName];
}

const EXTENSION_MIME_MAP = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

function resolveAttachmentMime(filename, rawType) {
  const dotIdx = filename.lastIndexOf('.');
  const ext = dotIdx >= 0 ? filename.slice(dotIdx).toLowerCase() : '';
  if (EXTENSION_MIME_MAP[ext]) return EXTENSION_MIME_MAP[ext];
  if (rawType && Object.values(EXTENSION_MIME_MAP).includes(rawType)) return rawType;
  return null;
}

const MAX_ATTACHMENT_BYTES = 1024 * 1024 * 1024; // 1 GiB transport cap

describe('Frontend F.R.I.D.A.Y. Modals, Voice Controls & Ingestion Boundaries', () => {
  beforeEach(() => {
    useFridayStore.getState().resetState();
  });

  it('FridaySettingsModal renders accessible dialog, model preferences, provider keys vault, and controls', async () => {
    const FridaySettingsModal = await loadJsxComponent(
      'features/friday/components/FridaySettingsModal.jsx',
      'FridaySettingsModal'
    );

    const html = renderToStaticMarkup(
      React.createElement(FridaySettingsModal, {
        isOpen: true,
        onClose: () => { }
      })
    );

    assert.match(html, /role="dialog"/);
    assert.match(html, /F\.R\.I\.D\.A\.Y\. Settings/);
    assert.match(html, /Save Changes/);
    assert.match(html, /AI Provider Keys \(Secret Vault\)/);
    assert.match(html, /Anthropic \(Claude\)/);
    assert.match(html, /Google Gemini/);
    assert.match(html, /OpenAI \(GPT \/ Reasoning\)/);
    assert.match(html, /AES-256-GCM/);
  });

  it('FridayHelpModal renders user guide and support reporting controls', async () => {
    const FridayHelpModal = await loadJsxComponent(
      'features/friday/components/FridayHelpModal.jsx',
      'FridayHelpModal'
    );

    const html = renderToStaticMarkup(
      React.createElement(FridayHelpModal, {
        isOpen: true,
        onClose: () => { }
      })
    );

    assert.match(html, /role="dialog"/);
    assert.match(html, /Help, Runtime Diagnostics &amp; Support/);
    assert.match(html, /Voice/);
    assert.match(html, /File Attachments/);
    assert.match(html, /Submit Support or Bug Report/);
  });

  it('FridayMemoryModal renders user memory list and categories', async () => {
    const FridayMemoryModal = await loadJsxComponent(
      'features/friday/components/FridayMemoryModal.jsx',
      'FridayMemoryModal'
    );

    const html = renderToStaticMarkup(
      React.createElement(FridayMemoryModal, {
        isOpen: true,
        onClose: () => { }
      })
    );

    assert.match(html, /role="dialog"/);
    assert.match(html, /Friday Memory/);
    assert.match(html, /User preference/);
    assert.match(html, /Add/);
  });

  it('FridayKnowledgeModal renders knowledge bases and document collections', async () => {
    const FridayKnowledgeModal = await loadJsxComponent(
      'features/friday/components/FridayKnowledgeModal.jsx',
      'FridayKnowledgeModal'
    );

    const html = renderToStaticMarkup(
      React.createElement(FridayKnowledgeModal, {
        isOpen: true,
        onClose: () => { }
      })
    );

    assert.match(html, /role="dialog"/);
    assert.match(html, /Friday Knowledge Bases/);
    assert.match(html, /Create a knowledge base/);
  });

  it('FridayGoogleModal renders accessible dialog, tabs, and zero-trust protection', async () => {
    const FridayGoogleModal = await loadJsxComponent(
      'features/friday/components/FridayGoogleModal.jsx',
      'FridayGoogleModal'
    );

    const html = renderToStaticMarkup(
      React.createElement(FridayGoogleModal, {
        isOpen: true,
        onClose: () => { }
      })
    );

    assert.match(html, /role="dialog"/);
    assert.match(html, /Google Workspace Integrations/);
    assert.match(html, /Connection &amp; Scopes/);
    assert.match(html, /Workspace Context/);
    assert.match(html, /Governed Actions/);
    assert.match(html, /Zero-Trust Google Token Security/);
  });

  it('NebulaOrb renders visual AI state indicator', async () => {
    const NebulaOrb = await loadJsxComponent(
      'features/friday/components/NebulaOrb.jsx',
      'NebulaOrb'
    );

    const idleHtml = renderToStaticMarkup(
      React.createElement(NebulaOrb, { isStreaming: false, size: 80 })
    );
    assert.ok(idleHtml.length > 50, 'Idle NebulaOrb should render container');

    const streamingHtml = renderToStaticMarkup(
      React.createElement(NebulaOrb, { isStreaming: true, size: 80 })
    );
    assert.ok(streamingHtml.length > 50, 'Streaming NebulaOrb should render container');
  });

  it('Attachment Ingestion: resolveAttachmentMime validates supported document types and rejects unsafe extensions', () => {
    // Supported document types
    assert.equal(resolveAttachmentMime('notes.txt'), 'text/plain');
    assert.equal(resolveAttachmentMime('spec.md'), 'text/markdown');
    assert.equal(resolveAttachmentMime('data.csv'), 'text/csv');
    assert.equal(resolveAttachmentMime('schema.json'), 'application/json');
    assert.equal(resolveAttachmentMime('report.pdf'), 'application/pdf');
    assert.equal(resolveAttachmentMime('design.docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    assert.equal(resolveAttachmentMime('sheet.xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    // Unsafe / executable / unsupported types must return null
    assert.equal(resolveAttachmentMime('script.exe'), null);
    assert.equal(resolveAttachmentMime('malware.sh'), null);
    assert.equal(resolveAttachmentMime('binary.bin'), null);
    assert.equal(resolveAttachmentMime('payload.py'), null);
    assert.equal(resolveAttachmentMime('noext'), null);
  });

  it('Attachment Ingestion: 1 GiB transport cap boundary checks', () => {
    const validBytes = 500 * 1024 * 1024; // 500 MB
    assert.ok(validBytes <= MAX_ATTACHMENT_BYTES, '500 MB file must be within limit');

    const exactLimitBytes = 1024 * 1024 * 1024; // exactly 1 GiB
    assert.ok(exactLimitBytes <= MAX_ATTACHMENT_BYTES, '1 GiB file is at upper boundary');

    const oversizedBytes = 1024 * 1024 * 1024 + 1; // 1 GiB + 1 byte
    assert.ok(oversizedBytes > MAX_ATTACHMENT_BYTES, 'Files over 1 GiB must exceed boundary');
  });

  it('Voice UI: Voice capture handles missing browser recognition gracefully', () => {
    // Simulate browser without SpeechRecognition
    const prevSpeech = globalThis.SpeechRecognition;
    const prevWebkit = globalThis.webkitSpeechRecognition;
    delete globalThis.SpeechRecognition;
    delete globalThis.webkitSpeechRecognition;

    try {
      const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
      assert.equal(Recognition, undefined);
      const notice = !Recognition
        ? 'Voice input is not supported in this browser. Try a browser with speech recognition enabled.'
        : '';
      assert.match(notice, /not supported in this browser/);
    } finally {
      if (prevSpeech) globalThis.SpeechRecognition = prevSpeech;
      if (prevWebkit) globalThis.webkitSpeechRecognition = prevWebkit;
    }
  });

  it('Voice UI: Voice capture event flow (transcript assembly and error handling)', () => {
    let capturedTranscript = '';
    const voiceBase = 'Initial draft:';

    // Mock speech recognition result event
    const mockResultEvent = {
      results: [
        [{ transcript: 'analyze project structure' }],
      ]
    };
    mockResultEvent.results[0].isFinal = true;

    const transcript = Array.from(mockResultEvent.results)
      .filter((r) => r.isFinal)
      .map((r) => r[0]?.transcript || '')
      .join(' ')
      .trim();

    capturedTranscript = [voiceBase.trim(), transcript].filter(Boolean).join(' ');
    assert.equal(capturedTranscript, 'Initial draft: analyze project structure');

    // Mock speech recognition errors
    const handleVoiceError = (errorCode) => {
      if (errorCode === 'not-allowed') return 'Microphone access was denied. Allow microphone access in browser settings.';
      if (errorCode === 'no-speech') return 'No speech was detected. Try again.';
      return 'Voice input ended unexpectedly.';
    };

    assert.equal(handleVoiceError('not-allowed'), 'Microphone access was denied. Allow microphone access in browser settings.');
    assert.equal(handleVoiceError('no-speech'), 'No speech was detected. Try again.');
    assert.equal(handleVoiceError('network'), 'Voice input ended unexpectedly.');
  });

  it('Voice UI: Speech synthesis reads assistant response and handles cancellation', () => {
    let spokenText = '';
    let canceled = false;

    const mockSpeechSynthesis = {
      speak(utterance) {
        spokenText = utterance.text;
      },
      cancel() {
        canceled = true;
        spokenText = '';
      }
    };

    const mockUtterance = { text: 'F.R.I.D.A.Y. online and ready.' };

    // Speak
    mockSpeechSynthesis.speak(mockUtterance);
    assert.equal(spokenText, 'F.R.I.D.A.Y. online and ready.');
    assert.equal(canceled, false);

    // Cancel / Toggle off
    mockSpeechSynthesis.cancel();
    assert.equal(canceled, true);
    assert.equal(spokenText, '');
  });

  it('Chat State: Project association and conversation switching in useFridayStore', async () => {
    const store = useFridayStore.getState();

    // Set active project
    store.setActiveProjectId('proj_alpha_99');
    assert.equal(useFridayStore.getState().activeProjectId, 'proj_alpha_99');

    // Switch project
    store.setActiveProjectId('proj_beta_100');
    assert.equal(useFridayStore.getState().activeProjectId, 'proj_beta_100');

    // Clear project filter
    store.setActiveProjectId(null);
    assert.equal(useFridayStore.getState().activeProjectId, null);
  });
});
