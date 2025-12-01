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
    // Load initial status
    this.loadStatus();
    
    // Auto-refresh every 3 minutes (180 seconds)
    setInterval(() => this.loadStatus(), 180000);
    
    // Update "time ago" and current streak display every second
    setInterval(() => this.updateTimeDisplay(), 1000);
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

  async loadStatus() {
    // For static sites, we'll check the status directly
    await this.checkServerStatus();
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