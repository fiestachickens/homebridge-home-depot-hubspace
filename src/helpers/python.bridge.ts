import { Logger, PlatformConfig } from 'homebridge';
import { spawnSync, spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { createVirtualEnv, verifyPythonEnvironment } from './verify.python';
import { join } from 'path';
import { POLLING_INTERVAL } from '../settings'; 

export class PythonBridge {
  private _proc: ChildProcessWithoutNullStreams;
  private _callbacks: ((msg: any) => void)[] = [];
  public readonly pyDir: string;
  public readonly venvDir: string;
  public readonly executablePath: string;
  public readonly script: string;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    private pluginRoot: string
  ) {
    // Set up path information
    this.pyDir = join(pluginRoot, 'vendor', 'python');
    this.venvDir = join(this.pyDir, '.venv');
    this.executablePath = join(this.venvDir, 'bin', 'python');
    this.script = join(this.pyDir, 'hubspace_cli.py');

    // Ensure the venv exists
    createVirtualEnv(this);

    this.log.info('Starting up Python...');

    verifyPythonEnvironment(this);

    if (this.config.doDebugLogging) {
      this.log.info(`[ DEBUG ]: Launching Python script`);
    }

    this._proc = spawn(this.executablePath, [
      this.script,
      this.config.username,
      this.config.password,
      POLLING_INTERVAL.toString()
    ]);

    // If the process ends early, we can no longer function.
    // TODO: This may require some hardening to handle if the plugin is restarted in boot phase
    // TODO: Consider restarting before fully failing in the future
    this._proc.on('exit', (code, signal) => {
      this.log.warn(`Python process exited with code ${code}, signal ${signal}`);
      throw new Error("Python exited early");
    });

    // Listen for feedback
    this._proc.stdout.on('data', (buf) => {
      const lines = buf.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          const cb = this._callbacks.shift();
          if (cb) {
            cb(parsed);
          } else {
            // TODO: If this happens, check for the closed message
            this.log.warn('[Hubspace Python] Received data but no callback is waiting:', parsed);
          }
        } catch (err) {
          this.log.error('[Hubspace Python] Failed to parse stdout:', err, line);
        }
      }
    });

    this._proc.stderr.on('data', (buf) => {
      this.log.error('[ Hubspace Python stderr ]', buf.toString());
      throw new Error('[ Hubspace Python stderr ]: ' + buf.toString());
    });
  }

  public shutdown() {
    if (this._proc) {
      if (this.config.doDebugLogging) {
        this.log.info('[ DEBUG ]: Terminating Python subprocess...');
      }

      this._proc.kill('SIGTERM');
    }
  }

  private send(payload: any, timeoutMs = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timeout waiting for response from Python'));
      }, timeoutMs);

      this._callbacks.push((result) => {
        clearTimeout(timer);
        resolve(result);
      });

      try {
        const json = JSON.stringify(payload);
        this._proc.stdin.write(json + '\n');
      } catch (err) {
        reject(err);
      }
    });
  }

  async getDevices() {
    return await this.send({ command: 'list_devices' });
  }

  async setDeviceState(deviceId: string, state: any) {
    if (this.config.doDebugLogging) {
      this.log.info("[ DEBUG ]: Setting Device state: ", deviceId, state);
    }

    return await this.send({ command: 'set_device_state', device_id: deviceId, state });
  }
}
