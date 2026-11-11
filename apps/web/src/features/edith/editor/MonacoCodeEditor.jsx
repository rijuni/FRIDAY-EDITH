import React from 'react';
import Editor from '@monaco-editor/react';

export function MonacoCodeEditor({
  filename = 'decomposer.py',
  code = '',
  onChange,
  readOnly = false
}) {
  // Determine language based on extension
  const getLanguage = (fname) => {
    if (fname.endsWith('.py')) return 'python';
    if (fname.endsWith('.js') || fname.endsWith('.jsx')) return 'javascript';
    if (fname.endsWith('.ts') || fname.endsWith('.tsx')) return 'typescript';
    if (fname.endsWith('.json')) return 'json';
    if (fname.endsWith('.css')) return 'css';
    if (fname.endsWith('.html')) return 'html';
    if (fname.endsWith('.ps1')) return 'powershell';
    if (fname.endsWith('.md')) return 'markdown';
    return 'plaintext';
  };

  const handleEditorWillMount = (monaco) => {
    // Define custom Stark Tactical Cyberpunk theme
    monaco.editor.defineTheme('edith-cyber', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '64748b', fontStyle: 'italic' },
        { token: 'keyword', foreground: '22d3ee', fontStyle: 'bold' },
        { token: 'string', foreground: '34d399' },
        { token: 'number', foreground: 'f472b6' },
        { token: 'type', foreground: 'a78bfa' },
        { token: 'function', foreground: '38bdf8' }
      ],
      colors: {
        'editor.background': '#070a12',
        'editor.foreground': '#e2e8f0',
        'editorCursor.foreground': '#22d3ee',
        'editor.lineHighlightBackground': '#0f172a50',
        'editorLineNumber.foreground': '#475569',
        'editorLineNumber.activeForeground': '#22d3ee',
        'editor.selectionBackground': '#0369a150'
      }
    });
  };

  return (
    <div className="w-full h-full overflow-hidden bg-[#070a12]">
      <Editor
        height="100%"
        language={getLanguage(filename)}
        value={code}
        theme="edith-cyber"
        beforeMount={handleEditorWillMount}
        onChange={onChange}
        options={{
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          lineNumbers: 'on',
          roundedSelection: false,
          scrollBeyondLastLine: false,
          readOnly,
          minimap: { enabled: true, maxColumn: 80 },
          automaticLayout: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          smoothScrolling: true,
          tabSize: 2,
          wordWrap: 'on'
        }}
      />
    </div>
  );
}

