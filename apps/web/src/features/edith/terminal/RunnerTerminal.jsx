import React, { useCallback, useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { apiFetch, safeParseJson } from '../../../lib/apiClient';

export function RunnerTerminal({
  pendingCommand = null,
  onPendingCommandHandled,
  onApprovalRequired,
  onCommandExecuted,
  onBusyChange
}) {
  const containerRef = useRef(null);
  const terminalRef = useRef(null);
  const xtermInstance = useRef(null);
  const commandLineBuffer = useRef('');
  const isExecutingRef = useRef(false);

  const callbacksRef = useRef({
    onApprovalRequired,
    onCommandExecuted,
    onBusyChange
  });

  useEffect(() => {
    callbacksRef.current = {
      onApprovalRequired,
      onCommandExecuted,
      onBusyChange
    };
  }, [onApprovalRequired, onCommandExecuted, onBusyChange]);

  const writePrompt = useCallback((term) => {
    term.write('\x1b[1;36medith@stark-runner\x1b[0m:\x1b[1;34m~/workspace\x1b[0m$ ');
  }, []);

  const executeCommand = useCallback(
    async (term, cmd, { approved = false } = {}) => {
      const cleanCmd = (cmd || '').trim();
      if (!cleanCmd) {
        writePrompt(term);
        return;
      }

      if (cleanCmd === 'clear' || cleanCmd === 'cls') {
        term.clear();
        writePrompt(term);
        return;
      }

      if (isExecutingRef.current) {
        term.writeln('\x1b[33m[runner busy]: Wait for the current command to finish.\x1b[0m');
        writePrompt(term);
        return;
      }

      isExecutingRef.current = true;
      callbacksRef.current.onBusyChange?.(true);

      try {
        term.writeln(
          approved
            ? `\x1b[33m[authorized execution]: $ ${cleanCmd}\x1b[0m`
            : '\x1b[90m[checking policy & executing in runner boundary]...\x1b[0m'
        );

        const res = await apiFetch('/v1/edith/execute', {
          method: 'POST',
          body: JSON.stringify({ command: cleanCmd, approved })
        });
        const data = await safeParseJson(res);

        if (res.status === 409 && data?.errorCode === 'APPROVAL_REQUIRED') {
          term.writeln(
            `\x1b[33m[POLICY GATE // APPROVAL REQUIRED]: ${data.message || 'Explicit confirmation required.'}\x1b[0m`
          );
          callbacksRef.current.onApprovalRequired?.(cleanCmd, data.policy || null);
          return;
        }

        if (res.status === 403 && data?.errorCode === 'POLICY_DENIED') {
          term.writeln(
            `\x1b[31m[POLICY GATE // DENIED]: ${data.message || 'Command blocked by zero-trust policy.'}\x1b[0m`
          );
          return;
        }

        if (!res.ok) {
          term.writeln(
            `\x1b[31m[RUNNER ERROR ${res.status}]: ${data?.message || 'Execution failed or runner offline.'}\x1b[0m`
          );
          return;
        }

        if (data?.stdout) {
          term.write(String(data.stdout).replace(/\r?\n/g, '\r\n'));
          if (!String(data.stdout).endsWith('\n')) term.writeln('');
        }
        if (data?.stderr) {
          term.write(`\x1b[31m${String(data.stderr).replace(/\r?\n/g, '\r\n')}\x1b[0m`);
          if (!String(data.stderr).endsWith('\n')) term.writeln('');
        }

        const exitCode = data?.exitCode ?? 0;
        const duration = data?.durationMs ?? 0;
        const color = exitCode === 0 ? '\x1b[32m' : '\x1b[31m';
        term.writeln(`${color}[exit code: ${exitCode} | ${duration}ms]\x1b[0m`);
        callbacksRef.current.onCommandExecuted?.(cleanCmd, data);
      } catch (err) {
        term.writeln(
          `\x1b[31m[RUNNER CONNECTION ERROR]: ${err?.message || 'Unable to reach execution API.'}\x1b[0m`
        );
      } finally {
        isExecutingRef.current = false;
        callbacksRef.current.onBusyChange?.(false);
        writePrompt(term);
      }
    },
    [writePrompt]
  );

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 12,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
      theme: {
        background: '#05070e',
        foreground: '#e2e8f0',
        cursor: '#22d3ee',
        selectionBackground: 'rgba(6, 182, 212, 0.3)',
        black: '#0f172a',
        red: '#f87171',
        green: '#34d399',
        yellow: '#fbbf24',
        blue: '#38bdf8',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#f8fafc'
      }
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    try {
      fitAddon.fit();
    } catch {
      // ignore initial hidden mount fit errors
    }
    xtermInstance.current = term;

    term.writeln('\x1b[1;36m====================================================================\x1b[0m');
    term.writeln('\x1b[1;32m  E.D.I.T.H. ISOLATED RUNNER SHELL // PORT 8003 (NON-DOCKER)\x1b[0m');
    term.writeln('\x1b[1;36m====================================================================\x1b[0m');
    term.writeln('\x1b[90mFail-closed policy gate active. Every command is checked before execution.\x1b[0m');
    term.writeln('\x1b[90mTry: \x1b[33mgit status\x1b[90m, \x1b[33mpytest\x1b[90m, \x1b[33mnpm test\x1b[90m, or \x1b[33mecho hello\x1b[0m\n');
    writePrompt(term);

    const dataDisposable = term.onData((data) => {
      const code = data.charCodeAt(0);
      if (code === 13) {
        term.writeln('');
        const cmd = commandLineBuffer.current.trim();
        commandLineBuffer.current = '';
        executeCommand(term, cmd, { approved: false });
      } else if (code === 127 || code === 8) {
        if (commandLineBuffer.current.length > 0) {
          commandLineBuffer.current = commandLineBuffer.current.slice(0, -1);
          term.write('\b \b');
        }
      } else if (code >= 32) {
        commandLineBuffer.current += data;
        term.write(data);
      }
    });

    const safeFit = () => {
      try {
        fitAddon.fit();
      } catch {
        // ignore resize while hidden
      }
    };

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' && containerRef.current
        ? new ResizeObserver(safeFit)
        : null;
    if (resizeObserver && containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    window.addEventListener('resize', safeFit);

    return () => {
      window.removeEventListener('resize', safeFit);
      resizeObserver?.disconnect();
      dataDisposable.dispose();
      xtermInstance.current = null;
      term.dispose();
    };
  }, [executeCommand, writePrompt]);

  useEffect(() => {
    if (!pendingCommand?.command || !xtermInstance.current) return;
    const term = xtermInstance.current;
    const { command, approved = false } = pendingCommand;
    onPendingCommandHandled?.();
    term.writeln(`\x1b[90m[dispatched]: $ ${command}\x1b[0m`);
    executeCommand(term, command, { approved });
  }, [pendingCommand, executeCommand, onPendingCommandHandled]);

  return (
    <div ref={containerRef} className="w-full h-full p-2 bg-[#05070e] overflow-hidden">
      <div ref={terminalRef} className="w-full h-full" />
    </div>
  );
}
