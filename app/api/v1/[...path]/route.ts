function disabled() {
  return Response.json({ ok: false, mode: "live", error: { code: "forbidden", message: "Use the bound Gongzhi API at /api/gongzhi.", retryable: false } }, { status: 403 });
}
export { disabled as GET, disabled as POST, disabled as PATCH, disabled as DELETE, disabled as PUT };
