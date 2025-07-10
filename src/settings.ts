/**
 * This is the name of the platform that users will use to register the plugin in the Homebridge config.json
 */
export const PLATFORM_NAME = 'Hubspace';

/**
 * This must match the name of your plugin as defined the package.json
 */
export const PLUGIN_NAME = 'homebridge-home-depot-hubspace';

export const POLLING_INTERVAL = 30;

export const REQUIRED_MODULES = [
  'aioafero',
  'asyncio'
];
