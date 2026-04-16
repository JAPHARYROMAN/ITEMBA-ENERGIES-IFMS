import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  LoggerService,
} from "@nestjs/common";
import { Request, Response } from "express";

/** Consistent error shape (problem-details–style) for all API errors */
export interface ErrorResponseBody {
  type: string;
  statusCode: number;
  error: string;
  message: string | string[];
  timestamp: string;
  path: string;
  requestId?: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request as Request & { id?: string }).id;

    const { statusCode, message } = this.normalizeException(exception);
    const body: ErrorResponseBody = {
      type: `https://api.ifms.local/errors#${statusCode}`,
      statusCode,
      error: this.getErrorName(statusCode),
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(requestId && { requestId }),
    };

    this.logger.error(
      `[${request.method}] ${request.url} ${statusCode} - ${Array.isArray(message) ? message.join(", ") : message}`,
      exception instanceof Error ? exception.stack : undefined,
      "HttpExceptionFilter",
    );

    response.status(statusCode).json(body);
  }

  private normalizeException(exception: unknown): {
    statusCode: number;
    message: string | string[];
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const message =
        typeof res === "object" && res !== null && "message" in res
          ? ((res as { message?: string | string[] }).message ??
            exception.message)
          : exception.message;
      return { statusCode: status, message };
    }

    if (exception instanceof Error) {
      const pgError = exception as any;
      if (pgError.code) {
        if (pgError.code === "23505") {
          // unique_violation
          return {
            statusCode: HttpStatus.CONFLICT,
            message: "A record with these details already exists.",
          };
        }
        if (pgError.code === "23503") {
          // foreign_key_violation
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            message:
              "The referenced record does not exist or has been removed.",
          };
        }
        if (pgError.code === "23514") {
          // check_violation
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            message: "A data constraint was violated. Please check your input.",
          };
        }
        if (pgError.code === "23502") {
          // not_null_violation
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            message: "A required field is missing.",
          };
        }
        if (pgError.code === "23506") {
          // exclusion_violation
          return {
            statusCode: HttpStatus.CONFLICT,
            message: "This record conflicts with an existing entry.",
          };
        }
        if (pgError.code === "42P01") {
          // undefined_table
          return {
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            message: "Database configuration error. Please contact support.",
          };
        }
        if (pgError.code === "57014") {
          // query_canceled (timeout)
          return {
            statusCode: HttpStatus.GATEWAY_TIMEOUT,
            message:
              "The operation took too long. Please try again or narrow your query.",
          };
        }
        if (pgError.code === "53300" || pgError.code === "53400") {
          // too_many_connections / configuration_limit_exceeded
          return {
            statusCode: HttpStatus.SERVICE_UNAVAILABLE,
            message:
              "The server is temporarily overloaded. Please try again shortly.",
          };
        }
      }

      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message:
          process.env.NODE_ENV === "production"
            ? "Internal server error"
            : exception.message,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
    };
  }

  private getErrorName(statusCode: number): string {
    const names: Record<number, string> = {
      400: "Bad Request",
      401: "Unauthorized",
      403: "Forbidden",
      404: "Not Found",
      409: "Conflict",
      422: "Unprocessable Entity",
      500: "Internal Server Error",
    };
    return names[statusCode] ?? "Error";
  }
}
