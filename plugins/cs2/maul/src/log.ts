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
