import {
  ConsoleLogger,
  LogLevel,
  type ConsoleLoggerOptions,
} from "@nestjs/common";
import { basename } from "node:path";

export class LocationLogger extends ConsoleLogger {
  /** Nest bootstrap route wiring — too noisy in production logs. */
  private static readonly SUPPRESSED_CONTEXTS = new Set([
    "RouterExplorer",
    "RoutesResolver",
  ]);

  constructor(
    context?: string,
    options?: ConsoleLoggerOptions & { logLevels?: LogLevel[] },
  ) {
    super(context ?? "App", options ?? {});
  }

  override log(message: unknown, context?: string): void {
    if (this.shouldSuppressLog(message, context)) {
      return;
    }
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

  private shouldSuppressLog(message: unknown, context?: string): boolean {
    if (context && LocationLogger.SUPPRESSED_CONTEXTS.has(context)) {
      return true;
    }
    if (typeof message === "string" && /Mapped \{.*\} route/.test(message)) {
      return true;
    }
    return false;
  }

  private decorateMessage(message: unknown): string {
    const msg = this.formatLogMessage(message);
    const loc = this.detectCallerLocation();
    if (!loc) return msg;
    return `[${loc}] ${msg}`;
  }

  private formatLogMessage(message: unknown): string {
    if (typeof message === "string") {
      return message.length > 0 ? message : "(empty error message)";
    }
    if (message instanceof Error) {
      return message.stack ?? message.message;
    }
    if (message == null) {
      return String(message);
    }
    if (typeof message === "object") {
      const record = message as Record<string, unknown>;
      const nested =
        (typeof record.message === "string" && record.message) ||
        (typeof record.msg === "string" && record.msg);
      if (nested) {
        return nested;
      }
      try {
        const serialized = JSON.stringify(message);
        if (serialized !== "{}") {
          return serialized;
        }
      } catch {
        /* fall through */
      }
    }
    return String(message);
  }

  private detectCallerLocation(): string | null {
    const stack = new Error().stack;
    if (!stack) return null;
    const lines = stack.split("\n").map((x) => x.trim());
    for (const line of lines) {
      if (
        line.includes("LocationLogger.") ||
        line.includes("ConsoleLogger.") ||
        line.includes("/node_modules/")
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
