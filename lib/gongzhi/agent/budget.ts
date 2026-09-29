export class AssistantLimitError extends Error {
  readonly code: 'model_budget' | 'search_budget' | 'timed_out' | 'cancelled';
  constructor(code: AssistantLimitError['code']) {
    super(`Assistant stopped: ${code}`);
    this.name = 'AssistantLimitError';
    this.code = code;
  }
}

/** A single request's counters and cancellation scope, not a background runner. */
export function createRunBudget(options: { signal: AbortSignal; deadlineAt?: number; now?: () => number }) {
  const now = options.now ?? Date.now;
  const deadlineAt = Math.min(options.deadlineAt ?? Infinity, now() + 60_000);
  const controller = new AbortController();
  const onDisconnect = () => controller.abort(new AssistantLimitError('cancelled'));
  options.signal.addEventListener('abort', onDisconnect, { once: true });
  if (options.signal.aborted) onDisconnect();
  const timer = setTimeout(() => controller.abort(new AssistantLimitError('timed_out')), Math.max(0, deadlineAt - now()));
  let modelSteps = 0;
  let searches = 0;

  function check() {
    if (!controller.signal.aborted && now() >= deadlineAt) controller.abort(new AssistantLimitError('timed_out'));
    controller.signal.throwIfAborted();
  }
  return {
    signal: controller.signal,
    deadlineAt,
    check,
    beginModelStep() {
      check();
      if (modelSteps >= 4) throw new AssistantLimitError('model_budget');
      modelSteps++;
    },
    beginSearch() {
      check();
      if (searches >= 2) throw new AssistantLimitError('search_budget');
      searches++;
    },
    usage: () => ({ modelSteps, searches }),
    cancel: (reason: unknown = new AssistantLimitError('cancelled')) => controller.abort(reason),
    dispose() {
      clearTimeout(timer);
      options.signal.removeEventListener('abort', onDisconnect);
    },
  };
}
