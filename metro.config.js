const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Add this to prevent crash on file changes
config.resolver.unstable_enableSymlinks = false;

module.exports = withNativeWind(config, { input: './global.css' });