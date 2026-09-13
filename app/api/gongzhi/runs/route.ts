import { StartRunSchema } from '../../../../lib/gongzhi/contracts.ts';
import { errorResponse, GongzhiError } from '../../../../lib/gongzhi/errors.ts';
import { resolveRunIdentity } from '../../../../lib/gongzhi/runs.ts';
import { executeAssistant } from '../../../../lib/gongzhi/agent/execute.ts';
import { AssistantUnavailableError, getAssistantConfig } from '../../../../lib/gongzhi/agent/config.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Leave room for identity checks and durable settlement outside the 60-second SDK deadline.
export const maxDuration = 75;

export async function POST(request: Request) {
  try {
    const input = StartRunSchema.parse(await request.json());
    const identity = await resolveRunIdentity(request);
    const config = getAssistantConfig();
    const run = await executeAssistant({ identity, input, signal: request.signal, ...config });
    return Response.json({ ok: true, data: run, mode: 'live' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error instanceof AssistantUnavailableError
      ? new GongzhiError(503, 'unavailable', error.message)
      : error instanceof SyntaxError ? new GongzhiError(400, 'invalid_request', '请求必须是 JSON。') : error);
  }
}
