// Expo's default Metro config, with fewer bundling workers. With one worker per CPU thread (16 on
// the development PC), Metro ran out of memory and crashed (exit code 0xC0000409) in
// `pnpm update:preview`, whose export cannot be given `--max-workers`. `pnpm dev:mobile` passes
// the same limit on the command line.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.maxWorkers = 2;

module.exports = config;
