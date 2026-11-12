import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Module from 'module';
import path from 'path';
import esbuild from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRoutes, PolicyDecisions, UserRoles } from '@friday-edith/contracts';
import { AgentStepPhases, SSEEventTypes } from '@friday-edith/event-schemas';
import { Tokens } from '@friday-edith/design-tokens';
import { getMonacoLanguage } from '../features/edith/utils/language.js';

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

describe('Frontend E.D.I.T.H. utilities, UI rendering & shared workspace packages', () => {
  it('getMonacoLanguage resolves supported workspace extensions accurately', () => {
    assert.equal(getMonacoLanguage('services/edith-engine/gateway.py'), 'python');
    assert.equal(getMonacoLanguage('apps/web/src/App.jsx'), 'javascript');
    assert.equal(getMonacoLanguage('services/api/src/index.ts'), 'typescript');
    assert.equal(getMonacoLanguage('services/api/prisma/schema.prisma'), 'prisma');
    assert.equal(getMonacoLanguage('runner-host/windows/setup.ps1'), 'powershell');
    assert.equal(getMonacoLanguage('README.md'), 'markdown');
    assert.equal(getMonacoLanguage('unknown.xyz'), 'plaintext');
  });

  it('CommandApprovalDrawer renders real policy state and blocks authorize button on DENIED', async () => {
    const CommandApprovalDrawer = await loadJsxComponent(
      'features/edith/agent/CommandApprovalDrawer.jsx',
      'CommandApprovalDrawer'
    );

    const confirmHtml = renderToStaticMarkup(
      React.createElement(CommandApprovalDrawer, {
        isOpen: true,
        command: 'npm install zod',
        decision: PolicyDecisions.CONFIRMATION_REQUIRED,
        reason: 'Mutates dependencies',
        riskScore: 60
      })
    );
    assert.match(confirmHtml, /role="dialog"/);
    assert.match(confirmHtml, /npm install zod/);
    assert.match(confirmHtml, /Authorize Command/);

    const deniedHtml = renderToStaticMarkup(
      React.createElement(CommandApprovalDrawer, {
        isOpen: true,
        command: 'rm -rf /',
        decision: PolicyDecisions.DENIED,
        reason: 'Destructive command prohibited',
        riskScore: 100
      })
    );
    assert.doesNotMatch(deniedHtml, /Authorize Command/);
    assert.match(deniedHtml, /Dismiss/);
  });

  it('Shared workspace packages export expected canonical constants', () => {
    assert.equal(AppRoutes.FRIDAY, '/friday');
    assert.equal(AppRoutes.EDITH, '/edith');
    assert.equal(UserRoles.USER, 'USER');
    assert.equal(SSEEventTypes.CHUNK, 'chunk');
    assert.equal(AgentStepPhases.PATCH_PROPOSAL, 'patch_proposal');
    assert.ok(Tokens.friday.colors.cyan);
    assert.ok(Tokens.edith.background);
  });
});
