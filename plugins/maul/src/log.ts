// src/log.ts — leveled logging with a debug gate, so `debug` config flips verbosity without
// scattering `if (cfg.debug)` through the call sites.
//
// Everything routes through console.log with a severity tag rather than console.info/warn/error.
// The SDK typings declare all four, but the core installs only `log` on older builds
// (v8host.rs `install_natives`: "console = { log: fn }"), and calling console.info there throws
// at load. A tagged line reads the same in the server log and works on every core.

const PREFIX = "[maul]";

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}

export function createLogger(isDebug: () => boolean): Logger {
  return {
    info: (message) => console.log(`${PREFIX} ${message}`),
    warn: (message) => console.log(`${PREFIX} WARN: ${message}`),
    error: (message) => console.log(`${PREFIX} ERROR: ${message}`),
    debug: (message) => {
      if (isDebug()) console.log(`${PREFIX} DEBUG: ${message}`);
    },
  };
}
