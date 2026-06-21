/* =========================================================
   FarmGuard AI – Alerts Page JavaScript
   ========================================================= */

'use strict';

// ============================================================
//  ALERT DATA
// ============================================================

const now = Date.now();
function minsAgo(m) { return now - m * 60 * 1000; }
function hoursAgo(h) { return now - h * 60 * 60 * 1000; }

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit' });
}
function formatDateTime(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' +
         d.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit' });
}

const alertsData = [
  // === ACTIVE (current) ===
  {
    id: 'a001',
    type: 'active',
    severity: 'critical',
    icon: '🌡️',
    title: 'Critical Temperature Alert',
    desc: 'Body temperature has reached 40.8°C, significantly above the normal bovine range of 38–39.5°C. Hyperthermia may indicate systemic infection or severe heat stress.',
    sensor: 'DHT22',
    value: '40.8°C',
    valueCls: 'value-critical',
    time: minsAgo(4),
    dismissed: false
  },
  {
    id: 'a002',
    type: 'active',
    severity: 'warning',
    icon: '❤️',
    title: 'Elevated Heart Rate Detected',
    desc: 'Heart rate reading of 97 BPM exceeds normal threshold (60–90 BPM). Combined with elevated temperature, this may indicate physiological stress or early-stage illness.',
    sensor: 'Potentiometer',
    value: '97 BPM',
    valueCls: 'value-warning',
    time: minsAgo(4),
    dismissed: false
  },
  {
    id: 'a003',
    type: 'active',
    severity: 'warning',
    icon: '🌬️',
    title: 'Elevated Gas Concentration',
    desc: 'MQ2 sensor detected ammonia/methane concentration at 312 PPM, approaching the hazardous threshold of 350 PPM. Improve barn ventilation immediately.',
    sensor: 'MQ2',
    value: '312 PPM',
    valueCls: 'value-warning',
    time: minsAgo(7),
    dismissed: false
  },

  // === HISTORY ===
  {
    id: 'h001',
    type: 'history',
    severity: 'critical',
    icon: '🚨',
    title: 'Critical Health Risk – Multiple Parameters',
    desc: 'Temperature 41.2°C, Heart Rate 108 BPM, Activity 12%. AI engine classified health risk as CRITICAL. Veterinary consultation was triggered.',
    sensor: 'All Sensors',
    value: 'Score: 28',
    valueCls: 'value-critical',
    time: hoursAgo(2),
    dismissed: true
  },
  {
    id: 'h002',
    type: 'history',
    severity: 'resolved',
    icon: '✅',
    title: 'Critical Alert Resolved',
    desc: 'Animal health parameters have returned to normal ranges following veterinary intervention and cooling measures. Health score restored to 78.',
    sensor: 'All Sensors',
    value: 'Score: 78',
    valueCls: 'value-ok',
    time: hoursAgo(1.5),
    dismissed: true
  },
  {
    id: 'h003',
    type: 'history',
    severity: 'warning',
    icon: '💨',
    title: 'Poor Air Quality Detected',
    desc: 'Gas sensor readings exceeded 280 PPM for over 15 minutes. Barn ventilation system was activated. Values returned to safe levels.',
    sensor: 'MQ2',
    value: '280 PPM',
    valueCls: 'value-warning',
    time: hoursAgo(3.2),
    dismissed: true
  },
  {
    id: 'h004',
    type: 'history',
    severity: 'info',
    icon: '🏃',
    title: 'Low Activity Level Observed',
    desc: 'Activity sensor detected a 35% reduction in movement over 20-minute window. Animal may have been resting or showing early signs of lethargy.',
    sensor: 'MPU6050',
    value: '22%',
    valueCls: 'value-warning',
    time: hoursAgo(4),
    dismissed: true
  },
  {
    id: 'h005',
    type: 'history',
    severity: 'info',
    icon: '📊',
    title: 'Routine Health Check Completed',
    desc: 'AI system completed its hourly health assessment. All parameters within normal range. Health score: 85. No action required.',
    sensor: 'All Sensors',
    value: 'Score: 85',
    valueCls: 'value-ok',
    time: hoursAgo(5),
    dismissed: true
  },
  {
    id: 'h006',
    type: 'history',
    severity: 'warning',
    icon: '🌡️',
    title: 'Temperature Spike – Brief Episode',
    desc: 'Temperature briefly reached 39.8°C before returning to baseline (38.3°C) within 8 minutes. Likely caused by physical activity or sun exposure.',
    sensor: 'DHT22',
    value: '39.8°C',
    valueCls: 'value-warning',
    time: hoursAgo(6.5),
    dismissed: true
  },
  {
    id: 'h007',
    type: 'history',
    severity: 'resolved',
    icon: '✅',
    title: 'Air Quality Restored to Safe Level',
    desc: 'After ventilation system activation, MQ2 readings dropped from 280 PPM to 148 PPM. Air quality classified as safe. Alert auto-resolved.',
    sensor: 'MQ2',
    value: '148 PPM',
    valueCls: 'value-ok',
    time: hoursAgo(3),
    dismissed: true
  },
  {
    id: 'h008',
    type: 'history',
    severity: 'info',
    icon: '🤖',
    title: 'AI Analysis Engine Started',
    desc: 'FarmGuard AI monitoring system initialized successfully. All sensors online. Data ingestion pipeline active. Real-time monitoring commenced.',
    sensor: 'System',
    value: 'Online',
    valueCls: 'value-ok',
    time: hoursAgo(8),
    dismissed: true
  }
];

// ============================================================
//  STATE
// ============================================================

let currentFilter = 'all';
let searchQuery   = '';
const dismissedIds = new Set();

// ============================================================
//  RENDER
// ============================================================

function createAlertHTML(alert) {
  const timeDisplay = alert.type === 'active'
    ? `${formatTime(alert.time)} · ${Math.round((now - alert.time) / 60000)} min ago`
    : formatDateTime(alert.time);

  const dismissBtn = alert.type === 'active'
    ? `<button class="alert-dismiss-btn" data-id="${alert.id}">Dismiss</button>`
    : '';

  const pulseDot = alert.type === 'active' && alert.severity === 'critical'
    ? `<span style="display:inline-block;width:8px;height:8px;background:#ef4444;border-radius:50%;animation:livePulse 1.5s ease-in-out infinite;margin-left:4px;"></span>`
    : '';

  return `
    <div class="alert-item alert-${alert.severity}" id="alert-${alert.id}" data-severity="${alert.severity}" data-type="${alert.type}">
      <div class="alert-icon-wrap alert-icon-${alert.severity}">${alert.icon}</div>
      <div class="alert-body">
        <div class="alert-header-row">
          <div class="alert-title">${alert.title}${pulseDot}</div>
          <span class="alert-severity-badge badge-${alert.severity}">${alert.severity.toUpperCase()}</span>
        </div>
        <div class="alert-desc">${alert.desc}</div>
        <div class="alert-meta">
          <span class="alert-time">🕐 ${timeDisplay}</span>
          <span class="alert-sensor">${alert.sensor}</span>
          <span class="alert-value-badge ${alert.valueCls}">${alert.value}</span>
        </div>
      </div>
      <div class="alert-actions">
        ${dismissBtn}
      </div>
    </div>
  `;
}

function renderAlerts() {
  const activeList  = document.getElementById('activeAlertsList');
  const historyList = document.getElementById('historyAlertsList');
  if (!activeList || !historyList) return;

  const lowerSearch = searchQuery.toLowerCase();

  function matchesFilter(alert) {
    if (dismissedIds.has(alert.id)) return false;
    if (currentFilter !== 'all') {
      if (currentFilter === 'resolved') {
        if (alert.severity !== 'resolved') return false;
      } else {
        if (alert.severity !== currentFilter) return false;
      }
    }
    if (lowerSearch) {
      const hay = (alert.title + alert.desc + alert.sensor).toLowerCase();
      if (!hay.includes(lowerSearch)) return false;
    }
    return true;
  }

  // Active
  const activeAlerts = alertsData.filter(a => a.type === 'active' && matchesFilter(a));
  if (activeAlerts.length === 0) {
    activeList.innerHTML = `
      <div class="alerts-empty">
        <div class="alerts-empty-icon">✅</div>
        <div class="alerts-empty-text">No active alerts matching your filter</div>
      </div>`;
  } else {
    activeList.innerHTML = activeAlerts.map(createAlertHTML).join('');
  }

  // History
  const historyAlerts = alertsData.filter(a => a.type === 'history' && matchesFilter(a));
  if (historyAlerts.length === 0) {
    historyList.innerHTML = `
      <div class="alerts-empty">
        <div class="alerts-empty-icon">📋</div>
        <div class="alerts-empty-text">No history alerts matching your filter</div>
      </div>`;
  } else {
    historyList.innerHTML = historyAlerts.map(createAlertHTML).join('');
  }

  // Bind dismiss buttons
  document.querySelectorAll('.alert-dismiss-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const alertEl = document.getElementById('alert-' + id);
      if (alertEl) {
        alertEl.style.transition = 'all 0.3s ease';
        alertEl.style.opacity = '0';
        alertEl.style.transform = 'translateX(30px)';
        setTimeout(() => {
          dismissedIds.add(id);
          renderAlerts();
          updateStats();
        }, 300);
      }
    });
  });

  // Update active count
  const countEl = document.getElementById('activeAlertCount');
  if (countEl) countEl.textContent = `${activeAlerts.length} active`;
}

function updateStats() {
  const active = alertsData.filter(a => a.type === 'active' && !dismissedIds.has(a.id));
  const critical = active.filter(a => a.severity === 'critical').length;
  const warning  = active.filter(a => a.severity === 'warning').length;
  const info     = alertsData.filter(a => a.severity === 'info').length;
  const resolved = alertsData.filter(a => a.severity === 'resolved').length;

  const setCt = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n; };
  setCt('statCriticalNum', critical);
  setCt('statWarningNum',  warning);
  setCt('statInfoNum',     info);
  setCt('statResolvedNum', resolved);

  // Sidebar badge
  const total = critical + warning;
  ['sidebarAlertBadge', 'topbarAlertCount'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (total > 0) {
        el.style.display = 'flex';
        el.textContent = total;
      } else {
        el.style.display = 'none';
      }
    }
  });
}

// ============================================================
//  NEW ALERTS SIMULATION
// ============================================================

function generateNewAlert() {
  const templates = [
    {
      severity: 'info',
      icon: '📊',
      title: 'Routine Health Check Completed',
      desc: 'Scheduled AI health assessment completed. All monitored parameters are within acceptable ranges. System operating normally.',
      sensor: 'All Sensors',
      value: `Score: ${Math.round(75 + Math.random() * 15)}`,
      valueCls: 'value-ok'
    },
    {
      severity: 'warning',
      icon: '🌡️',
      title: 'Temperature Rising',
      desc: `Temperature sensor reading ${(39.6 + Math.random() * 0.8).toFixed(1)}°C. Slightly above normal range. Monitoring closely for continued elevation.`,
      sensor: 'DHT22',
      value: `${(39.6 + Math.random() * 0.8).toFixed(1)}°C`,
      valueCls: 'value-warning'
    },
    {
      severity: 'info',
      icon: '🏃',
      title: 'Activity Pattern Update',
      desc: `Motion sensor recorded ${Math.round(50 + Math.random() * 30)}% activity level. Within expected behavioral range for time of day.`,
      sensor: 'MPU6050',
      value: `${Math.round(50 + Math.random() * 30)}%`,
      valueCls: 'value-ok'
    }
  ];

  const template = templates[Math.floor(Math.random() * templates.length)];
  const newAlert = {
    ...template,
    id: 'live_' + Date.now(),
    type: 'active',
    time: Date.now(),
    dismissed: false
  };

  alertsData.unshift(newAlert);
  renderAlerts();
  updateStats();

  // Visual notification flash
  const topbar = document.querySelector('.topbar');
  if (topbar) {
    topbar.style.transition = 'background 0.3s';
    topbar.style.background = '#f0fdf4';
    setTimeout(() => { topbar.style.background = ''; }, 600);
  }
}

// ============================================================
//  FILTER LOGIC
// ============================================================

function setupFilters() {
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentFilter = pill.dataset.filter;
      renderAlerts();
    });
  });

  // Filter stat cards
  ['statCritical', 'statWarning', 'statInfo', 'statResolved'].forEach((id, i) => {
    const card = document.getElementById(id);
    const filters = ['critical', 'warning', 'info', 'resolved'];
    if (!card) return;
    card.addEventListener('click', () => {
      currentFilter = filters[i];
      document.querySelectorAll('.filter-pill').forEach(p => {
        p.classList.toggle('active', p.dataset.filter === currentFilter);
      });
      renderAlerts();
      document.querySelector('.dash-section:nth-child(3)').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  const searchInput = document.getElementById('alertSearch');
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      searchQuery = e.target.value;
      renderAlerts();
    });
  }

  const clearBtn = document.getElementById('clearAllBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      alertsData.filter(a => a.type === 'active').forEach(a => dismissedIds.add(a.id));
      renderAlerts();
      updateStats();
    });
  }
}

// ============================================================
//  SIDEBAR TOGGLE
// ============================================================

function setupSidebar() {
  const toggle  = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  if (!toggle || !sidebar) return;

  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  document.body.appendChild(overlay);

  function open()  { sidebar.classList.add('open');  overlay.classList.add('visible');  document.body.style.overflow = 'hidden'; }
  function close() { sidebar.classList.remove('open'); overlay.classList.remove('visible'); document.body.style.overflow = ''; }

  if (toggle && sidebar && overlay) {
    toggle.addEventListener('click', () => {
      if (window.innerWidth <= 992) {
        sidebar.classList.add('open');
        overlay.classList.add('visible');
      } else {
        document.body.classList.toggle('sidebar-collapsed');
      }
    });
    overlay.addEventListener('click', close);

    // Keyboard shortcuts for desktop
    document.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.key === 'ArrowLeft' && window.innerWidth > 992) {
        document.body.classList.add('sidebar-collapsed');
      } else if (e.key === 'ArrowRight' && window.innerWidth > 992) {
        document.body.classList.remove('sidebar-collapsed');
      }
    });
  }
}

// ============================================================
//  CLOCK
// ============================================================

function updateClock() {
  const now2 = new Date();
  const timeStr = now2.toLocaleTimeString('en-US', { hour12: false });
  const dateStr = now2.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const sidebarTime = document.getElementById('sidebarTime');
  const topbarDate  = document.getElementById('topbarDate');
  if (sidebarTime) sidebarTime.textContent = timeStr;
  if (topbarDate) topbarDate.textContent = dateStr + ' · ' + timeStr;
}

// ============================================================
//  INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  setupSidebar();
  setupFilters();
  updateClock();
  renderAlerts();
  updateStats();

  setInterval(updateClock, 1000);

  // Simulate new incoming alerts every 45–90 seconds
  function scheduleNextAlert() {
    const delay = Math.random() * 45000 + 45000;
    setTimeout(() => {
      generateNewAlert();
      scheduleNextAlert();
    }, delay);
  }
  scheduleNextAlert();

  console.log('🌿 FarmGuard AI Alerts Page loaded successfully.');
});
