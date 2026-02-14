import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';

@Injectable()
export class AppLogger implements NestLoggerService {
  private context?: string;

  setContext(context: string) {
    this.context = context;
  }

  log(message: string, context?: string) {
    this.write('info', message, context ?? this.context);
  }

  error(message: string, trace?: string, context?: string) {
    this.write('error', message, context ?? this.context, trace);
  }

  warn(message: string, context?: string) {
    this.write('warn', message, context ?? this.context);
  }

  debug(message: string, context?: string) {
    this.write('debug', message, context ?? this.context);
  }

  verbose(message: string, context?: string) {
    this.write('verbose', message, context ?? this.context);
  }

  private write(
    level: 'info' | 'error' | 'warn' | 'debug' | 'verbose',
    message: string,
    context?: string,
    trace?: string,
  ) {
    const timestamp = new Date().toISOString();
    const payload: Record<string, unknown> = {
      timestamp,
      level,
      message,
      ...(context && { context }),
      ...(trace && { trace }),
    };
    const line = JSON.stringify(payload);
    if (level === 'error') {
      process.stderr.write(line + '\n');
      if (trace) process.stderr.write(trace + '\n');
    } else {
      process.stdout.write(line + '\n');
    }
  }
}
