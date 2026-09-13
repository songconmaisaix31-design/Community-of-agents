import { errorResponse } from '../../../../../lib/gongzhi/errors.ts';
import { resolveRunIdentity, getRun, cancelRun } from '../../../../../lib/gongzhi/runs.ts';
import { abortLocalRun } from '../../../../../lib/gongzhi/agent/execute.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const identity = await resolveRunIdentity(request);
    const { id } = await context.params;
    return Response.json({ ok: true, data: await getRun(identity, id), mode: 'live' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const identity = await resolveRunIdentity(request);
    const { id } = await context.params;
    const run = await cancelRun(identity, id);
    // Authorization and persistent cancellation happen before local interruption.
    if (run.status === 'cancelled') abortLocalRun(id);
    return Response.json({ ok: true, data: run, mode: 'live' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error); }
}
