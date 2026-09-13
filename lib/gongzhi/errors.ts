import { z } from "zod";
import { HttpError } from "../http";
import { DbTimeoutError } from "../db-timeout";
import type { ApiError, ErrorCode } from "./contracts";
export class GongzhiError extends HttpError {
  constructor(status: number, code: ErrorCode, message: string, public details?: Record<string, unknown>) { super(status, code, message); }
}
export function errorResponse(error: unknown): Response {
  let status = 500;
  let detail: ApiError = { code: "upstream_failed", message: "服务处理失败，写入状态需使用同一幂等键核对。", retryable: true };
  if (error instanceof GongzhiError) { status = error.status; detail = { code: error.code as ErrorCode, message: error.message, retryable: status >= 500, ...(error.details ? { details: error.details } : {}) }; }
  else if (error instanceof z.ZodError) { status = 400; detail = { code: "invalid_request", message: "请求参数不符合约定。", retryable: false, details: { issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } }; }
  else if (error instanceof DbTimeoutError) { status = 503; detail = { code: "timeout", message: "数据库响应超时，写入结果未知。请使用同一幂等键核对。", retryable: true }; }
  else if (error instanceof HttpError) { status = error.status; detail = { code: status === 404 ? "not_found" : status === 429 || error.code === "capacity" ? "budget_exceeded" : "invalid_request", message: error.message, retryable: status >= 500 }; }
  return Response.json({ ok: false, error: detail, mode: "live" }, { status, headers: { "Cache-Control": "no-store" } });
}
export function assertDatabaseConfigured() {
  if (process.env.GONGZHI_DATABASE_ENABLED !== "true" || !process.env.DATABASE_URL) throw new GongzhiError(503, "unavailable", "尚未配置本项目的授权数据库。");
}
