// Simple backend script to ping csctcloud.uwe.ac.uk and update status.json
//
// Usage (from repo root):
//   node ping_csct.js
//
// You can run this on a schedule (e.g. cron / scheduled task) to keep
// status.json up to date for the frontend.

const https = require('https');
const fs = require('fs');
const path = require('path');

const TARGET_HOST = 'csctcloud.uwe.ac.uk';
const TARGET_PATH = '/';
const STATUS_FILE = path.join(__dirname, 'status.json');
const TIMEOUT_MS = 5000;

function readStatusFile() {
  try {
    const raw = fs.readFileSync(STATUS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    // Default structure if file doesn't exist or is invalid
    return {
      lastOnline: null,
      lastStatus: 'unknown',
      lastStatusChange: null,
      currentStreakSeconds: 0,
      totalUpSeconds: 0,
      totalDownSeconds: 0,
      lastChecked: null
    };
  }
}

function writeStatusFile(status) {
  fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2), 'utf8');
}

function computeDurations(prevStatus, now, isOnline) {
  const updated = { ...prevStatus };
  const nowIso = now.toISOString();

  const lastChecked = prevStatus.lastChecked
    ? new Date(prevStatus.lastChecked)
    : null;

  let deltaSeconds = 0;
  if (lastChecked && !Number.isNaN(lastChecked.getTime())) {
    deltaSeconds = Math.max(0, (now.getTime() - lastChecked.getTime()) / 1000);
  }

  // If previous status was known, accumulate into total up/down counters
  if (prevStatus.lastStatus === 'online') {
    updated.totalUpSeconds = (prevStatus.totalUpSeconds || 0) + deltaSeconds;
  } else if (prevStatus.lastStatus === 'offline') {
    updated.totalDownSeconds = (prevStatus.totalDownSeconds || 0) + deltaSeconds;
  }

  const newStatus = isOnline ? 'online' : 'offline';

  // Status changed: reset streak and timestamp
  if (newStatus !== prevStatus.lastStatus) {
    updated.lastStatus = newStatus;
    updated.lastStatusChange = nowIso;
    updated.currentStreakSeconds = 0;
  } else {
    updated.currentStreakSeconds =
      (prevStatus.currentStreakSeconds || 0) + deltaSeconds;
  }

  if (isOnline) {
    updated.lastOnline = nowIso;
  }

  updated.lastChecked = nowIso;
  return updated;
}

function pingHost() {
  return new Promise((resolve) => {
    const req = https.request(
      {
        host: TARGET_HOST,
        path: TARGET_PATH,
        method: 'GET',
        timeout: TIMEOUT_MS
      },
      (res) => {
        const online = res.statusCode >= 200 && res.statusCode < 500;
        // We don't need the body, just the response status
        res.resume();
        resolve({ online, error: null });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('Request timed out'));
    });

    req.on('error', (err) => {
      resolve({ online: false, error: err.message || 'network error' });
    });

    req.end();
  });
}

async function main() {
  const now = new Date();
  const prevStatus = readStatusFile();

  const { online, error } = await pingHost();
  const nextStatus = computeDurations(prevStatus, now, online);

  writeStatusFile(nextStatus);

  // Simple log for when run manually
  const summary = online ? 'ONLINE' : 'OFFLINE';
  console.log(
    `[${now.toISOString()}] csctcloud.uwe.ac.uk is ${summary}` +
      (error ? ` (${error})` : '')
  );
  console.log(
    `Last up: ${nextStatus.lastOnline || 'never'} | ` +
      `Current streak: ${nextStatus.currentStreakSeconds.toFixed(0)}s | ` +
      `Total up: ${Math.round(nextStatus.totalUpSeconds)}s | ` +
      `Total down: ${Math.round(nextStatus.totalDownSeconds)}s`
  );
}

main().catch((err) => {
  console.error('Unexpected error in ping_csct:', err);
  process.exit(1);
});


