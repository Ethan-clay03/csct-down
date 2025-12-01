// Frontend JavaScript to display CSCT Cloud status
// Pure client-side implementation for static hosting

class CSCTStatus {
  constructor() {
    this.statusDot = document.getElementById('status-dot');
    this.statusTextMain = document.getElementById('status-text-main');
    this.statusDetail = document.getElementById('status-detail');
    this.statusMeta = document.getElementById('status-meta');
    this.uptimeSummary = document.getElementById('uptime-summary');
    this.refreshBtn = document.getElementById('refresh-btn');
    
    // Store status data in localStorage for persistence
    this.storageKey = 'csct-status-data';
    
    this.init();
  }

  init() {
    // Load initial status
    this.loadStatus();
    
    // Set up refresh button
    this.refreshBtn.addEventListener('click', () => this.handleRefresh());
    
    // Auto-refresh every 60 seconds
    setInterval(() => this.loadStatus(), 60000);
  }

  getStoredStatus() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : this.getDefaultStatus();
    } catch (error) {
      return this.getDefaultStatus();
    }
  }

  getDefaultStatus() {
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

  saveStatus(status) {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(status));
    } catch (error) {
      console.warn('Failed to save status to localStorage:', error);
    }
  }

  async loadStatus() {
    // For static sites, we'll check the status directly
    await this.checkServerStatus();
  }

  async handleRefresh() {
    // Disable button and show loading state
    this.refreshBtn.disabled = true;
    this.refreshBtn.textContent = 'Checking...';
    
    // Show checking state in UI
    this.showCheckingState();
    
    try {
      await this.checkServerStatus();
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      // Re-enable button
      this.refreshBtn.disabled = false;
      this.refreshBtn.textContent = 'Re-check now';
    }
  }

  showCheckingState() {
    // Reset status dot to neutral state
    this.statusDot.className = 'status-dot';
    this.statusTextMain.className = 'status-text-main';
    
    // Show checking message
    this.statusTextMain.textContent = 'Checking status...';
    this.statusDetail.innerHTML = 'Pinging <code>https://csctcloud.uwe.ac.uk/</code> to check if it responds.';
    
    // Update meta to show checking state
    this.statusMeta.innerHTML = `
      <span>Last check: checking now...</span>
      <span>Response: —</span>
    `;
  }

  async checkServerStatus() {
    const now = new Date();
    const prevStatus = this.getStoredStatus();
    
    try {
      // Use a simple fetch with a timeout to check if server is responsive
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const startTime = Date.now();
      
      // Try to fetch the main page
      const response = await fetch('https://csctcloud.uwe.ac.uk/', {
        method: 'HEAD', // Use HEAD to minimize data transfer
        signal: controller.signal,
        mode: 'no-cors' // Allow cross-origin requests
      });
      
      clearTimeout(timeoutId);
      const endTime = Date.now();
      const latency = endTime - startTime;
      
      // For no-cors mode, we can't read the response, but if we get here without error, server responded
      const isOnline = true;
      const newStatus = this.computeDurations(prevStatus, now, isOnline);
      newStatus.latency = latency;
      
      this.saveStatus(newStatus);
      this.updateUI(newStatus);
      
    } catch (error) {
      // Server is offline or request failed
      const isOnline = false;
      const newStatus = this.computeDurations(prevStatus, now, isOnline);
      newStatus.latency = null;
      newStatus.error = error.name === 'AbortError' ? 'timeout' : 'connection failed';
      
      this.saveStatus(newStatus);
      this.updateUI(newStatus);
    }
  }

  computeDurations(prevStatus, now, isOnline) {
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

  updateUI(status) {
    const isOnline = status.lastStatus === 'online';
    const isOffline = status.lastStatus === 'offline';
    const isUnknown = status.lastStatus === 'unknown';

    // Update status dot and main text
    this.statusDot.className = 'status-dot';
    this.statusTextMain.className = 'status-text-main';

    if (isOnline) {
      this.statusDot.classList.add('online');
      this.statusTextMain.classList.add('online');
      this.statusTextMain.textContent = 'CSCT Cloud is online';
      this.statusDetail.innerHTML = 'Server at <code>https://csctcloud.uwe.ac.uk/</code> is responding normally.';
    } else if (isOffline) {
      this.statusDot.classList.add('offline');
      this.statusTextMain.classList.add('offline');
      this.statusTextMain.textContent = 'CSCT Cloud is offline';
      this.statusDetail.innerHTML = 'Server at <code>https://csctcloud.uwe.ac.uk/</code> is not responding.';
      if (status.error) {
        this.statusDetail.innerHTML += ` <em>(${status.error})</em>`;
      }
    } else {
      this.statusTextMain.textContent = 'Checking status...';
      this.statusDetail.innerHTML = 'Checking server at <code>https://csctcloud.uwe.ac.uk/</code>';
    }

    // Update meta information
    this.updateMetaInfo(status);

    // Update uptime summary
    this.updateUptimeSummary(status);
  }

  updateMetaInfo(status) {
    const lastChecked = status.lastChecked ? 
      this.formatRelativeTime(new Date(status.lastChecked)) : 
      'never';

    let latencyText = '—';
    if (status.latency) {
      latencyText = `${status.latency}ms`;
    } else if (status.lastStatus === 'online') {
      latencyText = '< 1s';
    } else if (status.lastStatus === 'offline') {
      latencyText = status.error || 'failed';
    }

    this.statusMeta.innerHTML = `
      <span>Last check: ${lastChecked}</span>
      <span>Response: ${latencyText}</span>
    `;
  }

  updateUptimeSummary(status) {
    if (status.totalUpSeconds === 0 && status.totalDownSeconds === 0) {
      this.uptimeSummary.textContent = 'Click "Re-check now" to begin monitoring.';
      return;
    }

    const totalSeconds = status.totalUpSeconds + status.totalDownSeconds;
    const uptimePercent = totalSeconds > 0 ? 
      ((status.totalUpSeconds / totalSeconds) * 100).toFixed(1) : 
      0;

    const streakText = this.formatDuration(status.currentStreakSeconds);
    const currentStatus = status.lastStatus === 'online' ? 'online' : 'offline';

    this.uptimeSummary.innerHTML = `
      Uptime: ${uptimePercent}% | Current streak: ${streakText} ${currentStatus}
    `;
  }

  formatRelativeTime(date) {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) {
      return `${diffSeconds}s ago`;
    } else if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else {
      return `${diffDays}d ago`;
    }
  }

  formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  showError(message) {
    this.statusTextMain.textContent = 'Error checking status';
    this.statusDetail.textContent = message;
    this.statusMeta.innerHTML = '<span>Last check: error</span><span>Response: —</span>';
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new CSCTStatus();
});