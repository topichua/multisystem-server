import { ConsoleLogger, LogLevel, type ConsoleLoggerOptions } from '@nestjs/common';
import { basename } from 'node:path';

export class LocationLogger extends ConsoleLogger {
  constructor(
    context?: string,
    options?: ConsoleLoggerOptions & { logLevels?: LogLevel[] },
  ) {
    super(context ?? 'App', options ?? {});
  }

  override log(message: unknown, context?: string): void {
    super.log(this.decorateMessage(message), context);
  }

  override error(message: unknown, stack?: string, context?: string): void {
    super.error(this.decorateMessage(message), stack, context);
  }

  override warn(message: unknown, context?: string): void {
    super.warn(this.decorateMessage(message), context);
  }

  override debug(message: unknown, context?: string): void {
    super.debug(this.decorateMessage(message), context);
  }

  override verbose(message: unknown, context?: string): void {
    super.verbose(this.decorateMessage(message), context);
  }

  private decorateMessage(message: unknown): string {
    const msg =
      typeof message === 'string' ? message : JSON.stringify(message ?? '');
    const loc = this.detectCallerLocation();
    if (!loc) return msg;
    return `[${loc}] ${msg}`;
  }

  private detectCallerLocation(): string | null {
    const stack = new Error().stack;
    if (!stack) return null;
    const lines = stack.split('\n').map((x) => x.trim());
    for (const line of lines) {
      if (
        line.includes('LocationLogger.') ||
        line.includes('ConsoleLogger.') ||
        line.includes('/node_modules/')
      ) {
        continue;
      }

      const byParen = /\((.*):(\d+):(\d+)\)$/.exec(line);
      if (byParen?.[1] && byParen[2]) {
        return `${basename(byParen[1])}:${byParen[2]}`;
      }

      const direct = /at (.*):(\d+):(\d+)$/.exec(line);
      if (direct?.[1] && direct[2]) {
        return `${basename(direct[1])}:${direct[2]}`;
      }
    }
    return null;
  }
}
