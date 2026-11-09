/**
 * Admin airplay chart.
 *   GET                         → { chart } — the current published chart
 *   POST { period, preview }    → { preview: { label, periodStart, periodEnd } } — the window only
 *   POST { period }             → { chart } — build from AzuraCast history and publish
 * `period` is { type: daily|weekly|monthly, mode?: rolling|published }.
 */
import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/server/env';
import { json } from '../../../lib/server/http';
import { currentAdmin } from '../../../lib/server/admin-auth';
import { currentChart, generateAndPublish, isPeriod, periodRange } from '../../../lib/server/chart';

export const prerender = false;

const unauthorized = () => json({ ok: false, error: 'Signed out. Sign in again.' }, 401);

export const GET: APIRoute = async ({ request, locals }) => {
  const env = getEnv(locals);
  if (!(await currentAdmin(env, request))) return unauthorized();
  const chart = env.DB ? await currentChart(env.DB) : null;
  return json({ ok: true, chart });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getEnv(locals);
  if (!(await currentAdmin(env, request))) return unauthorized();

  let body: { period?: unknown; preview?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: 'Malformed request.' }, 400);
  }
  if (!isPeriod(body.period)) return json({ ok: false, error: 'Pick a chart period.' }, 400);

  if (body.preview === true) {
    const { start, end, label } = periodRange(body.period);
    return json({
      ok: true,
      preview: { label, periodStart: start.toISOString(), periodEnd: end.toISOString() },
    });
  }

  try {
    const chart = await generateAndPublish(env, body.period);
    return json({ ok: true, chart });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 502);
  }
};
