const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const backendRoot = join(__dirname, '..');
const venvRoot = join(backendRoot, '.venv-signatures');
const venvPython =
  process.platform === 'win32'
    ? join(venvRoot, 'Scripts', 'python.exe')
    : join(venvRoot, 'bin', 'python');
const requirements = join(backendRoot, 'signature-verifier', 'requirements.txt');

function run(executable, args) {
  const result = spawnSync(executable, args, {
    cwd: backendRoot,
    env: process.env,
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
  });
  return result.status === 0;
}

function installedVersion(executable) {
  const result = spawnSync(
    executable,
    ['-c', 'import importlib.metadata; print(importlib.metadata.version("pyHanko"))'],
    {
      cwd: backendRoot,
      env: process.env,
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
    },
  );
  return result.status === 0 ? result.stdout.trim() : null;
}

function findPython() {
  const configured = process.env.PYTHON?.trim();
  const candidates = configured
    ? [configured]
    : process.platform === 'win32'
      ? ['python', 'py']
      : ['python3', 'python'];

  for (const candidate of candidates) {
    const args = candidate === 'py' ? ['-3', '--version'] : ['--version'];
    if (run(candidate, args)) return { executable: candidate, prefix: candidate === 'py' ? ['-3'] : [] };
  }
  throw new Error('No se encontro Python 3. Configure PYTHON y vuelva a intentarlo.');
}

if (!existsSync(venvPython)) {
  const python = findPython();
  if (!run(python.executable, [...python.prefix, '-m', 'venv', venvRoot])) {
    throw new Error('No se pudo crear .venv-signatures.');
  }
}

const requirementsText = readFileSync(requirements, 'utf8');
const requiredVersion = requirementsText.match(/pyHanko(?:\[[^\]]+\])?==([^\s]+)/i)?.[1];
if (!requiredVersion) {
  throw new Error('requirements.txt no fija una version de pyHanko.');
}

if (installedVersion(venvPython) !== requiredVersion) {
  if (!run(venvPython, ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', requirements])) {
    throw new Error('No se pudieron instalar las dependencias del verificador de firmas.');
  }
}

console.log(`Verificador de firmas listo: pyHanko ${requiredVersion}`);
