function reject() {
  return Response.json({ ok: false, mode: "demo", error: { code: "mode_mismatch", message: "演示 API 仅可由示例空间的 MSW 处理。", retryable: false } }, { status: 409 });
}
export { reject as GET, reject as POST, reject as PATCH, reject as DELETE, reject as PUT };
