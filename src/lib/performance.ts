import 'server-only';

// Only route names and durations are logged. Never log cookies, URLs, query
// parameters, user IDs, question content or Supabase response bodies.
export function performanceFetch(id: string | null, route: string | null) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const started = performance.now();
    const response = await fetch(input, init);
    if (id && route && /^\/(dashboard|classes|exams|results)$/.test(route)) {
      const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
      const operation = path.startsWith('/auth/')
        ? 'auth'
        : path.startsWith('/storage/')
          ? 'storage'
          : path
              .replace('/rest/v1/', '')
              .replace(/[^a-z_/]/gi, '')
              .slice(0, 60);
      console.info(
        'performance_fetch',
        JSON.stringify({
          id,
          route,
          operation,
          ms: Math.round(performance.now() - started),
          status: response.status,
          region: process.env.VERCEL_REGION || 'local',
        }),
      );
    }
    return response;
  };
}
