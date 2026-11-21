import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function getPythonPath(serviceDir) {
  const isWindows = process.platform === 'win32';
  const venvPythonWin = path.join(serviceDir, '.venv', 'Scripts', 'python.exe');
  const venvPythonPosix = path.join(serviceDir, '.venv', 'bin', 'python');

  if (isWindows && fs.existsSync(venvPythonWin)) return venvPythonWin;
  if (!isWindows && fs.existsSync(venvPythonPosix)) return venvPythonPosix;

  // Fallback to edith-engine .venv if friday-ai doesn't have its own
  const edithVenvWin = path.join(repoRoot, 'services', 'edith-engine', '.venv', 'Scripts', 'python.exe');
  const edithVenvPosix = path.join(repoRoot, 'services', 'edith-engine', '.venv', 'bin', 'python');
  if (isWindows && fs.existsSync(edithVenvWin)) return edithVenvWin;
  if (!isWindows && fs.existsSync(edithVenvPosix)) return edithVenvPosix;

  return isWindows ? 'python.exe' : 'python3';
}

function runFridayAi() {
  const serviceDir = path.join(repoRoot, 'services', 'friday-ai');
  const pythonBin = getPythonPath(serviceDir);
  const testScript = path.join(serviceDir, 'app', 'tests', 'test_friday_ai.py');

  console.log(`\n================================================================================`);
  console.log(`  Running F.R.I.D.A.Y. AI Python Test Suite`);
  console.log(`  Interpreter: ${pythonBin}`);
  console.log(`================================================================================`);

  const result = spawnSync(pythonBin, [testScript], {
    cwd: serviceDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      PYTHONPATH: serviceDir,
      FRIDAY_AI_PROVIDER: 'mock',
      OPENAI_API_KEY: '',
      ANTHROPIC_API_KEY: '',
      GEMINI_API_KEY: ''
    }
  });

  if (result.status !== 0) {
    console.error(`❌ F.R.I.D.A.Y. AI test suite failed with exit code ${result.status}`);
    return false;
  }
  return true;
}

function runEdithEngine() {
  const serviceDir = path.join(repoRoot, 'services', 'edith-engine');
  const isWindows = process.platform === 'win32';
  const venvPytestWin = path.join(serviceDir, '.venv', 'Scripts', 'pytest.exe');
  const venvPytestPosix = path.join(serviceDir, '.venv', 'bin', 'pytest');

  let runnerBin = isWindows ? 'pytest.exe' : 'pytest';
  let runnerArgs = ['app/tests', '-v'];

  if (isWindows && fs.existsSync(venvPytestWin)) {
    runnerBin = venvPytestWin;
  } else if (!isWindows && fs.existsSync(venvPytestPosix)) {
    runnerBin = venvPytestPosix;
  } else {
    // Fall back to python -m pytest
    runnerBin = getPythonPath(serviceDir);
    runnerArgs = ['-m', 'pytest', 'app/tests', '-v'];
  }

  console.log(`\n================================================================================`);
  console.log(`  Running E.D.I.T.H. Engine Pytest Suite`);
  console.log(`  Runner: ${runnerBin}`);
  console.log(`================================================================================`);

  const result = spawnSync(runnerBin, runnerArgs, {
    cwd: serviceDir,
    stdio: 'inherit',
    env: { ...process.env, PYTHONPATH: serviceDir }
  });

  if (result.status !== 0) {
    console.error(`❌ E.D.I.T.H. Engine test suite failed with exit code ${result.status}`);
    return false;
  }
  return true;
}

const target = process.argv[2] || 'all';
let allPassed = true;

if (target === 'friday-ai' || target === 'all') {
  const ok = runFridayAi();
  if (!ok) allPassed = false;
}

if (target === 'edith-engine' || target === 'all') {
  const ok = runEdithEngine();
  if (!ok) allPassed = false;
}

if (!allPassed) {
  process.exit(1);
} else {
  console.log(`\n✅ All Python test suites completed successfully.`);
}
