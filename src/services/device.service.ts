import { AxiosError, AxiosResponse } from 'axios';
import { CharacteristicValue } from 'homebridge';
import { Endpoints } from '../api/endpoints';
import { createHttpClientWithBearerInterceptor } from '../api/http-client-factory';
import { DeviceFunction, isNoFunction } from '../models/device-function';
import { HubspacePlatform } from '../platform';
import { isAferoError } from '../responses/afero-error-response';
import { DeviceStatusResponse } from '../responses/device-status-response';
import { convertNumberToHex } from '../utils';

/**
 * Service for interacting with devices
 */
export class DeviceService {

    private readonly _httpClient = createHttpClientWithBearerInterceptor({
        baseURL: Endpoints.API_BASE_URL
    });


    constructor(private readonly _platform: HubspacePlatform) { }

    /**
     * Sets an attribute value for a device
     * @param deviceId ID of a device
     * @param deviceFunction Function to set value for
     * @param value Value to set to attribute
     */
    async setValue(deviceId: string, deviceFunction: DeviceFunction, value: CharacteristicValue): Promise<void> {
        let response: AxiosResponse;

        if (isNoFunction(deviceFunction)) {
            throw new this._platform.api.hap.HapStatusError(this._platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }

        try {
            response = await this._httpClient.post(`accounts/${this._platform.accountService.accountId}/devices/${deviceId}/actions`, {
                type: 'attribute_write',
                attrId: deviceFunction.attributeId,
                data: this.getDataValue(value)
            });
        } catch (ex) {
            this.handleError(<AxiosError>ex);

            return;
        }

        if (response.status === 200) return;

        this._platform.log.error(`Remote server did not accept new value ${value} for device (ID: ${deviceId}).`);
    }

    /**
     * Gets a value for attribute
     * @param deviceId ID of a device
     * @param deviceFunction Function to get value for
     * @returns Data value
     */
    async getValue(deviceId: string, deviceFunction: DeviceFunction): Promise<CharacteristicValue | undefined> {
        let deviceStatus: DeviceStatusResponse;

        if (isNoFunction(deviceFunction)) {
            throw new this._platform.api.hap.HapStatusError(this._platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }

        try {
            const response =
                await this._httpClient
                    .get<DeviceStatusResponse>(`accounts/${this._platform.accountService.accountId}/devices/${deviceId}?expansions=attributes`);
            deviceStatus = response.data;
        } catch (ex) {
            this.handleError(<AxiosError>ex);

            return undefined;
        }

        const attributeResponse = deviceStatus.attributes.find(a => a.id.toString() === deviceFunction.attributeId);

        if (!attributeResponse) {
            this._platform.log.error(`Failed to find value for ${deviceFunction.characteristic} for device (device ID: ${deviceId})`);
            return undefined;
        }

        return attributeResponse.value;
    }

    /**
     * Gets a value for attribute as boolean
     * @param deviceId ID of a device
     * @param deviceFunction Function to get value for
     * @returns Boolean value
     */
    async getValueAsBoolean(deviceId: string, deviceFunction: DeviceFunction): Promise<boolean | undefined> {
        const value = await this.getValue(deviceId, deviceFunction);

        if (!value) return undefined;

        return value === '1';
    }

    /**
     * Gets a value for attribute as integer
     * @param deviceId ID of a device
     * @param deviceFunction Function to get value for
     * @returns Integer value
     */
    async getValueAsInteger(deviceId: string, deviceFunction: DeviceFunction): Promise<number | undefined> {
        const value = await this.getValue(deviceId, deviceFunction);

        if (!value || typeof value !== 'string') return undefined;

        const numberValue = Number.parseInt(value);

        return Number.isNaN(numberValue) ? undefined : numberValue;
    }

    async getValueAsString(deviceId: string, deviceFunction: DeviceFunction): Promise<string> {
        const value = await this.getValue(deviceId, deviceFunction);

        return !value || typeof value !== 'string' ? '' : value;
    }

    private getDataValue(value: CharacteristicValue): string {

        if (typeof value === 'boolean') {
            return value ? '01' : '00';
        }

        if (typeof value === 'number') {
            return convertNumberToHex(value);
        }

        if (typeof value === 'string') {
            return value;
        }

        throw new Error('The value type is not supported.');
    }

    private handleError(error: AxiosError): void {
        const responseData = error.response?.data;
        const errorMessage = isAferoError(responseData) ? responseData.error_description : error.message;

        this._platform.log.error('The remote service returned an error.', errorMessage);
    }

}