import puppeteer from 'puppeteer';

const LAUNCH_ARGS = ['--allow-file-access-from-files'];

function isMissingChrome(err) {
  return /Could not find Chrome|Could not find browser/i.test(err?.message || '');
}

export function launchFailureCode(firstErr, fallbackErr) {
  return isMissingChrome(firstErr) && isMissingChrome(fallbackErr)
    ? 'chrome_missing'
    : 'browser_launch_failed';
}

/**
 * Launch Chromium for rendering.
 *
 * Resolution order:
 *  1. `PUPPETEER_EXECUTABLE_PATH` — the Docker image points it at the apt-installed
 *     /usr/bin/chromium and sets PUPPETEER_SKIP_CHROMIUM_DOWNLOAD, so the image
 *     ships exactly one browser and downloads nothing at install time.
 *  2. The Chromium bundled with the installed puppeteer (downloaded by `npm install`).
 *  3. `channel: 'chrome'` — a system Google Chrome, for when the bundled download was
 *     skipped and no executable path is set.
 *
 * Container caveat: Chromium refuses to start as root without `--no-sandbox`, and the
 * Docker image runs as root — so any launch inside the container must pass that flag.
 */
export async function launchBrowser(extraArgs = []) {
  const args = [...LAUNCH_ARGS, ...extraArgs];
  try {
    return await puppeteer.launch({ args });
  } catch (err) {
    try {
      return await puppeteer.launch({ channel: 'chrome', args });
    } catch (fallbackErr) {
      console.error('Browser launch failed:', err.message);
      console.error('System Chrome fallback failed:', fallbackErr.message);
      const code = launchFailureCode(err, fallbackErr);
      const e = new Error(code === 'chrome_missing' ? 'Chrome not found' : 'Could not launch a browser');
      e.code = code;
      throw e;
    }
  }
}
