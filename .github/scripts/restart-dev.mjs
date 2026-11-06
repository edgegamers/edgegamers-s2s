import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

function endpoints(config) {
  if (!config?.trim()) return [];
  let urls;
  try { urls = JSON.parse(config); } catch { throw new Error('DEV_RESTART_WEBHOOKS must be a JSON array of HTTPS URLs.'); }
  if (!Array.isArray(urls)) throw new Error('DEV_RESTART_WEBHOOKS must be a JSON array of HTTPS URLs.');
  return [...new Set(urls.map((value, index) => {
    try {
      if (typeof value !== 'string') throw new Error();
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error();
      return url.href;
    } catch { throw new Error(`Restart webhook ${index + 1} must be an HTTPS URL without user information or a fragment.`); }
  }))];
}

export async function restartDev({ config, release, fetchImpl = fetch }) {
  const urls = endpoints(config);
  if (!Array.isArray(release?.packages) || !/^[a-f0-9]{40}$/.test(release.source ?? '')) {
    throw new Error('Release metadata must contain a source commit and a packages array.');
  }
  if (urls.length === 0 || release.packages.length === 0) return { configured: urls.length > 0, sent: 0 };
  const body = JSON.stringify({ event: 's2script.dev-release', ...release });
  const failures = [];
  let sent = 0;
  for (const [index, url] of urls.entries()) {
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) failures.push(`Restart webhook ${index + 1} failed (HTTP ${response.status}).`);
      else sent++;
      await response.body?.cancel();
    } catch {
      // A fetch exception can include the secret URL. Never forward it into Actions logs.
      failures.push(`Restart webhook ${index + 1} failed (connection, timeout, or redirect).`);
    }
  }
  if (failures.length > 0) throw new Error(failures.join('\n'));
  return { configured: true, sent };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const release = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    const result = await restartDev({ config: process.env.DEV_RESTART_WEBHOOKS, release });
    console.log(result.configured ? `Requested ${result.sent} dev server restart(s).` : 'Dev restart webhooks are not configured; no restarts requested.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
