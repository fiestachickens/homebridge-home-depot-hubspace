import { AxiosError } from 'axios';
import { PlatformAccessory } from 'homebridge';
import { createAccessoryForDevice } from '../accessories/device-accessory-factory';
import { Devices } from '../hubspace-devices';
import { Device } from '../models/device';
import { DeviceDef, DeviceFunctionDef } from '../models/device-def';
import { DeviceFunction } from '../models/device-function';
import { getDeviceTypeForKey } from '../models/device-type';
import { HubspacePlatform } from '../platform';
import { DeviceFunctionResponse } from '../responses/device-function-response';
import { DeviceResponse } from '../responses/devices-response';
import { PLATFORM_NAME, PLUGIN_NAME } from '../settings';

/**
 * Service for discovering and managing devices
 */
export class DiscoveryService {
    private _cachedAccessories: PlatformAccessory[] = [];

    constructor(private readonly _platform: HubspacePlatform) { }

    /**
     * Receives accessory that has been cached by Homebridge
     * @param accessory Cached accessory
     */
    configureCachedAccessory(accessory: PlatformAccessory): void {
        // add the restored accessory to the accessories cache so we can track if it has already been registered
        this._cachedAccessories.push(accessory);
    }

    /**
     * Discovers new devices
     */
    async discoverDevices() {
      if (this._platform.config.doDebugLogging) {
        this._platform.log.info('[ DEBUG ]: Discovering devices...');
      }

      const devices = await this.getDevicesFromPython();

      if (!devices || devices.length === 0) {
        this._platform.log.info(`No devices discovered`);
        return;
      }

      // loop over the discovered devices and register each one if it has not already been registered
      for (const device of devices) {
          // see if an accessory with the same uuid has already been registered and restored from
          // the cached devices we stored in the `configureAccessory` method above
          const existingAccessory = this._cachedAccessories.find(accessory => accessory.UUID === device.uuid);

          if (existingAccessory) {
              // the accessory already exists
              this._platform.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
              this.registerCachedAccessory(existingAccessory, device);
          } else {
              // the accessory does not yet exist, so we need to create it
              this._platform.log.info('Adding new accessory:', device.name);
              this.registerNewAccessory(device);
          }
      }

      this.clearStaleAccessories(this._cachedAccessories.filter(a => !devices.some(d => d.uuid === a.UUID)));
    }

    private clearStaleAccessories(staleAccessories: PlatformAccessory[]): void {
        // Unregister them
        this._platform.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, staleAccessories);

        // Clear the cache array to reflect this change
        for (const accessory of staleAccessories) {
            const cacheIndex = this._cachedAccessories.findIndex(a => a.UUID === accessory.UUID);

            if (cacheIndex < 0) continue;

            this._cachedAccessories.splice(cacheIndex, 1);
        }
    }

    private registerCachedAccessory(accessory: PlatformAccessory, device: Device): void {
      accessory.context.device = device;
      this._platform.api.updatePlatformAccessories([accessory]);

      createAccessoryForDevice(device, this._platform, accessory);
    }

    private registerNewAccessory(device: Device): void {
      const accessory = new this._platform.api.platformAccessory(device.name, device.uuid);

      accessory.context.device = device;

      createAccessoryForDevice(device, this._platform, accessory);

      this._platform.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }

    private async getDevicesFromPython(): Promise<Device[]> {
      const devices = await this._platform.pythonService.getDevices();

      return devices
          .map(this.mapDeviceResponseToModel.bind(this))
          .filter(d => d.length > 0)
          .flat();
    }

    private mapDeviceResponseToModel(rawDevice: any): Device[] {
      const type = getDeviceTypeForKey(rawDevice.type);
      const deviceDef = Devices.find(d => d.deviceType === type);

      if (!deviceDef) {
        if (this._platform.config.doDebugLogging) {
          this._platform.log.info(`[ DEBUG ]: Type ${type} was not found; not initializing.`);
        }

        return [];
      }

      const supportedFunctions = this.findSupportedFunctionsForDevice(deviceDef, rawDevice.functions);
      const devices: Device[] = [];

      for (const supportedFc of supportedFunctions) {
        // Try to find a device that does NOT contain the same characteristic
        const exisingDevice = devices.find(d => !d.functions.some(df => df.characteristic === supportedFc.characteristic));

        // If the device already exists then just add the function to it
        if (exisingDevice) {
          exisingDevice.functions.push(supportedFc);
        } else {
          // Otherwise create a new device for it
          const defaultName = rawDevice.friendlyName;
          const nameQualifier = supportedFc.functionInstance ?? devices.length;
          const newName = devices.some(d => d.name === defaultName) ? `${defaultName} (${nameQualifier})` : defaultName;

          // Make sure UUID is generated as many times as there are 'virtual' devices for each device
          // because they all have the same device ID
          devices.push({
            uuid: this.generatedUuid(rawDevice.id, devices.length + 1),
            deviceId: rawDevice.deviceId,
            name: newName,
            type: type,
            manufacturer: rawDevice.manufacturer,
            model: rawDevice.model.split(',').map(m => m.trim()),
            functions: [supportedFc]
          });
        }
      }

      if (this._platform.config.doDebugLogging) {
        let output = 
        this._platform.log.info("[ DEBUG ]: Mapped Devices:");
        this._platform.log.info("      ----------------------------");

        devices.forEach((device: any) => {
          this._platform.log.info(`          Device: ${JSON.stringify(device)}`);
        });

        this._platform.log.info("      ----------------------------");
        this._platform.log.info(" ");
      }

      return devices;
    }

    /**
     * Gets all functions that are supported (have been implemented) by the plugin
     * @param deviceDef Homebridge device definition
     * @param deviceFunctionResponse Hubspace device server response
     * @returns All functions from the response that are supported by the Homebridge device
     */
    private findSupportedFunctionsForDevice(deviceDef: DeviceDef, deviceFunctionResponse: DeviceFunctionResponse[]): DeviceFunction[] {
        const supportedFunctions: DeviceFunction[] = [];

        for (const fc of deviceDef.functions) {
            const deviceFunctions = deviceFunctionResponse.filter(df => df.functionClass === fc.functionClass);

            if (deviceFunctions.length === 0) continue;

            for (const deviceFc of deviceFunctions) {
                const functionModel = this.mapToFunction(fc, deviceFc);
                supportedFunctions.push(functionModel);
            }
        }

        return supportedFunctions;
    }

    /**
     * Generates UUID from a seed value
     * @param value Value to use for UUID seed
     * @param generations How many times to run the generation algorithm
     * @returns UUID
     */
    private generatedUuid(value: string, generations = 1): string {
        for (let i = 0; i < generations; i++) {
            value = this._platform.api.hap.uuid.generate(value);
        }

        return value;
    }

    private mapToFunction(functionDef: DeviceFunctionDef, functionResponse: DeviceFunctionResponse): DeviceFunction {
        return {
            characteristic: functionDef.characteristic,
            functionInstance: functionResponse.functionInstance,
            attributeId: functionResponse.values[0].deviceValues[0].key
        };
    }

}
