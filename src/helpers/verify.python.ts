import { spawnSync } from 'child_process';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { PythonBridge } from './python.bridge';
import { REQUIRED_MODULES } from '../settings';

export function createVirtualEnv(bridge: PythonBridge): void {
  const path = join(bridge.venvDir, 'bin', 'python');

  if (bridge.config.doDebugLogging) {
    bridge.log.info(`[ DEBUG ]: Sanity checking the VENV at ${path}...`);
  }

  if (!existsSync(path)) {
    bridge.log.info('Setting up Python virtualenv...');

    spawnSync('python3', ['-m', 'venv', '.venv'], { cwd: bridge.pyDir, stdio: 'inherit' });
    spawnSync(join(bridge.venvDir, 'bin', 'pip'), ['install', '-r', 'requirements.txt'], {
      cwd: bridge.pyDir,
      stdio: 'inherit'
    });
  }
}

export function verifyPythonEnvironment(bridge: PythonBridge): void {
  try {
    // Check Python version
    const pythonVersion = execSync(`${bridge.executablePath} --version`).toString().trim();

    if (bridge.config.doDebugLogging) {
      bridge.log.info(`[ DEBUG Python Check ]: Python version: ${pythonVersion}`);
    }

    // Check if the Python script exists
    execSync(`test -f ${bridge.script}`);

    if (bridge.config.doDebugLogging) {
      bridge.log.info(`[ DEBUG Python Check ]: ${bridge.script} exists`);
    }

    // Check required Python packages
    REQUIRED_MODULES.forEach(mod => {
      try {
        execSync(`${bridge.executablePath} -c "import ${mod}"`);
        if (bridge.config.doDebugLogging) {
          bridge.log.info(`[ DEBUG Python Check ]: Python module '${mod}' is installed.`);
        }
      } catch (modErr) {
        bridge.log.error(`[ Python Check ]: Missing Python module: '${mod}'`);
        throw new Error(`[ Python Check ]: Missing Python module: '${mod}'`);
      }
    });

    // Run JSON-based sanity check
    const sanityRaw = execSync(`${bridge.executablePath} ${bridge.script} --sanity-check`).toString();
    const sanity = JSON.parse(sanityRaw);

    if (sanity.status !== 'ok') {
      throw new Error(`[ Python Check ]: Sanity check failed. Got: ${sanityRaw}`);
    }

    if (bridge.config.doDebugLogging) {
      bridge.log.info(`[ DEBUG Python Check ]: ✅ Sanity check passed: ${sanity.message || ''}`);
    }
  } catch (error: any) {
    bridge.log.error(`[ Python Check ]: ❌ Environment check failed: ${error.message || error}`);
    throw error;
  }
}
