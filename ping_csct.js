// Backend script to test SSH connectivity to csctcloud.uwe.ac.uk:22 and update status.json
//
// Usage (from repo root):
//   node ping_csct.js
//
// You can run this on a schedule (e.g. cron / scheduled task) to keep
// status.json up to date for the frontend.

const net = require('net');
const fs = require('fs');
const path = require('path');

const TARGET_HOST = 'csctcloud.uwe.ac.uk';
const TARGET_PORT = 22;
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
      lastChecked: null,
      downtimeIncidents: [], // Track individual downtime incidents
      totalOutages: 0 // Count total number of outages
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
  const wasOffline = prevStatus.lastStatus === 'offline';
  const wasOnline = prevStatus.lastStatus === 'online';

  // Status changed: reset streak and timestamp
  if (newStatus !== prevStatus.lastStatus) {
    updated.lastStatus = newStatus;
    updated.lastStatusChange = nowIso;
    
    // If coming back online from offline, record the downtime incident
    if (isOnline && wasOffline && prevStatus.lastStatusChange) {
      const downtimeStart = new Date(prevStatus.lastStatusChange);
      const downtimeDuration = Math.max(0, (now.getTime() - downtimeStart.getTime()) / 1000);
      
      if (downtimeDuration > 0) {
        const incident = {
          startTime: prevStatus.lastStatusChange,
          endTime: nowIso,
          duration: Math.round(downtimeDuration),
          id: Date.now() // Simple ID based on timestamp
        };
        
        // Add to incidents list (keep last 10)
        updated.downtimeIncidents = [
          incident,
          ...(prevStatus.downtimeIncidents || []).slice(0, 9)
        ];
        
        updated.totalOutages = (prevStatus.totalOutages || 0) + 1;
      }
    }
    
    updated.currentStreakSeconds = 0;
  } else {
    updated.currentStreakSeconds =
      (prevStatus.currentStreakSeconds || 0) + deltaSeconds;
  }

  if (isOnline) {
    updated.lastOnline = nowIso;
  }

  // Ensure arrays exist
  updated.downtimeIncidents = updated.downtimeIncidents || [];
  updated.totalOutages = updated.totalOutages || 0;

  updated.lastChecked = nowIso;
  return updated;
}

function pingHost() {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const startTime = Date.now();
    
    socket.setTimeout(TIMEOUT_MS);
    
    socket.on('connect', () => {
      const latency = Date.now() - startTime;
      socket.destroy();
      resolve({ online: true, latency, error: null });
    });
    
    socket.on('timeout', () => {
      socket.destroy(new Error('Connection timed out'));
      resolve({ online: false, latency: null, error: 'timeout' });
    });
    
    socket.on('error', (err) => {
      resolve({ online: false, latency: null, error: err.message || 'connection refused' });
    });
    
    socket.connect(TARGET_PORT, TARGET_HOST);
  });
}

async function main() {
  const now = new Date();
  const prevStatus = readStatusFile();

  const { online, latency, error } = await pingHost();
  const nextStatus = computeDurations(prevStatus, now, online);
  
  if (latency !== null) {
    nextStatus.latency = latency;
  }
  nextStatus.portTest = { port: TARGET_PORT, succeeded: online };

  writeStatusFile(nextStatus);

  // Simple log for when run manually
  const summary = online ? 'ONLINE' : 'OFFLINE';
  const latencyStr = latency !== null ? ` (${latency}ms)` : '';
  console.log(
    `[${now.toISOString()}] SSH test on ${TARGET_HOST}:${TARGET_PORT} is ${summary}${latencyStr}` +
      (error ? ` - ${error}` : '')
  );
  console.log(
    `Last up: ${nextStatus.lastOnline || 'never'} | ` +
      `Current streak: ${nextStatus.currentStreakSeconds.toFixed(0)}s | ` +
      `Total up: ${Math.round(nextStatus.totalUpSeconds)}s | ` +
      `Total down: ${Math.round(nextStatus.totalDownSeconds)}s | ` +
      `Outages: ${nextStatus.totalOutages || 0}`
  );
}

main().catch((err) => {
  console.error('Unexpected error in ping_csct:', err);
  process.exit(1);
});


