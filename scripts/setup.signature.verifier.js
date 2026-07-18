const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const backend_root = join(__dirname, '..');
const venv_root = join(backend_root, '.venv-signatures');
const venv_python =
  process.platform === 'win32'
    ? join(venv_root, 'Scripts', 'python.exe')
    : join(venv_root, 'bin', 'python');
const requirements_path = join(backend_root, 'signature-verifier', 'requirements.txt');

function run(executable, args) {
  const result = spawnSync(executable, args, {
    cwd: backend_root,
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
      cwd: backend_root,
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

if (!existsSync(venv_python)) {
  const python = findPython();
  if (!run(python.executable, [...python.prefix, '-m', 'venv', venv_root])) {
    throw new Error('No se pudo crear .venv-signatures.');
  }
}

const requirements_text = readFileSync(requirements_path, 'utf8');
const required_version = requirements_text.match(/pyHanko(?:\[[^\]]+\])?==([^\s]+)/i)?.[1];
if (!required_version) {
  throw new Error('requirements.txt no fija una version de pyHanko.');
}

if (installedVersion(venv_python) !== required_version) {
  if (
    !run(venv_python, [
      '-m',
      'pip',
      'install',
      '--disable-pip-version-check',
      '-r',
      requirements_path,
    ])
  ) {
    throw new Error('No se pudieron instalar las dependencias del verificador de firmas.');
  }
}

console.log(`Verificador de firmas listo: pyHanko ${required_version}`);
