import { Logger, PlatformConfig } from 'homebridge';
import { PythonBridge } from '../helpers/python.bridge';
import * as fs from 'fs';
import * as path from 'path';
import { POLLING_INTERVAL } from '../settings'; 

/**
 * Service for managing the python bridge
 */
export class PythonService {
    private _bridge!: PythonBridge;
    private _callbacks: ((msg: any) => void)[] = [];
    private _onBridgeLoaded?: () => void | Promise<void>;

    constructor(private log: Logger, private readonly config: PlatformConfig) { }

    public async loadBridge(): Promise<void> {
      const pluginRoot = path.join(__dirname, '../..');

      try {
        this._bridge = new PythonBridge(this.log, this.config, pluginRoot);

        // Ensure the process is cleanly shutdown 
        process.on('exit', () => this._bridge.shutdown());
        process.on('SIGINT', () => this._bridge.shutdown());
        process.on('SIGTERM', () => this._bridge.shutdown());

        if (this.config.doDebugLogging) {
          this.log.info("[ DEBUG ]: Getting devices...");
        }


        // TODO: This may need to go out to the discovery service
        /*
        // Configure polling
        setInterval(async () => {
          try {
            const updated = await this.bridge.getDevices();
            updated.devices.forEach((updatedDevice: any) => {
              const accessory = this.deviceMap.get(updatedDevice.device_id);
              if (accessory) {
                accessory.updateFromHubspace(updatedDevice);
              }
            });
          } catch (e) {
            this.log.error('Polling error:', e);
          }
        }, POLLING_INTERVAL * 1000);
        */

        if (this._onBridgeLoaded) {
            this._onBridgeLoaded();
        }
      } catch (err) {
        this.log.error('Error initializing Hubspace plugin:', err);
        throw err;
      }
    }

    async getDevices() {
      try {
        const response = await this._bridge.getDevices();
        return response.devices;
      } catch (err) {
          this.log.error('Failed to get devices from Python.', err);
          throw err;
      }
    }

    public setOnBridgeLoaded(callback: () => Promise<void>) {
        this._onBridgeLoaded = callback;
    }
}
