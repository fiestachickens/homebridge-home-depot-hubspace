import { CharacteristicValue, PlatformAccessory } from 'homebridge';
import { FunctionCharacteristic } from '../models/function-characteristic';
import { HubspacePlatform } from '../platform';
import { isNullOrUndefined } from '../utils';
import { HubspaceAccessory } from './hubspace-accessory';

export class OutletAccessory extends HubspaceAccessory {

    /**
     * Crates a new instance of the accessory
     * @param platform Hubspace platform
     * @param accessory Platform accessory
     */
    constructor(platform: HubspacePlatform, accessory: PlatformAccessory) {
        super(platform, accessory, platform.Service.Outlet);

        this.configurePower();
    }

    private configurePower(): void {
        if (this.supportsCharacteristic(FunctionCharacteristic.Power)) {
            this.service.getCharacteristic(this.platform.Characteristic.On)
                .onGet(this.getOn.bind(this))
                .onSet(this.setOn.bind(this));
        }
    }

    private async getOn(): Promise<CharacteristicValue> {
        const deviceFc = this.getFunctionForCharacteristics(FunctionCharacteristic.Power);
        // Try to get the value
        const value = await this.deviceService.getValueAsBoolean(this.device.deviceId, deviceFc);

        // If the value is not defined then show 'Not Responding'
        if (isNullOrUndefined(value)) {
            throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }

        // Otherwise return the value
        return value!;
    }

    private async setOn(value: CharacteristicValue): Promise<void> {
        const deviceFc = this.getFunctionForCharacteristics(FunctionCharacteristic.Power);

        await this.deviceService.setValue(this.device.deviceId, deviceFc, value);
    }

}