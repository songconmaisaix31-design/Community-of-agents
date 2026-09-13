// Upstream analytics collection is disabled.
const disabled = (..._args: unknown[]) => {};
export const track = { counter: disabled, actor: disabled, stat: disabled, retrievals: disabled, post: disabled, search: disabled, request: disabled, view: disabled };
