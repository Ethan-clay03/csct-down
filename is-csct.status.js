// Frontend JavaScript to display CSCT Cloud status
// Pure client-side implementation for static hosting with theme support

class ThemeManager {
  constructor() {
    this.storageKey = 'csct-theme-preference';
    this.init();
  }

  init() {
    // Get stored preference or detect system preference
    const stored = localStorage.getItem(this.storageKey);
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    let theme = stored;
    if (!theme) {
      theme = 'system';
    }
    
    this.setTheme(theme);
    this.setupToggle();
    
    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (this.getCurrentTheme() === 'system') {
        this.applyTheme('system');
      }
    });
  }

  setupToggle() {
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => this.toggleTheme());
    }
  }

  getCurrentTheme() {
    return localStorage.getItem(this.storageKey) || 'system';
  }

  setTheme(theme) {
    localStorage.setItem(this.storageKey, theme);
    this.applyTheme(theme);
  }

  applyTheme(theme) {
    const html = document.documentElement;
    
    // Remove any existing theme attribute first
    html.removeAttribute('data-theme');
    
    // Force a reflow to ensure the attribute change is applied
    html.offsetHeight;
    
    if (theme === 'dark') {
      html.setAttribute('data-theme', 'dark');
    } else if (theme === 'light') {
      html.setAttribute('data-theme', 'light');
    }
    // For 'system' theme, we leave no attribute (handled by CSS media query)
  }

  toggleTheme() {
    const current = this.getCurrentTheme();
    let next;
    
    switch (current) {
      case 'light':
        next = 'dark';
        break;
      case 'dark':
        next = 'system';
        break;
      case 'system':
      default:
        next = 'light';
    }
    
    console.log(`Theme toggle: ${current} → ${next}`); // Debug log
    this.setTheme(next);
  }
}

class CSCTStatus {
  constructor() {
    this.statusDot = document.getElementById('status-dot');
    this.statusTextMain = document.getElementById('status-text-main');
    this.statusDetail = document.getElementById('status-detail');
    this.statusMeta = document.getElementById('status-meta');
    this.uptimeSummary = document.getElementById('uptime-summary');
    this.downtimeCount = document.getElementById('downtime-count');
    this.downtimeSection = document.getElementById('downtime-incidents');
    this.incidentsList = document.getElementById('incidents-list');
    
    // Store status data in localStorage for persistence
    this.storageKey = 'csct-status-data';
    
    this.init();
  }

  init() {
    // Load initial status from localStorage
    this.loadStoredStatus();
    
    // Poll server connectivity every 15 minutes (900000ms) - only once
    setInterval(() => this.checkServerStatus(), 900000);
    
    // Also do initial check immediately on page load
    this.checkServerStatus();
  }

  loadStoredStatus() {
    // Load and display stored status without pinging
    const status = this.getStoredStatus();
    this.updateUI(status);
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
      lastChecked: null,
      downtimeIncidents: [], // New: track individual downtime incidents
      totalOutages: 0 // New: count total number of outages
    };
  }

  saveStatus(status) {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(status));
    } catch (error) {
      console.warn('Failed to save status to localStorage:', error);
    }
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
      // Test TCP connection to port 22 (SSH) - equivalent to Test-NetConnection
      const result = await this.testNetConnection('csctcloud.uwe.ac.uk', 22, 5000);
      
      if (result.tcpTestSucceeded) {
        // Port 22 is reachable
        const isOnline = true;
        const newStatus = this.computeDurations(prevStatus, now, isOnline);
        newStatus.latency = result.latency;
        newStatus.portTest = { port: 22, succeeded: true };
        
        this.saveStatus(newStatus);
        this.updateUI(newStatus);
        console.log(`[${now.toISOString()}] Port 22 test succeeded - latency: ${result.latency}ms`);
      } else {
        throw new Error('Port 22 test failed');
      }
    } catch (error) {
      // Server is offline or request failed
      const isOnline = false;
      const newStatus = this.computeDurations(prevStatus, now, isOnline);
      newStatus.latency = null;
      newStatus.error = error.message || 'connection failed';
      newStatus.portTest = { port: 22, succeeded: false };
      
      this.saveStatus(newStatus);
      this.updateUI(newStatus);
      console.log(`[${now.toISOString()}] Port 22 test failed - ${error.message}`);
    }
  }

  // TCP connection test - equivalent to PowerShell Test-NetConnection
  testNetConnection(host, port, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const socket = new WebSocket(`wss://${host}:${port}`);
      let timeoutId;

      const cleanup = () => {
        clearTimeout(timeoutId);
        socket.close();
      };

      const handleSuccess = () => {
        const latency = Date.now() - startTime;
        cleanup();
        resolve({ tcpTestSucceeded: true, latency });
      };

      const handleFailure = (error) => {
        const latency = Date.now() - startTime;
        cleanup();
        resolve({ tcpTestSucceeded: false, latency, error: error.message });
      };

      socket.onopen = handleSuccess;
      socket.onerror = handleFailure;
      socket.onclose = () => {
        if (timeoutId) {
          handleFailure(new Error('Connection closed'));
        }
      };

      timeoutId = setTimeout(() => {
        handleFailure(new Error('Connection timeout'));
      }, timeout);
    });
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
    } else {
      this.statusTextMain.textContent = 'Checking status...';
      this.statusDetail.innerHTML = 'Checking server at <code>https://csctcloud.uwe.ac.uk/</code>';
    }

    // Update meta information
    this.updateMetaInfo(status);

    // Update uptime summary
    this.updateUptimeSummary(status);
    
    // Update downtime incidents
    this.updateDowntimeIncidents(status);
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
      <span class="metric">Last check: ${lastChecked}</span>
      <span class="metric">Response: ${latencyText}</span>
    `;
  }

  updateTimeDisplay() {
    // Update the "time ago" display and current streak without full refresh
    const status = this.getStoredStatus();
    if (status && status.lastChecked) {
      const lastChecked = this.formatRelativeTime(new Date(status.lastChecked));
      const lastCheckSpan = this.statusMeta.querySelector('.metric');
      if (lastCheckSpan) {
        lastCheckSpan.textContent = `Last check: ${lastChecked}`;
      }
      
      // Also update the current streak in real-time
      this.updateCurrentStreakRealTime(status);
    }
  }

  updateCurrentStreakRealTime(status) {
    if (status.totalUpSeconds === 0 && status.totalDownSeconds === 0) {
      return; // No data yet
    }

    const now = new Date();
    const lastStatusChange = status.lastStatusChange ? new Date(status.lastStatusChange) : null;
    
    if (!lastStatusChange) return;

    // Calculate real-time streak duration
    const timeSinceChange = Math.max(0, (now.getTime() - lastStatusChange.getTime()) / 1000);
    const currentStreakSeconds = timeSinceChange;
    
    const totalSeconds = status.totalUpSeconds + status.totalDownSeconds;
    const uptimePercent = totalSeconds > 0 ? 
      ((status.totalUpSeconds / totalSeconds) * 100).toFixed(1) : 
      0;

    const streakText = this.formatDuration(currentStreakSeconds);
    const currentStatus = status.lastStatus === 'online' ? 'online' : 'offline';

    this.uptimeSummary.innerHTML = `
      Uptime: ${uptimePercent}% | Current streak: ${streakText} ${currentStatus}
    `;
  }

  updateUptimeSummary(status) {
    if (status.totalUpSeconds === 0 && status.totalDownSeconds === 0) {
      this.uptimeSummary.textContent = 'Monitoring will begin after first check.';
      if (this.downtimeCount) {
        this.downtimeCount.textContent = '';
      }
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
    
    // Update downtime count
    if (this.downtimeCount) {
      const outages = status.totalOutages || 0;
      const totalDowntime = this.formatDuration(status.totalDownSeconds);
      this.downtimeCount.textContent = `${outages} outage${outages !== 1 ? 's' : ''} • ${totalDowntime} total downtime`;
    }
  }

  updateDowntimeIncidents(status) {
    if (!this.downtimeSection || !this.incidentsList) return;
    
    const incidents = status.downtimeIncidents || [];
    
    if (incidents.length === 0) {
      this.downtimeSection.style.display = 'none';
      return;
    }
    
    this.downtimeSection.style.display = 'block';
    
    this.incidentsList.innerHTML = incidents.map(incident => {
      const startTime = new Date(incident.startTime);
      const endTime = new Date(incident.endTime);
      const duration = this.formatDuration(incident.duration);
      
      return `
        <div class="incident-item">
          <div class="incident-time">
            ${this.formatDateTime(startTime)} - ${this.formatDateTime(endTime)}
          </div>
          <div class="incident-duration">
            Downtime: ${duration}
          </div>
        </div>
      `;
    }).join('');
  }

  updateCurrentStreak(status) {
    if (status.totalUpSeconds === 0 && status.totalDownSeconds === 0) {
      return; // No data yet
    }

    const now = new Date();
    const lastStatusChange = status.lastStatusChange ? new Date(status.lastStatusChange) : null;
    
    if (!lastStatusChange) return;

    // Calculate real-time streak duration
    const timeSinceChange = Math.max(0, (now.getTime() - lastStatusChange.getTime()) / 1000);
    const currentStreakSeconds = status.currentStreakSeconds + timeSinceChange;
    
    const totalSeconds = status.totalUpSeconds + status.totalDownSeconds;
    const uptimePercent = totalSeconds > 0 ? 
      ((status.totalUpSeconds / totalSeconds) * 100).toFixed(1) : 
      0;

    const streakText = this.formatDuration(currentStreakSeconds);
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
  new ThemeManager();
  new CSCTStatus();
  
  // Credits button functionality
  const creditsBtn = document.getElementById('credits-btn');
  if (creditsBtn) {
    creditsBtn.addEventListener('click', () => {
      alert('CSCT Cloud Status Monitor\n\nCreated by:\nEthan & Josh');
    });
  }
});