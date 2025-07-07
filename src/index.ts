import { API } from 'homebridge';
import { HubspacePlatform } from './platform';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';

/**
 * This method registers the platform with Homebridge
 */
export = (api: API) => {
    api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, HubspacePlatform);
};
