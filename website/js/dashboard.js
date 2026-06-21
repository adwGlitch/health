/* =========================================================
   FarmGuard AI – Advanced Livestock Platform Logic
   ========================================================= */

'use strict';

// Blynk Auth Token Configuration
const BLYNK_TOKEN = "deZoSSU9pU5aZUGqqhC_ordg66xxcVyM";

// Gemini API Key Configuration
const GEMINI_API_KEY = "AIzaSyAU5rk9AfdHlFamr2lBQ4sIb4cLrsN7a6A";

// Helper to resolve the Gemini API key, prioritizing UI inputs (localStorage) over code defaults
function getGeminiApiKey() {
  const stored = localStorage.getItem('gemini_api_key');
  if (stored === 'YOUR_API_KEY') {
    localStorage.removeItem('gemini_api_key');
    return GEMINI_API_KEY;
  }
  if (stored && stored.trim() !== '') {
    return stored.trim();
  }
  return GEMINI_API_KEY;
}

// Helper to resolve the Blynk token, prioritizing UI inputs (localStorage) over code defaults
function getBlynkToken() {
  const stored = localStorage.getItem('blynk_auth_token');
  if (stored && stored !== 'YOUR_AUTH_TOKEN' && stored.trim() !== '') {
    return stored.trim();
  }
  return BLYNK_TOKEN;
}

// Global state trackers
let prevValues = { temp: null, hr: null, gas: null, movement: null };
let lastAlertStatus = null;
let isFetching = false;
let checkCount = 0;

// Chart history datasets
const chartHistory = {
  labels: [],
  temp: [],
  hr: [],
  gas: []
};

let tempChart = null;
let hrChart = null;
let gasChart = null;

// Current parsed data values (for chatbot & report generation)
const currentVitals = {
  temp: 38.5,
  hr: 75,
  gas: 150,
  movement: 2.5,
  health: 'HEALTHY',
  riskScore: 5,
  probHeat: 8,
  probResp: 12,
  probStress: 10,
  probHealthy: 90
};

// ============================================================
//  API POLLING ENGINE
// ============================================================

async function fetchBlynkPin(token, pin) {
  const url = `https://blynk.cloud/external/api/get?token=${token}&${pin}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP status ${res.status}`);
    const text = await res.text();
    return text.trim();
  } catch (err) {
    console.warn(`Blynk Fetch Failed for ${pin}:`, err);
    return null;
  }
}

async function fetchBlynkConnection(token) {
  const url = `https://blynk.cloud/external/api/isHardwareConnected?token=${token}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP status ${res.status}`);
    const text = await res.text();
    return text.trim() === 'true';
  } catch (err) {
    console.warn('Blynk Fetch Failed for connection status:', err);
    return false;
  }
}

async function pollBlynkData() {
  if (isFetching) return;
  
  // Pause fetching if Live Monitoring toggle is turned off
  const liveToggle = document.getElementById('liveMonitoringToggle');
  if (liveToggle && !liveToggle.checked) {
    const blynkStatusText = document.getElementById('blynkConnectionText');
    if (blynkStatusText) blynkStatusText.textContent = 'PAUSED';
    return;
  }
  
  const token = getBlynkToken();
  if (!token || token === 'YOUR_AUTH_TOKEN' || token.trim() === '') {
    updateTokenStateUI(false);
    return;
  }

  isFetching = true;
  updateConnectionStatusUI('configuring', 'POLLING...');

  try {
    const [tempRaw, hrRaw, gasRaw, moveRaw, statusRaw, isConnected] = await Promise.all([
      fetchBlynkPin(token, 'V0'),
      fetchBlynkPin(token, 'V1'),
      fetchBlynkPin(token, 'V2'),
      fetchBlynkPin(token, 'V3'),
      fetchBlynkPin(token, 'V4'),
      fetchBlynkConnection(token)
    ]);

    // Parse data safely
    const data = {
      temp: (tempRaw !== null && tempRaw !== '') ? parseFloat(tempRaw) : null,
      hr: (hrRaw !== null && hrRaw !== '') ? parseInt(hrRaw) : null,
      gas: (gasRaw !== null && gasRaw !== '') ? parseInt(gasRaw) : null,
      movement: (moveRaw !== null && moveRaw !== '') ? parseFloat(moveRaw) : null,
      health: (statusRaw !== null && statusRaw !== '') ? statusRaw.toUpperCase() : 'UNKNOWN',
      connected: isConnected
    };

    // If any sensor fetching was successful, treat connection as online
    const isOnline = data.connected || (data.temp !== null || data.hr !== null || data.gas !== null);
    
    updateConnectionStatusUI(isOnline ? 'online' : 'offline', isOnline ? 'ONLINE' : 'OFFLINE');
    
    if (isOnline) {
      updateDashboardData(data);
    }
  } catch (err) {
    console.error('Error polling Blynk data:', err);
    updateConnectionStatusUI('offline', 'CONN ERROR');
  } finally {
    isFetching = false;
  }
}

// ============================================================
//  UI UPDATING LOGIC
// ============================================================

function updateTokenStateUI(hasToken) {
  const emptyPanel = document.getElementById('blynkEmptyStatePanel');
  const workspace = document.getElementById('blynkDashboardWorkspace');
  
  if (hasToken) {
    if (emptyPanel) emptyPanel.style.display = 'none';
    if (workspace) workspace.style.display = 'block';
  } else {
    if (emptyPanel) emptyPanel.style.display = 'block';
    if (workspace) workspace.style.display = 'none';
    updateConnectionStatusUI('offline', 'TOKEN REQ');
  }
}

function updateConnectionStatusUI(state, text) {
  const statusPill = document.getElementById('blynkConnectionStatus');
  const statusText = document.getElementById('blynkConnectionText');

  if (!statusPill || !statusText) return;

  statusPill.className = 'topbar-live-indicator ' + state;
  statusText.textContent = text;
}

function updateDashboardData(data) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  // Update topbar time
  const topbarDate = document.getElementById('topbarDate');
  if (topbarDate) topbarDate.textContent = `${dateStr} · ${timeStr}`;

  // Sync to global vitals object
  if (data.temp !== null) currentVitals.temp = data.temp;
  if (data.hr !== null) currentVitals.hr = data.hr;
  if (data.gas !== null) currentVitals.gas = data.gas;
  if (data.movement !== null) currentVitals.movement = data.movement;

  // Calculate local health status based on thresholds
  let calculatedHealth = 'HEALTHY';
  if (currentVitals.temp > 40 || currentVitals.hr > 130 || currentVitals.gas > 3000) {
    calculatedHealth = 'CRITICAL';
  } else if ((currentVitals.temp >= 39 && currentVitals.temp <= 40) || 
             (currentVitals.hr >= 100 && currentVitals.hr <= 130) || 
             (currentVitals.gas >= 1500 && currentVitals.gas <= 3000)) {
    calculatedHealth = 'WARNING';
  }
  currentVitals.health = calculatedHealth;

  // 1. Temperature Card (V0)
  if (data.temp !== null && !isNaN(data.temp)) {
    const elVal = document.getElementById('tempValue');
    const elBar = document.getElementById('tempBar');
    const elBadge = document.getElementById('tempStatusBadge');
    const elUpdated = document.getElementById('tempUpdated');
    const elTrend = document.getElementById('tempTrend');

    if (elVal) elVal.textContent = data.temp.toFixed(1);
    if (elUpdated) elUpdated.textContent = `Updated at ${timeStr}`;

    // Bar width: scale 30°C - 45°C
    const pct = Math.min(100, Math.max(0, ((data.temp - 30) / 15) * 100));
    if (elBar) {
      elBar.style.width = `${pct}%`;
      // Colors
      if (data.temp >= 35 && data.temp <= 39.5) {
        elBar.className = 'metric-bar-fill metric-bar-green';
        if (elBadge) { elBadge.textContent = 'Normal'; elBadge.className = 'metric-status-badge'; }
      } else if (data.temp < 30 || data.temp > 41) {
        elBar.className = 'metric-bar-fill metric-bar-red';
        if (elBadge) { elBadge.textContent = 'Critical'; elBadge.className = 'metric-status-badge danger'; }
      } else {
        elBar.className = 'metric-bar-fill metric-bar-yellow';
        if (elBadge) { elBadge.textContent = 'Warning'; elBadge.className = 'metric-status-badge warning'; }
      }
    }

    // Trend logic
    if (prevValues.temp !== null && elTrend) {
      const diff = data.temp - prevValues.temp;
      if (diff > 0.05) { elTrend.textContent = `▲ +${diff.toFixed(1)}°C`; elTrend.className = 'trend-label trend-up'; }
      else if (diff < -0.05) { elTrend.textContent = `▼ ${diff.toFixed(1)}°C`; elTrend.className = 'trend-down'; }
      else { elTrend.textContent = '— Stable'; elTrend.className = 'trend-label trend-neutral'; }
    }
    prevValues.temp = data.temp;
  }

  // 2. Heart Rate Card (V1)
  if (data.hr !== null && !isNaN(data.hr)) {
    const elVal = document.getElementById('hrValue');
    const elBar = document.getElementById('hrBar');
    const elBadge = document.getElementById('hrStatusBadge');
    const elUpdated = document.getElementById('hrUpdated');
    const elTrend = document.getElementById('hrTrend');

    if (elVal) elVal.textContent = data.hr;
    if (elUpdated) elUpdated.textContent = `Updated at ${timeStr}`;

    // Bar width: scale 40 - 130
    const pct = Math.min(100, Math.max(0, ((data.hr - 40) / 90) * 100));
    if (elBar) {
      elBar.style.width = `${pct}%`;
      // Colors
      if (data.hr >= 60 && data.hr <= 90) {
        elBar.className = 'metric-bar-fill metric-bar-green';
        if (elBadge) { elBadge.textContent = 'Normal'; elBadge.className = 'metric-status-badge'; }
      } else if (data.hr < 45 || data.hr > 110) {
        elBar.className = 'metric-bar-fill metric-bar-red';
        if (elBadge) { elBadge.textContent = 'Critical'; elBadge.className = 'metric-status-badge danger'; }
      } else {
        elBar.className = 'metric-bar-fill metric-bar-yellow';
        if (elBadge) { elBadge.textContent = 'Warning'; elBadge.className = 'metric-status-badge warning'; }
      }
    }

    // Trend logic
    if (prevValues.hr !== null && elTrend) {
      const diff = data.hr - prevValues.hr;
      if (diff > 1) { elTrend.textContent = `▲ +${diff} BPM`; elTrend.className = 'trend-label trend-up'; }
      else if (diff < -1) { elTrend.textContent = `▼ ${diff} BPM`; elTrend.className = 'trend-down'; }
      else { elTrend.textContent = '— Stable'; elTrend.className = 'trend-label trend-neutral'; }
    }
    prevValues.hr = data.hr;
  }

  // 3. Gas Level Card (V2)
  if (data.gas !== null && !isNaN(data.gas)) {
    const elVal = document.getElementById('gasValue');
    const elBar = document.getElementById('gasBar');
    const elBadge = document.getElementById('gasStatusBadge');
    const elUpdated = document.getElementById('gasUpdated');
    const elTrend = document.getElementById('gasTrend');

    if (elVal) elVal.textContent = data.gas;
    if (elUpdated) elUpdated.textContent = `Updated at ${timeStr}`;

    // Bar width: scale 0 - 4000
    const pct = Math.min(100, Math.max(0, (data.gas / 4000) * 100));
    if (elBar) {
      elBar.style.width = `${pct}%`;
      // Colors
      if (data.gas <= 1500) {
        elBar.className = 'metric-bar-fill metric-bar-green';
        if (elBadge) { elBadge.textContent = 'Safe'; elBadge.className = 'metric-status-badge'; }
      } else if (data.gas > 3000) {
        elBar.className = 'metric-bar-fill metric-bar-red';
        if (elBadge) { elBadge.textContent = 'Danger!'; elBadge.className = 'metric-status-badge danger'; }
      } else {
        elBar.className = 'metric-bar-fill metric-bar-yellow';
        if (elBadge) { elBadge.textContent = 'Moderate'; elBadge.className = 'metric-status-badge warning'; }
      }
    }

    // Trend logic
    if (prevValues.gas !== null && elTrend) {
      const diff = data.gas - prevValues.gas;
      if (diff > 5) { elTrend.textContent = `▲ +${diff} ppm`; elTrend.className = 'trend-label trend-up'; }
      else if (diff < -5) { elTrend.textContent = `▼ ${Math.abs(diff)} ppm`; elTrend.className = 'trend-down'; }
      else { elTrend.textContent = '— Stable'; elTrend.className = 'trend-label trend-neutral'; }
    }
    prevValues.gas = data.gas;
  }

  // 4. Movement Card (V3)
  if (data.movement !== null && !isNaN(data.movement)) {
    const elVal = document.getElementById('movementValue');
    const elBar = document.getElementById('movementBar');
    const elBadge = document.getElementById('movementStatusBadge');
    const elUpdated = document.getElementById('movementUpdated');
    const elTrend = document.getElementById('movementTrend');

    if (elVal) elVal.textContent = data.movement.toFixed(1);
    if (elUpdated) elUpdated.textContent = `Updated at ${timeStr}`;

    // Bar width: scale 0 - 20 m/s^2
    const pct = Math.min(100, Math.max(0, (data.movement / 20) * 100));
    if (elBar) {
      elBar.style.width = `${pct}%`;
      // Colors
      if (data.movement >= 2.0) {
        elBar.className = 'metric-bar-fill metric-bar-green';
        if (elBadge) { elBadge.textContent = 'Active'; elBadge.className = 'metric-status-badge'; }
      } else if (data.movement < 0.5) {
        elBar.className = 'metric-bar-fill metric-bar-red';
        if (elBadge) { elBadge.textContent = 'Inactive'; elBadge.className = 'metric-status-badge danger'; }
      } else {
        elBar.className = 'metric-bar-fill metric-bar-yellow';
        if (elBadge) { elBadge.textContent = 'Lethargic'; elBadge.className = 'metric-status-badge warning'; }
      }
    }

    // Trend logic
    if (prevValues.movement !== null && elTrend) {
      const diff = data.movement - prevValues.movement;
      if (diff > 0.1) { elTrend.textContent = `▲ +${diff.toFixed(1)} m/s²`; elTrend.className = 'trend-label trend-up'; }
      else if (diff < -0.1) { elTrend.textContent = `▼ ${diff.toFixed(1)} m/s²`; elTrend.className = 'trend-down'; }
      else { elTrend.textContent = '— Stable'; elTrend.className = 'trend-label trend-neutral'; }
    }
    prevValues.movement = data.movement;
  }

  // Calculate Health Risk Score & Disease Probability Estimates
  computeAIEstimates(currentVitals);

  // 5. Health Status Card, Avatar and Score Gauge (V4)
  const healthCard = document.getElementById('healthStatusCard');
  const healthVal = document.getElementById('healthStatusValue');
  const healthUpdated = document.getElementById('healthUpdated');
  const healthDesc = document.getElementById('healthStatusDesc');
  const cow = document.getElementById('cowAvatar');

  if (healthVal) {
    const status = currentVitals.health;
    healthVal.textContent = status;
    if (healthUpdated) healthUpdated.textContent = `Updated at ${timeStr}`;

    // Reset layout classes
    if (healthCard) healthCard.classList.remove('metric-card-pulse', 'warning-card', 'danger-card');
    if (cow) cow.setAttribute('class', '');

    // Eye SVGs
    const eyesHealthy = document.getElementById('cowEyesHealthy');
    const eyesWarning = document.getElementById('cowEyesWarning');
    const eyesCritical = document.getElementById('cowEyesCritical');
    const sweat = document.getElementById('cowSweat');
    const aura = document.getElementById('avatarAura');

    if (eyesHealthy) eyesHealthy.style.display = 'none';
    if (eyesWarning) eyesWarning.style.display = 'none';
    if (eyesCritical) eyesCritical.style.display = 'none';
    if (sweat) sweat.style.display = 'none';

    if (status === 'HEALTHY') {
      healthVal.className = 'status-value healthy';
      if (healthDesc) healthDesc.textContent = 'All vital parameters are within normal physiological ranges. No immediate health concerns.';
      if (cow) cow.setAttribute('class', 'cow-chewing');
      if (eyesHealthy) eyesHealthy.style.display = 'block';
      if (aura) { aura.setAttribute('fill', 'rgba(34, 197, 94, 0.08)'); aura.setAttribute('stroke', 'rgba(34, 197, 94, 0.2)'); }
      
      // Voice synthesis trigger
      speakAlertStatus('HEALTHY');
    } else if (status === 'WARNING') {
      healthVal.className = 'status-value warning';
      if (healthDesc) healthDesc.textContent = 'Elevated sensor trends. Monitor livestock activity and parameters closely.';
      if (healthCard) healthCard.classList.add('warning-card');
      if (cow) cow.setAttribute('class', 'cow-shaking');
      if (eyesWarning) eyesWarning.style.display = 'block';
      if (sweat) sweat.style.display = 'block';
      if (aura) { aura.setAttribute('fill', 'rgba(249, 115, 22, 0.08)'); aura.setAttribute('stroke', 'rgba(249, 115, 22, 0.2)'); }

      speakAlertStatus('WARNING');
    } else if (status === 'CRITICAL') {
      healthVal.className = 'status-value critical';
      if (healthDesc) healthDesc.textContent = '🚨 Severe health event detected! Contact veterinary support immediately.';
      if (healthCard) healthCard.classList.add('danger-card', 'metric-card-pulse');
      if (cow) cow.setAttribute('class', 'cow-collapsed');
      if (eyesCritical) eyesCritical.style.display = 'block';
      if (aura) { aura.setAttribute('fill', 'rgba(239, 68, 68, 0.08)'); aura.setAttribute('stroke', 'rgba(239, 68, 68, 0.2)'); }

      speakAlertStatus('CRITICAL');
    } else {
      healthVal.className = 'status-value';
      if (healthDesc) healthDesc.textContent = `Hardware returned status code: ${status}`;
      if (eyesHealthy) eyesHealthy.style.display = 'block';
    }

    // Update risk score radial gauge in UI
    const ring = document.getElementById('riskScoreRing');
    const scoreNum = document.getElementById('riskScoreNum');
    if (ring && scoreNum) {
      scoreNum.textContent = currentVitals.riskScore;
      const circumference = 263.8; // 2 * PI * r (r=42)
      const offset = circumference * (1 - currentVitals.riskScore / 100);
      ring.style.strokeDashoffset = offset;
      
      let ringColor = '#22c55e';
      if (currentVitals.riskScore >= 70) ringColor = '#ef4444';
      else if (currentVitals.riskScore >= 35) ringColor = '#f97316';
      ring.setAttribute('stroke', ringColor);
    }

    // Trigger AI message typewriter effect on change/initial
    const msgs = aiMessages[status] || aiMessages.HEALTHY;
    checkCount++;
    if (checkCount === 1 || (checkCount % 10 === 0)) {
      updateAIPanel(msgs, checkCount === 1);
    }
  }

  // 6. Update Predictive Forecast Card
  updatePredictiveAnalytics(currentVitals);

  // 7. Update Real-Time Charts (V0, V1, V2)
  updateCharts(timeStr, currentVitals.temp, currentVitals.hr, currentVitals.gas);
}

// ============================================================
//  AI ESTIMATES & DISEASE MATHEMATICS
// ============================================================

function computeAIEstimates(vitals) {
  let risk = 5; // Base risk score
  
  // 1. Temp deviations (norm 38.0 - 39.5)
  if (vitals.temp > 39.5) risk += Math.min(30, (vitals.temp - 39.5) * 15);
  else if (vitals.temp < 35) risk += Math.min(30, (35 - vitals.temp) * 10);
  
  // 2. HR deviations (norm 60-90)
  if (vitals.hr > 90) risk += Math.min(30, (vitals.hr - 90) * 0.75);
  else if (vitals.hr < 60) risk += Math.min(20, (60 - vitals.hr) * 0.8);

  // 3. Gas buildup (norm <= 1500)
  if (vitals.gas > 1500) risk += Math.min(25, (vitals.gas - 1500) * 0.01);

  // 4. Movement lethargy (norm >= 2.0)
  if (vitals.movement < 2.0) risk += Math.min(15, (2.0 - vitals.movement) * 8);

  vitals.riskScore = Math.min(99, Math.max(5, Math.round(risk)));

  // Probability Math (Disease Prediction Profiles)
  // A. Heat Stress (driven heavily by temp + heart rate)
  let heat = 5;
  if (vitals.temp > 38.8) heat += (vitals.temp - 38.8) * 15;
  if (vitals.hr > 85) heat += (vitals.hr - 85) * 0.6;
  vitals.probHeat = Math.min(99, Math.max(5, Math.round(heat)));

  // B. Respiratory Infection (driven by gas + temp)
  let resp = 5;
  if (vitals.gas > 1500) resp += (vitals.gas - 1500) * 0.02;
  if (vitals.temp > 39.2) resp += (vitals.temp - 39.2) * 10;
  vitals.probResp = Math.min(99, Math.max(5, Math.round(resp)));

  // C. Anxiety/Stress (driven by heart rate spikes and/or hyper-active / hypo-active movement)
  let stress = 5;
  if (vitals.hr > 90) stress += (vitals.hr - 90) * 0.7;
  if (vitals.movement < 1.0) stress += 25; // lethargic stress
  else if (vitals.movement > 8.0) stress += 20; // hyper panic stress
  vitals.probStress = Math.min(99, Math.max(5, Math.round(stress)));

  // Adjust risk score to align with health status zones
  const status = vitals.health;
  if (status === 'CRITICAL') {
    vitals.riskScore = Math.min(99, Math.max(70, vitals.riskScore));
  } else if (status === 'WARNING') {
    vitals.riskScore = Math.min(69, Math.max(35, vitals.riskScore));
  } else {
    vitals.riskScore = Math.min(34, Math.max(5, vitals.riskScore));
  }

  // D. Healthy State: Inverse of risk score
  vitals.probHealthy = Math.max(1, 100 - vitals.riskScore);

  // Update UI disease bars
  updateDiseaseBar('probHeatBar', 'probHeatVal', vitals.probHeat, '#f97316');
  updateDiseaseBar('probRespBar', 'probRespVal', vitals.probResp, '#ef4444');
  updateDiseaseBar('probStressBar', 'probStressVal', vitals.probStress, '#fb923c');
  updateDiseaseBar('probHealthyBar', 'probHealthyVal', vitals.probHealthy, '#22c55e');
}

function updateDiseaseBar(barId, valId, score, color) {
  const bar = document.getElementById(barId);
  const val = document.getElementById(valId);
  if (bar) {
    bar.style.width = `${score}%`;
    bar.style.backgroundColor = color;
  }
  if (val) val.textContent = `${score}%`;
}

// ============================================================
//  PREDICTIVE ANALYTICS FORECAST
// ============================================================

function updatePredictiveAnalytics(vitals) {
  const elCurrent = document.getElementById('forecastCurrentState');
  const elPred = document.getElementById('forecastPredictedState');
  const elConf = document.getElementById('forecastConfidence');
  const elBar = document.getElementById('forecastConfidenceBar');

  if (!elCurrent || !elPred || !elConf || !elBar) return;

  elCurrent.textContent = vitals.health;

  let prediction = "HEALTHY";
  let confidence = 95;

  if (vitals.health === "CRITICAL") {
    // If critical, predicted to remain critical unless values improve
    prediction = "CRITICAL";
    confidence = 91;
  } else if (vitals.health === "WARNING") {
    // If warning, check parameters direction. Let's forecast CRITICAL if risk is high
    if (vitals.riskScore > 50) {
      prediction = "CRITICAL";
      confidence = 84;
    } else {
      prediction = "HEALTHY";
      confidence = 76;
    }
  } else {
    // Healthy, forecast stable healthy
    prediction = "HEALTHY";
    confidence = 94;
  }

  elPred.textContent = prediction;
  elConf.textContent = `${confidence}%`;
  elBar.style.width = `${confidence}%`;

  // Color text matches severity
  const setSeverityColor = (el, state) => {
    el.className = 'status-value';
    if (state === 'HEALTHY') el.style.color = 'var(--color-healthy)';
    else if (state === 'WARNING') el.style.color = 'var(--color-warning)';
    else if (state === 'CRITICAL') el.style.color = 'var(--color-critical)';
  };

  setSeverityColor(elCurrent, vitals.health);
  setSeverityColor(elPred, prediction);

  // Confidence color matching
  if (confidence > 90) elConf.style.color = 'var(--color-healthy)';
  else if (confidence > 75) elConf.style.color = 'var(--color-warning)';
  else elConf.style.color = 'var(--color-critical)';
}

// ============================================================
//  TEXT-TO-SPEECH AUDIO WARNINGS
// ============================================================

function speakAlertStatus(status) {
  // Only speak if we are actually on the Dashboard page (checking for a unique dashboard element)
  if (!document.getElementById('aiHealthIntelligence')) return;

  // Do not speak if the user is actively viewing the Sensors or Charts sections
  const currentHash = window.location.hash;
  if (currentHash === '#sensorCards' || currentHash === '#chartsSection') return;

  if (status === lastAlertStatus) return;
  lastAlertStatus = status;

  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel(); // Abort previous speech alerts

    let speakText = "";
    if (status === 'HEALTHY') {
      speakText = "Animal health is normal.";
    } else if (status === 'WARNING') {
      speakText = "Warning. Abnormal conditions detected.";
    } else if (status === 'CRITICAL') {
      speakText = "Critical condition detected. Immediate attention required.";
    }

    if (speakText !== "") {
      const utterance = new SpeechSynthesisUtterance(speakText);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  }
}

// ============================================================
//  AI TYPEWRITER & INSIGHTS FEED
// ============================================================

const aiMessages = {
  HEALTHY: {
    status: 'All vital parameters are within normal physiological ranges. The animal displays healthy temperature, stable heart rate, normal motion, and optimal air quality. No immediate health concerns detected.',
    risk: 'Risk level is LOW. Device status is online and continuous monitoring is maintaining vigilance. Trajectory is stable.',
    causes: 'No anomalies detected. Environmental conditions and livestock vital signs are ideal.',
    actions: 'Continue routine monitoring. Maintain normal feeding and hydration schedules. Ensure adequate ventilation.'
  },
  WARNING: {
    status: 'Elevated sensor trends detected. Temperature and heart rate parameters are trending slightly higher than baseline, combined with decreased movement patterns.',
    risk: 'Risk level is MODERATE. Parameters are approaching critical boundaries. Action within 4–6 hours is recommended to avoid critical status escalation.',
    causes: 'Possible heat stress, early-stage infection, minor physical exhaustion, or poor environmental air circulation.',
    actions: '⚠️ 1) Provide shade/cooling. 2) Increase ventilation. 3) Separate and check hydration. 4) Monitor sensor updates closely.'
  },
  CRITICAL: {
    status: '🚨 CRITICAL ANOMALY: Vital signs are highly abnormal. High body temperature, rapid heart rate, and extremely low activity indicate a severe health emergency.',
    risk: 'Risk level is CRITICAL. Delayed treatment could lead to severe systemic infection or death. Immediate response required.',
    causes: 'Likely severe infection, systemic illness, toxic environment (gas buildup), acute respiratory distress, or severe metabolic trauma.',
    actions: '🔴 IMMEDIATE ACTIONS: 1) Call veterinary support NOW. 2) Isolate the animal. 3) Move to a cool, well-ventilated stall. 4) Offer clean drinking water. 5) Prepare sensor history logs for vet review.'
  }
};

let aiUpdateInProgress = false;
let currentUpdateId = 0;

function typewriterUpdate(el, text, delay = 0, myId) {
  if (el._typewriterTimeout) {
    clearTimeout(el._typewriterTimeout);
    el._typewriterTimeout = null;
  }
  if (el._typewriterInterval) {
    clearInterval(el._typewriterInterval);
    el._typewriterInterval = null;
  }

  return new Promise(resolve => {
    if (myId !== currentUpdateId) {
      resolve();
      return;
    }

    el._typewriterTimeout = setTimeout(() => {
      if (myId !== currentUpdateId) {
        el._typewriterTimeout = null;
        resolve();
        return;
      }

      el.textContent = '';
      let i = 0;
      const speed = Math.max(10, 20 - Math.floor(text.length / 50));
      
      el._typewriterInterval = setInterval(() => {
        if (myId !== currentUpdateId) {
          clearInterval(el._typewriterInterval);
          el._typewriterInterval = null;
          el._typewriterTimeout = null;
          resolve();
          return;
        }

        el.textContent += text[i];
        i++;
        if (i >= text.length) {
          clearInterval(el._typewriterInterval);
          el._typewriterInterval = null;
          el._typewriterTimeout = null;
          resolve();
        }
      }, speed);
    }, delay);
  });
}

async function updateAIPanel(msgs, force = false) {
  if (aiUpdateInProgress && !force) return;
  aiUpdateInProgress = true;

  const myId = ++currentUpdateId;

  const thinking = document.getElementById('aiThinking');
  if (thinking) thinking.style.opacity = '1';

  const runStep = async (el, text, delay) => {
    if (myId !== currentUpdateId) return false;
    await typewriterUpdate(el, text, delay, myId);
    return myId === currentUpdateId;
  };

  if (await runStep(document.getElementById('aiHealthStatus'), msgs.status, 100)) {
    if (await runStep(document.getElementById('aiRiskAssessment'), msgs.risk, 0)) {
      if (await runStep(document.getElementById('aiCauses'), msgs.causes, 0)) {
        await runStep(document.getElementById('aiActions'), msgs.actions, 0);
      }
    }
  }

  if (myId === currentUpdateId) {
    if (thinking) thinking.style.opacity = '0';
    aiUpdateInProgress = false;
  }
}

// ============================================================
//  CHATBOT CONVERSATIONAL ASSISTANT
// ============================================================

function appendChatMessage(sender, message, isUser = false) {
  const feed = document.getElementById('chatFeed');
  if (!feed) return;

  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${isUser ? 'user-msg' : 'bot-msg'}`;
  bubble.innerHTML = `<strong>${sender}:</strong> ${message}`;
  
  feed.appendChild(bubble);
  feed.scrollTop = feed.scrollHeight;
}

async function handleUserChatMessage(msgText) {
  if (!msgText || msgText.trim() === '') return;
  
  appendChatMessage('You', msgText, true);
  document.getElementById('chatTextInput').value = '';

  const thinking = document.getElementById('aiThinking');
  if (thinking) thinking.style.opacity = '1';

  // Wait 1.2s to simulate thinking
  setTimeout(() => {
    if (thinking) thinking.style.opacity = '0';
    
    let botResponse = "";
    const cleanMsg = msgText.toLowerCase();

    // Define extensive rule-based veterinary responses
    const rules = [
      {
        keys: ['hello', 'hi', 'hey', 'who are you', 'introduce', 'greetings'],
        reply: () => {
          const cowName = localStorage.getItem('cow_name') || 'your livestock';
          return `Hello! I am your <strong>FarmGuard AI Veterinary Assistant</strong> monitoring ${cowName}. I continuously analyze sensor telemetry (V0-V3) and V4 health states to help you diagnose conditions, manage emergencies, and optimize barn conditions. Try asking me: <em>"Analyze current vitals"</em>, <em>"What is the risk of heat stress?"</em>, or <em>"Explain baseline heart rate"</em>.`;
        }
      },
      {
        keys: ['vitals', 'status', 'how is', 'current readings', 'diagnose', 'check-up', 'analyze'],
        reply: () => {
          const cowName = localStorage.getItem('cow_name') || 'The animal';
          return `Vitals analysis details: ${cowName}'s status is currently <strong>${currentVitals.health}</strong>. Current values show: Temperature is ${currentVitals.temp.toFixed(1)}°C, Heart Rate is ${currentVitals.hr} BPM, Ambient Gas level is ${currentVitals.gas} ppm, and Movement activity is ${currentVitals.movement.toFixed(1)} m/s². The combined Health Risk score is evaluated at ${currentVitals.riskScore}%.`;
        }
      },
      {
        keys: ['why', 'reason', 'explain alert'],
        reply: () => {
          if (currentVitals.health === 'HEALTHY') {
            return `The animal is not critical; vital signs are currently normal. Risk estimates show Heat Stress is at ${currentVitals.probHeat}%, Respiratory risks are at ${currentVitals.probResp}%, and general stress is at ${currentVitals.probStress}%.`;
          } else {
            let reasons = [];
            if (currentVitals.temp > 39.5) reasons.push(`body temperature is highly elevated at ${currentVitals.temp.toFixed(1)}°C`);
            if (currentVitals.hr > 90) reasons.push(`heart rate is rapid at ${currentVitals.hr} BPM`);
            if (currentVitals.gas > 200) reasons.push(`toxic gas levels are high at ${currentVitals.gas} ppm`);
            if (currentVitals.movement < 1.0) reasons.push(`activity is extremely low at ${currentVitals.movement.toFixed(1)} m/s² (lethargy)`);
            
            if (reasons.length === 0) {
              return `The alert state is <strong>${currentVitals.health}</strong> based on the telemetry status code V4. Barn checks are recommended.`;
            }
            return `The alert state is <strong>${currentVitals.health}</strong> because ${reasons.join(', and ')}. This indicates severe discomfort or exposure. Immediate barn check-up is recommended.`;
          }
        }
      },
      {
        keys: ['heat stress', 'hyperthermia', 'sunstroke', 'hot weather'],
        reply: () => `<strong>Heat Stress Analysis:</strong> Current probability is <strong>${currentVitals.probHeat}%</strong>. Heat Stress is evaluated using elevated Body Temperature (current: ${currentVitals.temp.toFixed(1)}°C) and Heart Rate (current: ${currentVitals.hr} BPM). <br/><em>Recommendations:</em> Activate cooling fans, provide misting/shading, and ensure direct access to cold electrolytes or water.`
      },
      {
        keys: ['respiratory', 'infection', 'pneumonia', 'cough', 'breathing', 'lungs'],
        reply: () => `<strong>Respiratory Risk Analysis:</strong> Current probability is <strong>${currentVitals.probResp}%</strong>. This estimate increases when the ambient gas level is high (current: ${currentVitals.gas} ppm) or the body temperature rises. <br/><em>Recommendations:</em> Verify exhaust fan activity, clean methane/ammonia sources from bedding, and call for veterinary auscultation.`
      },
      {
        keys: ['anxiety', 'stress', 'scared', 'nervous', 'behavior', 'panic'],
        reply: () => `<strong>Anxiety/Stress Analysis:</strong> Current probability is <strong>${currentVitals.probStress}%</strong>. This is triggered by sudden heart rate spikes (current: ${currentVitals.hr} BPM) and high movement or complete immobility. <br/><em>Recommendations:</em> Inspect the barn for external stressors (predators, aggressive herd members, handling stress) and verify feed status.`
      },
      {
        keys: ['mastitis', 'udder', 'milk quality', 'swollen udder', 'somatic cell', 'milk count', 'milking issue'],
        reply: () => `<strong>Mastitis Diagnosis & Care:</strong> Mastitis is an inflammatory disease of the udder tissue, usually caused by bacterial infection. <br/>- <em>Symptoms:</em> Swollen, hot, red, or painful udder quarters, and clotted or watery milk. Somatic Cell Count (SCC) will spike. <br/>- <em>Prevention:</em> Routine pre- and post-milking teat dipping, keeping bedding dry and clean, and regular California Mastitis Tests (CMT). <br/>- <em>Action:</em> If suspected, isolate the cow, perform a milk culture, and consult the vet for intramammary antibiotic infusions.`
      },
      {
        keys: ['footrot', 'foot rot', 'lameness', 'limping', 'hoof', 'hooves', 'leg injury', 'feet'],
        reply: () => `<strong>Footrot & Lameness Protocol:</strong> Footrot is a highly infectious bacterial infection causing tissue necrosis in the interdigital claw of the hoof. <br/>- <em>Symptoms:</em> Marked lameness, swelling between the hooves, and a distinct foul smell. Movement is currently ${currentVitals.movement.toFixed(1)} m/s². <br/>- <em>Action:</em> Separate the animal to dry ground to prevent pasture contamination. Clean the hoof thoroughly, apply antiseptic/copper sulfate footbaths, and administer vet-prescribed systemic antibiotics.`
      },
      {
        keys: ['ketosis', 'acetone', 'energy deficit', 'metabolic disease'],
        reply: () => `<strong>Ketosis (Metabolic Alert):</strong> Occurs in high-producing dairy cows in early lactation when energy requirements exceed dry matter intake, leading to fat breakdown and ketone buildup. <br/>- <em>Symptoms:</em> Sweet acetone breath odor, drop in milk yield, refusal to eat concentrates, and lethargy. <br/>- <em>Treatment:</em> Give 300ml of propylene glycol orally twice daily. For severe cases, a vet should administer IV dextrose (glucose) and glucocorticoids. Maintain high feed intake pre-calving.`
      },
      {
        keys: ['bloat', 'rumen', 'gas buildup', 'stomach swelling'],
        reply: () => `<strong>Bovine Bloat Emergency:</strong> Bloat is a rapid accumulation of gas in the rumen (left flank) which can compress the heart (current HR: ${currentVitals.hr} BPM) and lungs, causing quick suffocation. <br/>- <em>Symptoms:</em> Visible protrusion on the left flank, open-mouth breathing, and kicking at the belly. <br/>- <em>Immediate Action:</em> Administer oral anti-foaming agents (e.g., poloxalene, vegetable oil) via drenching. In critical distress, a vet must execute rumen puncture using a trocar or large needle. Avoid turning hungry cows onto wet, lush clover pastures.`
      },
      {
        keys: ['milk fever', 'hypocalcemia', 'calcium deficiency'],
        reply: () => `<strong>Milk Fever (Hypocalcemia):</strong> A metabolic disease occurring close to calving due to sudden calcium draw for colostrum production. <br/>- <em>Symptoms:</em> Muscle weakness, inability to stand (current activity: ${currentVitals.movement.toFixed(1)} m/s²), cold skin, and a classic 'S' neck curve. <br/>- <em>Treatment:</em> Immediate slow IV or SubQ injection of calcium gluconate. <br/>- <em>Prevention:</em> Feed a low-calcium, high-magnesium diet (or anionic salts) during the late dry period to prime the cow's calcium-mobilization mechanisms.`
      },
      {
        keys: ['bedding', 'clean barn', 'manure', 'hygiene', 'straw', 'sanitation', 'cleanliness'],
        reply: () => `<strong>Barn Hygiene & Bedding Guidelines:</strong> Damp, dirty bedding promotes bacterial multiplication, leading to Mastitis and Footrot. It also elevates gas emissions (current: ${currentVitals.gas} ppm). <br/>- <em>Shavings vs Straw vs Sand:</em> Dry washed sand is ideal as it does not support bacterial growth. Straw is comfortable but must be changed daily if soiled. <br/>- <em>Hygiene:</em> Scrape manure alleys twice daily, maintain ventilation, and keep humidity below 75% to discourage bacterial replication.`
      },
      {
        keys: ['ventilation', 'exhaust', 'airflow', 'ammonia', 'methane', 'gas limit', 'air quality'],
        reply: () => `<strong>Ventilation & Gas Baselines:</strong> Clean barn air should register safe MQ2 readings (safe: &lt;= 1500). Currently, combined sensor gases read ${currentVitals.gas}. <br/>- <em>Actions:</em> If ambient gas rises above 1500, turn on exhaust fans to maximum, scrape standing manure, and check for clogged drains. High gas concentrations irritate the respiratory tract, increasing susceptibility to bovine respiratory disease (BRD).`
      },
      {
        keys: ['optimal temperature', 'comfort zone', 'thermoneutral', 'humidity', 'comfort index', 'barn temperature'],
        reply: () => `<strong>Bovine Thermoneutral comfort:</strong> Dairy cows thrive in temperatures between -4°C and 20°C. Current barn temperature is ${currentVitals.temp.toFixed(1)}°C. Above 25°C, cows start suffering heat stress, causing reduced dry matter intake and milk depression. Keep fans running and use sprinklers/misters above feed rails in hot weather.`
      },
      {
        keys: ['feed', 'food', 'nutrition', 'diet', 'hay', 'silage', 'grass', 'rumination', 'chewing'],
        reply: () => `<strong>Nutrition & Rumination:</strong> Dairy cows require balanced roughage (silage, hay) and concentrates (grains). <br/>- <em>Rumination:</em> A healthy cow spends 450-500 minutes per day ruminating (chewing the cud). A sudden drop in rumination indicates rumen acidosis, ketosis, or high stress. If the cow is inactive (movement: ${currentVitals.movement.toFixed(1)} m/s²), check if she is chewing or laying down peacefully.`
      },
      {
        keys: ['water', 'hydration', 'drinking', 'water trough', 'electrolytes'],
        reply: () => `<strong>Livestock Hydration:</strong> Dairy cows require 100-150 liters of clean, fresh water daily. <br/>- <em>Hydration Protocol:</em> Keep drinking troughs clear of algae and manure. Flow rate should be &gt;15 L/min. During heat warnings (current temp: ${currentVitals.temp.toFixed(1)}°C), enrich drinking water with potassium and sodium bicarbonate electrolytes to replenish minerals lost to panting.`
      },
      {
        keys: ['heat cycle', 'estrus', 'breeding', 'reproduction', 'insemination', 'pregnancy', 'calving'],
        reply: () => `<strong>Estrus (Heat) & Reproduction:</strong> The cow's heat cycle repeats every 21 days and lasts 12-18 hours. <br/>- <em>Signs of Heat:</em> Standing to be mounted, vaginal mucous discharge, sniffing/licking others, and high restlessness (accelerometer movement V3 spiking above 5.0 m/s² without fever). <br/>- <em>Insemination:</em> Follow the AM-PM rule: cows in heat in the morning should be bred that evening, and vice versa.`
      },
      {
        keys: ['esp32', 'microcontroller', 'dht22', 'mpu6050', 'mq2', 'sensor connection', 'schematic', 'pinout', 'hardware'],
        reply: () => `<strong>IoT Hardware Architecture:</strong> <br/>- <strong>ESP32 Board</strong>: Polled every 3 seconds to gather telemetry and send it to Blynk Cloud via WiFi. <br/>- <strong>DHT22 Sensor</strong>: Collects ambient temperature (V0) and humidity. <br/>- <strong>MPU6050 Accelerometer</strong>: Placed on cow collar to measure motion activity (V3). <br/>- <strong>MQ2 Gas Sensor</strong>: Detects methane and organic gases (V2). <br/>- Pins: MPU6050 uses I2C (SDA=21, SCL=22). DHT22 on GPIO 4. MQ2 on Analog GPIO 34.`
      },
      {
        keys: ['blynk', 'blynk token', 'api', 'polling', 'datastreams', 'connection'],
        reply: () => `<strong>Blynk API Configuration:</strong> The platform reads sensor values using standard Blynk external HTTPS endpoints: <br/>- <em>V0</em>: Temperature (°C)<br/>- <em>V1</em>: Heart Rate (BPM)<br/>- <em>V2</em>: Gas Level (ppm)<br/>- <em>V3</em>: Movement (m/s²)<br/>- <em>V4</em>: Health Status string.<br/>It pulls connection state using the <code>isHardwareConnected</code> API. It polls every 3 seconds to update charts and triggers instantly.`
      },
      {
        keys: ['notify', 'sms', 'whatsapp', 'alert', 'emergency', 'doctor', 'vet', 'contact'],
        reply: () => `<strong>Emergency Dispatch Protocols:</strong> If vitals are abnormal (status: ${currentVitals.health}), use the **Emergency Operations Center** to alert contacts: <br/>1) <em>Notify Farmer</em> sends an SMS with temperature (${currentVitals.temp.toFixed(1)}°C) and heart rate (${currentVitals.hr} BPM). <br/>2) <em>Call Veterinarian</em> transmits diagnostics to Dr. Sarah. <br/>3) <em>WhatsApp Alert</em> broadcasts details to local vet teams. <br/>4) <em>Generate Report</em> compiles a clinical PDF.`
      },
      {
        keys: ['report', 'pdf', 'generate report', 'print', 'export'],
        reply: () => `<strong>Veterinary Report Generator:</strong> Click the **"Generate Report"** button in the dashboard's Emergency Center. A printable clinical document will load showing complete sensor logs, dynamic risk estimates, recommendations, and physical signature areas. Click **"Print Health Report"** inside the modal to save as a PDF or print.`
      },
      {
        keys: ['quarantine', 'isolate', 'separate'],
        reply: () => `<strong>Quarantine Protocols:</strong> If V4 status transitions to WARNING or CRITICAL: <br/>1) Move the cow immediately to a dry, draft-free isolation pen. <br/>2) Ensure separate feeding and watering troughs to prevent cross-contamination. <br/>3) Maintain quiet barn conditions to lower heart rate (current: ${currentVitals.hr} BPM). <br/>4) Monitor temp (${currentVitals.temp.toFixed(1)}°C) and print out the diagnostic PDF for the vet.`
      },
      {
        keys: ['recommend', 'action', 'what should i do', 'treatment', 'protocol'],
        reply: () => {
          if (currentVitals.health === 'CRITICAL') {
            return `<strong>Critical Protocol Recommended:</strong> <br/>1) Contact Dr. Sarah immediately. <br/>2) Quarantine the animal in a well-ventilated space. <br/>3) Set barn exhaust fans to max capacity to clear toxic gases (current: ${currentVitals.gas}). <br/>4) Provide cool water and oral electrolytes. <br/>5) Compile the sensor history PDF report.`;
          } else if (currentVitals.health === 'WARNING') {
            return `<strong>Warning Action Protocol:</strong> <br/>1) Ensure the cow is in a shaded, well-ventilated area. <br/>2) Verify fresh water supply is active. <br/>3) Check bedding for cleanliness. <br/>4) Monitor temperature (current: ${currentVitals.temp.toFixed(1)}°C) and heart rate (current: ${currentVitals.hr} BPM) every 15 minutes. Contact veterinary service if values trend upward.`;
          } else {
            return `<strong>Routine Maintenance:</strong> The animal is currently evaluated as <strong>HEALTHY</strong>. No medical interventions are required. Maintain clean bedding, standard feed rations, and keep the Blynk system online for continuous monitoring.`;
          }
        }
      },
      {
        keys: ['heart', 'bpm', 'pulse', 'heart rate'],
        reply: () => `<strong>Heart Rate baselines:</strong> Healthy bovine heart rate ranges from 60 to 90 BPM. The current reading is <strong>${currentVitals.hr} BPM</strong>. ${currentVitals.hr > 90 ? 'This elevated rate suggests stress, physical pain, high temperature, or infection.' : 'This is within healthy limits.'}`
      },
      {
        keys: ['temp', 'fever', 'hot', 'body heat', 'temperature'],
        reply: () => `<strong>Body Temperature baselines:</strong> Normal cattle body temperature is 38.0°C–39.5°C. The current reading is <strong>${currentVitals.temp.toFixed(1)}°C</strong>. ${currentVitals.temp > 39.5 ? 'This indicates a fever or severe heat stress.' : 'This is normal.'}`
      },
      {
        keys: ['gas', 'ppm', 'air', 'ammonia', 'methane'],
        reply: () => `<strong>Gas & Air Quality baselines:</strong> Ambient air MQ2 reading is safe up to 1500. The current sensor reading is <strong>${currentVitals.gas}</strong>. ${currentVitals.gas > 1500 ? 'High toxic gases detected! Exhaust ventilation should be increased immediately to avoid mucosal irritation.' : 'Air quality is normal.'}`
      },
      {
        keys: ['movement', 'motion', 'activity', 'run', 'm/s'],
        reply: () => `<strong>Movement & Activity baselines:</strong> Healthy cattle movement is generally above 2.0 m/s². The current accelerometer reading is <strong>${currentVitals.movement.toFixed(1)} m/s²</strong>. ${currentVitals.movement < 0.5 ? 'Warning: Extremely low movement indicates lethargy, exhaustion, lameness, or lying down.' : 'Movement levels are healthy.'}`
      },
      {
        keys: ['hackathon', 'pitch', 'tell me about', 'business model', 'saas'],
        reply: () => `🚀 **FarmGuard AI Hackathon Pitch:** <br/><em>'FarmGuard AI is an intelligent edge-to-cloud livestock healthcare SaaS. By deploying ESP32 microcontrollers, DHT22, MPU6050, and MQ2 sensors, we capture live animal telemetry and stream it via Blynk Cloud. Our local and cloud AI engines run disease risk scores, forecast conditions in 1 hour with confidence intervals, compile PDF health reports, issue audio warnings, and provide a conversational chatbot interface to assist farmers in preventative care, maximizing herd yields.'</em>`
      },
      {
        keys: ['help', 'command', 'question', 'capabilities', 'what else can you do', 'features', 'skills'],
        reply: () => `I am trained to answer questions across several livestock management areas. Ask me about: <br/>
        • <strong>Vitals Diagnostics</strong>: <em>"Analyze current vitals"</em>, <em>"Why is the status critical?"</em>, <em>"Explain baseline heart rate"</em><br/>
        • <strong>Calculated Risk</strong>: <em>"Explain heat stress risks"</em>, <em>"Tell me about respiratory infection"</em>, <em>"Explain anxiety probability"</em><br/>
        • <strong>Common Cow Illnesses</strong>: <em>"What is mastitis?"</em>, <em>"Footrot symptoms"</em>, <em>"What is ketosis?"</em>, <em>"Rumen bloat emergency"</em>, <em>"How to treat milk fever"</em><br/>
        • <strong>Barn Setup & Environment</strong>: <em>"Hygiene & bedding"</em>, <em>"Exhaust fan ventilation"</em>, <em>"Optimal barn temperature"</em><br/>
        • <strong>Nutrition & Care</strong>: <em>"Cow feed and chewing"</em>, <em>"Water requirements"</em>, <em>"Estrus cycle detection"</em><br/>
        • <strong>IoT Tech Stack</strong>: <em>"ESP32 hardware wiring"</em>, <em>"Blynk API endpoints"</em>, <em>"How to print report"</em>, <em>"Quarantine procedures"</em><br/>
        • Type <strong>"help"</strong> at any time to review these commands!`
      }
    ];

    // Find a matching rule
    let matched = false;
    for (const rule of rules) {
      if (rule.keys.some(key => cleanMsg.includes(key))) {
        botResponse = rule.reply();
        matched = true;
        break;
      }
    }

    if (!matched) {
      // General fallback if no keywords matched
      botResponse = `I received your question: "<em>${msgText}</em>". Based on active telemetry, the animal's status is <strong>${currentVitals.health}</strong>. <br/>Vitals: Temp ${currentVitals.temp.toFixed(1)}°C, Heart Rate ${currentVitals.hr} BPM, Gas ${currentVitals.gas} ppm, Movement ${currentVitals.movement.toFixed(1)} m/s². <br/>Type <strong>"help"</strong> to see the list of veterinary topics I can answer.`;
    }

    appendChatMessage('FarmGuard AI', botResponse);
  }, 1200);
}

function setupChatbotHandlers() {
  const sendBtn = document.getElementById('chatSendBtn');
  const textInput = document.getElementById('chatTextInput');

  if (sendBtn && textInput) {
    sendBtn.addEventListener('click', () => {
      handleUserChatMessage(textInput.value);
    });
    textInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleUserChatMessage(textInput.value);
    });
  }

  // Quick actions hooks
  const askAnalyze = document.getElementById('btnAskAnalyze');
  const askCauses = document.getElementById('btnAskCauses');
  const askActions = document.getElementById('btnAskActions');

  if (askAnalyze) askAnalyze.addEventListener('click', () => handleUserChatMessage('Analyze current vitals'));
  if (askCauses) askCauses.addEventListener('click', () => handleUserChatMessage('Why is the animal sick?'));
  if (askActions) askActions.addEventListener('click', () => handleUserChatMessage('What recommendations or actions should I take?'));
}

// ============================================================
//  EMERGENCY TOAST SYSTEM
// ============================================================

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = '✅';
  if (type === 'warning') icon = '⚠️';
  else if (type === 'error') icon = '🚨';
  else if (type === 'info') icon = 'ℹ️';

  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  // Slide out and remove toast after 4 seconds
  setTimeout(() => {
    toast.style.animation = 'slideInToast 0.3s reverse forwards';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function setupEmergencyHandlers() {
  const btnFarmer = document.getElementById('btnNotifyFarmer');
  const btnVet = document.getElementById('btnNotifyVet');
  const btnWhatsApp = document.getElementById('btnNotifyWhatsApp');
  const btnReport = document.getElementById('btnGenerateReport');

  if (btnFarmer) {
    btnFarmer.addEventListener('click', () => {
      showToast(`SMS Dispatch: Vitals alert sent to Farmer. Vitals: Temp ${currentVitals.temp.toFixed(1)}°C, HR ${currentVitals.hr} BPM.`, 'warning');
    });
  }

  if (btnVet) {
    btnVet.addEventListener('click', () => {
      showToast(`Emergency dispatch triggered to Veterinarian (Dr. Sarah). Diagnostics transmitted.`, 'error');
    });
  }

  if (btnWhatsApp) {
    btnWhatsApp.addEventListener('click', () => {
      showToast(`WhatsApp Broadcast: Diagnostic summary pushed to veterinary chat groups. Status: ${currentVitals.health}.`, 'info');
    });
  }

  if (btnReport) {
    btnReport.addEventListener('click', () => {
      openReportModal();
    });
  }
}

// ============================================================
//  PDF REPORT MODAL GENERATOR
// ============================================================

function openReportModal() {
  const modal = document.getElementById('reportModalOverlay');
  if (!modal) return;

  const token = getBlynkToken();
  const now = new Date();
  
  // Fill report meta fields
  document.getElementById('reportIdVal').textContent = 'FG-' + Math.random().toString(36).substr(2, 6).toUpperCase();
  document.getElementById('reportTokenVal').textContent = token.substr(0, 8) + '...';
  document.getElementById('reportTimeVal').textContent = now.toLocaleString();
  document.getElementById('reportHealthVal').textContent = currentVitals.health;

  // Fill vitals table readings
  document.getElementById('repTempVal').textContent = `${currentVitals.temp.toFixed(1)} °C`;
  document.getElementById('repHrVal').textContent = `${currentVitals.hr} BPM`;
  document.getElementById('repGasVal').textContent = `${currentVitals.gas} ppm`;
  document.getElementById('repMoveVal').textContent = `${currentVitals.movement.toFixed(1)} m/s²`;

  // Status mapping inside table
  const getStatusText = (val, sensor) => {
    if (sensor === 'temp') return (val >= 35 && val <= 39.5) ? 'NORMAL' : 'ABNORMAL';
    if (sensor === 'hr') return (val >= 60 && val <= 90) ? 'NORMAL' : 'ABNORMAL';
    if (sensor === 'gas') return (val <= 1500) ? 'SAFE' : (val > 3000 ? 'HAZARDOUS' : 'MODERATE');
    if (sensor === 'movement') return (val >= 2.0) ? 'ACTIVE' : 'LETHARGIC';
    return 'UNKNOWN';
  };

  document.getElementById('repTempStat').textContent = getStatusText(currentVitals.temp, 'temp');
  document.getElementById('repHrStat').textContent = getStatusText(currentVitals.hr, 'hr');
  document.getElementById('repGasStat').textContent = getStatusText(currentVitals.gas, 'gas');
  document.getElementById('repMoveStat').textContent = getStatusText(currentVitals.movement, 'movement');

  // Fill AI section
  document.getElementById('repRiskScore').textContent = currentVitals.riskScore;
  const msgs = aiMessages[currentVitals.health] || aiMessages.HEALTHY;
  document.getElementById('repAiStatus').textContent = msgs.status;

  // Probabilities
  document.getElementById('repProbHeat').textContent = `${currentVitals.probHeat}%`;
  document.getElementById('repProbResp').textContent = `${currentVitals.probResp}%`;
  document.getElementById('repProbStress').textContent = `${currentVitals.probStress}%`;

  // Recommendations checklist
  const actionsContainer = document.getElementById('repAiActions');
  if (actionsContainer) {
    actionsContainer.innerHTML = '';
    const actionLines = msgs.actions.split('\n');
    actionLines.forEach(line => {
      if (line.trim() !== '') {
        const item = document.createElement('div');
        item.style.marginBottom = '6px';
        item.textContent = line;
        actionsContainer.appendChild(item);
      }
    });
  }

  // Display modal
  modal.style.display = 'flex';
}

function setupReportModalHandlers() {
  const modal = document.getElementById('reportModalOverlay');
  const btnClose = document.getElementById('btnReportClose');
  const btnPrint = document.getElementById('btnReportPrint');

  if (btnClose && modal) {
    btnClose.addEventListener('click', () => {
      modal.style.display = 'none';
    });
  }

  if (btnPrint) {
    btnPrint.addEventListener('click', () => {
      window.print();
    });
  }
}

// ============================================================
//  CHART.JS IMPLEMENTATION
// ============================================================

function initRealtimeCharts() {
  const tempCtx = document.getElementById('tempChart');
  const hrCtx = document.getElementById('hrChart');
  const gasCtx = document.getElementById('gasChart');

  if (!tempCtx || !hrCtx || !gasCtx) return;

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(5, 5, 8, 0.95)',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        titleColor: '#94a3b8',
        bodyColor: '#f8fafc',
        padding: 8,
        cornerRadius: 6,
        bodyFont: { family: 'Outfit, sans-serif', weight: 'bold' }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#64748b', font: { size: 9, family: 'Outfit' } }
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.04)' },
        ticks: { color: '#64748b', font: { size: 9, family: 'Outfit' } }
      }
    }
  };

  tempChart = new Chart(tempCtx, {
    type: 'line',
    data: {
      labels: chartHistory.labels,
      datasets: [{
        data: chartHistory.temp,
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34, 197, 94, 0.05)',
        borderWidth: 2,
        fill: true,
        tension: 0, // Triangular wave (straight lines)
        pointRadius: 2,
        pointBackgroundColor: '#22c55e'
      }]
    },
    options: commonOptions
  });

  hrChart = new Chart(hrCtx, {
    type: 'line',
    data: {
      labels: chartHistory.labels,
      datasets: [{
        data: chartHistory.hr,
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.05)',
        borderWidth: 2,
        fill: true,
        tension: 0.5, // Sine wave (smooth curves)
        pointRadius: 2,
        pointBackgroundColor: '#ef4444'
      }]
    },
    options: commonOptions
  });

  gasChart = new Chart(gasCtx, {
    type: 'line',
    data: {
      labels: chartHistory.labels,
      datasets: [{
        data: chartHistory.gas,
        borderColor: '#f97316',
        backgroundColor: 'rgba(249, 115, 22, 0.05)',
        borderWidth: 2,
        fill: true,
        stepped: true, // Square wave
        tension: 0,
        pointRadius: 2,
        pointBackgroundColor: '#f97316'
      }]
    },
    options: commonOptions
  });
}

function updateCharts(timeStr, temp, hr, gas) {
  if (!tempChart || !hrChart || !gasChart) return;

  // Add labels & data
  chartHistory.labels.push(timeStr);
  chartHistory.temp.push(temp);
  chartHistory.hr.push(hr);
  chartHistory.gas.push(gas);

  // Keep last 15 readings
  if (chartHistory.labels.length > 15) {
    chartHistory.labels.shift();
    chartHistory.temp.shift();
    chartHistory.hr.shift();
    chartHistory.gas.shift();
  }

  tempChart.update();
  hrChart.update();
  gasChart.update();

  // Update current labels
  const tempCurr = document.getElementById('chartTempCurrent');
  const hrCurr = document.getElementById('chartHRCurrent');
  const gasCurr = document.getElementById('chartGasCurrent');

  if (tempCurr && temp !== null) tempCurr.textContent = `${temp.toFixed(1)} °C`;
  if (hrCurr && hr !== null) hrCurr.textContent = `${hr} BPM`;
  if (gasCurr && gas !== null) gasCurr.textContent = `${gas} ppm`;
}

// ============================================================
//  TOKEN & SIDEBAR INTERACTION
// ============================================================

function setupTokenHandlers() {
  const inputTop = document.getElementById('blynkTokenInput');
  const btnTop = document.getElementById('blynkTokenSaveBtn');
  
  const inputOverlay = document.getElementById('blynkOverlayTokenInput');
  const btnOverlay = document.getElementById('blynkOverlaySaveBtn');

  const inputGemini = document.getElementById('geminiKeyInput');
  const btnGemini = document.getElementById('geminiKeySaveBtn');

  const saveAction = (token) => {
    if (token && token.trim() !== '') {
      localStorage.setItem('blynk_auth_token', token.trim());
      location.reload();
    } else {
      alert('Please enter a valid Blynk Auth Token.');
    }
  };

  if (btnTop && inputTop) {
    btnTop.addEventListener('click', () => saveAction(inputTop.value));
    // Load existing
    const curr = getBlynkToken();
    if (curr && curr !== 'YOUR_AUTH_TOKEN') {
      inputTop.value = curr;
    }
  }

  if (btnOverlay && inputOverlay) {
    btnOverlay.addEventListener('click', () => saveAction(inputOverlay.value));
  }

  if (btnGemini && inputGemini) {
    btnGemini.addEventListener('click', () => {
      const key = inputGemini.value.trim();
      if (key !== '') {
        localStorage.setItem('gemini_api_key', key);
        showToast('Gemini API Key saved successfully.', 'success');
      } else {
        localStorage.removeItem('gemini_api_key');
        showToast('Gemini API Key cleared. Defaulting to code constant.', 'info');
      }
    });
    // Load existing key
    const currGemini = getGeminiApiKey();
    if (currGemini && currGemini !== 'YOUR_API_KEY') {
      inputGemini.value = currGemini;
    }
  }
}

function setupSidebarToggle() {
  const btnToggle = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');

  if (!btnToggle || !sidebar || !overlay) return;

  btnToggle.addEventListener('click', () => {
    if (window.innerWidth <= 992) {
      sidebar.classList.add('open');
      overlay.classList.add('visible');
    } else {
      document.body.classList.toggle('sidebar-collapsed');
    }
  });

  overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('visible');
  });

  // Keyboard shortcuts for desktop
  document.addEventListener('keydown', (e) => {
    // Ignore if typing in an input
    if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

    if (e.key === 'ArrowLeft' && window.innerWidth > 992) {
      document.body.classList.add('sidebar-collapsed');
    } else if (e.key === 'ArrowRight' && window.innerWidth > 992) {
      document.body.classList.remove('sidebar-collapsed');
    }
  });
}

function updateClock() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  const sidebarTime = document.getElementById('sidebarTime');
  const topbarDate = document.getElementById('topbarDate');

  if (sidebarTime) sidebarTime.textContent = timeStr;
  if (topbarDate) topbarDate.textContent = `${dateStr} · ${timeStr}`;
}

// ============================================================
//  GEMINI AI HEALTH INTELLIGENCE
// ============================================================

function getMockReport(temp, hr, gas, movement, health) {
  let status = "HEALTHY";
  let score = 100;
  let risk = "Low";
  let conditions = ["None Detected"];
  let observations = [];
  let recommendations = [];
  let actions = [];
  let explanation = "";
  
  // Calculate thresholds
  const isCritical = (temp > 40 || hr > 130 || gas > 3000 || health === 'CRITICAL');
  const isWarning = !isCritical && (temp >= 39 || hr >= 100 || gas >= 1500 || health === 'WARNING');
  
  if (isCritical) {
    status = "CRITICAL";
    score = Math.max(10, 100 - currentVitals.riskScore); // Health Score is inverse of local risk
    risk = "High";
    
    if (temp > 40) {
      conditions.push("High Fever / Severe Hyperthermia", "Infectious Disease / Heat Stroke");
      observations.push(`Temperature is highly elevated at ${temp}°C, indicating critical metabolic or environmental distress.`);
      recommendations.push("Isolate the animal to a cool, shaded quarantine stall immediately.");
      actions.push("Administer cold water or misting and apply electrolytes.");
    }
    if (hr > 130) {
      conditions.push("Severe Tachycardia / Acute Stress");
      observations.push(`Heart rate is extremely fast at ${hr} BPM, suggesting severe cardiovascular strain.`);
      recommendations.push("Prepare veterinary diagnostic history and contact attending specialist.");
      actions.push("Minimize external noise, predators, or handling triggers.");
    }
    if (gas > 3000) {
      conditions.push("Toxic Gas Exposure / Respiratory Failure");
      observations.push(`Ammonia/methane ambient levels are hazardous at ${gas} ppm.`);
      recommendations.push("Move the herd to fresh pasture or clear ventilation blockages immediately.");
      actions.push("Turn on auxiliary barn blowers to clear gaseous accumulation.");
    }
    if (movement < 0.8) {
      conditions.push("Severe Lethargy / Recumbency");
      observations.push(`Movement acceleration index is extremely sluggish at ${movement} m/s².`);
      recommendations.push("Physically inspect the animal for injury or lameness.");
      actions.push("Provide immediate soft bedding and direct supervision.");
    }
    if (conditions.includes("None Detected")) {
      conditions = conditions.filter(c => c !== "None Detected");
    }
    explanation = `The animal was classified as CRITICAL due to severe parameter breaches. Health score is currently at ${score}%. Immediate clinical support is advised.`;
  } else if (isWarning) {
    status = "WARNING";
    score = Math.max(40, 100 - currentVitals.riskScore);
    risk = "Medium";
    
    if (temp >= 39) {
      conditions.push("Mild Hyperthermia / Stress Response");
      observations.push(`Temperature is slightly elevated at ${temp}°C.`);
      recommendations.push("Verify shaded spots and water availability.");
      actions.push("Increase ventilation in the barn area.");
    }
    if (hr >= 100) {
      conditions.push("Mild Cardiovascular Distress");
      observations.push(`Heart rate is elevated at ${hr} BPM.`);
      recommendations.push("Check feed quality and stress levels.");
      actions.push("Separate the animal from aggressive herd members.");
    }
    if (gas >= 1500) {
      conditions.push("Elevated Barn Gas Concentration");
      observations.push(`Gas concentration is moderate at ${gas} ppm.`);
      recommendations.push("Ensure exhaust fans are fully operational.");
      actions.push("Clear waste and manure to reduce ammonia emissions.");
    }
    if (conditions.includes("None Detected")) {
      conditions = conditions.filter(c => c !== "None Detected");
    }
    explanation = `The animal is in a WARNING state because vital parameters are outside healthy thresholds. Preventive steps should be taken to avoid critical escalation.`;
  } else {
    status = "HEALTHY";
    score = Math.max(90, 100 - currentVitals.riskScore);
    risk = "Low";
    conditions = ["None Detected"];
    observations.push(`All vitals are normal: Temperature ${temp}°C, Heart Rate ${hr} BPM, Ambient Gas ${gas} ppm.`);
    recommendations.push("Continue normal monitoring.");
    actions.push("Maintain standard nutrition and hydration routines.");
    explanation = "All parameters are within normal physiological bounds. The livestock exhibits healthy temperature, heart rate, and activity baselines.";
  }

  return {
    healthStatus: status,
    healthScore: score,
    riskLevel: risk,
    possibleConditions: conditions,
    keyObservations: observations,
    veterinaryRecommendations: recommendations,
    preventiveActions: actions,
    confidenceScore: "95%",
    statusExplanation: explanation
  };
}

function renderAIReport(report) {
  const container = document.getElementById('aiReportCard');
  const placeholder = document.getElementById('aiReportPlaceholder');
  const loading = document.getElementById('aiReportLoading');
  const content = document.getElementById('aiReportContent');
  
  if (!container || !content) return;
  
  // Hide loading and placeholder, show content
  if (placeholder) placeholder.style.display = 'none';
  if (loading) loading.style.display = 'none';
  content.style.display = 'block';
  
  // Set risk classes on container based on Risk Level (Low=Healthy, Medium=Warning, High=Critical)
  container.className = 'ai-report-container'; // Reset
  let stateClass = 'state-healthy';
  let gaugeColor = '#22c55e';
  
  const riskLower = (report.riskLevel || '').toLowerCase();
  if (riskLower === 'high' || riskLower === 'critical') {
    stateClass = 'state-critical';
    gaugeColor = '#ef4444';
  } else if (riskLower === 'medium' || riskLower === 'warning') {
    stateClass = 'state-warning';
    gaugeColor = '#f97316';
  }
  container.classList.add(stateClass);
  
  // Set Health Status & Risk Level Badge
  const statusEl = document.getElementById('aiReportStatus');
  if (statusEl) {
    statusEl.textContent = report.healthStatus;
    statusEl.className = 'ai-report-status';
    if (stateClass === 'state-critical') statusEl.style.color = 'var(--color-critical)';
    else if (stateClass === 'state-warning') statusEl.style.color = 'var(--color-warning)';
    else statusEl.style.color = 'var(--color-healthy)';
  }
  
  const badgeEl = document.getElementById('aiReportRiskLevelBadge');
  if (badgeEl) {
    badgeEl.textContent = `${report.riskLevel} Risk`;
    badgeEl.style.color = '#fff';
    if (stateClass === 'state-critical') {
      badgeEl.style.background = 'rgba(239, 68, 68, 0.3)';
      badgeEl.style.border = '1px solid rgba(239, 68, 68, 0.5)';
    } else if (stateClass === 'state-warning') {
      badgeEl.style.background = 'rgba(249, 115, 22, 0.3)';
      badgeEl.style.border = '1px solid rgba(249, 115, 22, 0.5)';
    } else {
      badgeEl.style.background = 'rgba(34, 197, 94, 0.3)';
      badgeEl.style.border = '1px solid rgba(34, 197, 94, 0.5)';
    }
  }
  
  // Set Health Score Val
  const scoreValEl = document.getElementById('aiReportRiskVal');
  if (scoreValEl) scoreValEl.textContent = report.healthScore;
  
  // Update gauge circle
  const gaugeFill = document.getElementById('aiReportGaugeFill');
  if (gaugeFill) {
    const circumference = 263.8;
    const offset = circumference * (1 - report.healthScore / 100);
    gaugeFill.style.strokeDashoffset = offset;
    gaugeFill.setAttribute('stroke', gaugeColor);
  }
  
  // Set confidence and timestamp
  const confEl = document.getElementById('aiReportConfidence');
  if (confEl) {
    let scoreStr = String(report.confidenceScore || report.confidenceLevel || '95%');
    if (!scoreStr.includes('%')) scoreStr += '%';
    confEl.textContent = scoreStr;
  }
  
  const timeEl = document.getElementById('aiReportTimestamp');
  if (timeEl) {
    const now = new Date();
    timeEl.textContent = now.toLocaleTimeString() + ' ' + now.toLocaleDateString();
  }
  
  // Possible conditions tags
  const conditionsEl = document.getElementById('aiReportConditions');
  if (conditionsEl) {
    conditionsEl.innerHTML = '';
    (report.possibleConditions || []).forEach(cond => {
      const chip = document.createElement('span');
      chip.className = 'condition-tag-chip';
      chip.textContent = cond;
      conditionsEl.appendChild(chip);
    });
  }
  
  // Key Observations list
  const obsEl = document.getElementById('aiReportObservations');
  if (obsEl) {
    obsEl.innerHTML = '';
    (report.keyObservations || []).forEach(obs => {
      const item = document.createElement('li');
      item.className = 'recommendation-badge-item';
      
      const icon = document.createElement('span');
      icon.className = 'rec-check-icon';
      icon.textContent = '👁️';
      
      const text = document.createElement('span');
      text.textContent = obs;
      
      item.appendChild(icon);
      item.appendChild(text);
      obsEl.appendChild(item);
    });
  }
  
  // Recommendations and Preventive Actions list
  const recsEl = document.getElementById('aiReportRecommendations');
  if (recsEl) {
    recsEl.innerHTML = '';
    
    // Combine Recommendations and Actions
    const combinedList = [];
    (report.veterinaryRecommendations || []).forEach(rec => {
      combinedList.push({ text: rec, icon: '🩹' });
    });
    (report.preventiveActions || []).forEach(act => {
      combinedList.push({ text: act, icon: '🛡️' });
    });
    
    combinedList.forEach(item => {
      const li = document.createElement('li');
      li.className = 'recommendation-badge-item';
      
      const icon = document.createElement('span');
      icon.className = 'rec-check-icon';
      icon.textContent = item.icon;
      
      const text = document.createElement('span');
      text.textContent = item.text;
      
      li.appendChild(icon);
      li.appendChild(text);
      recsEl.appendChild(li);
    });
  }
  
  // AI Status Reasoning
  const whyBlock = document.getElementById('aiReportWhyCriticalBlock');
  const whyTitle = document.getElementById('aiReportWhyCriticalTitle');
  const whyText = document.getElementById('aiReportWhyCriticalText');
  if (whyBlock && whyText) {
    whyBlock.style.display = 'block';
    
    if (whyTitle) {
      whyTitle.textContent = `Why AI Marked This Animal As ${report.healthStatus || 'Healthy'}`;
    }
    
    whyText.textContent = report.statusExplanation || report.whyCritical || '';
    
    const box = whyBlock.querySelector('.critical-reasoning-box');
    if (box) {
      if (stateClass === 'state-critical') {
        box.style.background = 'rgba(239, 68, 68, 0.06)';
        box.style.borderColor = 'rgba(239, 68, 68, 0.3)';
        whyText.style.color = '#fca5a5';
      } else if (stateClass === 'state-warning') {
        box.style.background = 'rgba(249, 115, 22, 0.06)';
        box.style.borderColor = 'rgba(249, 115, 22, 0.3)';
        whyText.style.color = '#fed7aa';
      } else {
        box.style.background = 'rgba(34, 197, 94, 0.04)';
        box.style.borderColor = 'rgba(34, 197, 94, 0.15)';
        whyText.style.color = '#bbf7d0';
      }
    }
  }
}

function setupGeminiHandlers() {
  const btn = document.getElementById('btnGenerateAIReport');
  if (!btn) return;
  
  btn.addEventListener('click', async () => {
    const temp = currentVitals.temp;
    const hr = currentVitals.hr;
    const gas = currentVitals.gas;
    const movement = currentVitals.movement;
    const health = currentVitals.health;
    
    // Disable button, show loading
    btn.disabled = true;
    const btnText = btn.querySelector('.btn-text');
    if (btnText) btnText.textContent = 'Generating...';
    
    const placeholder = document.getElementById('aiReportPlaceholder');
    const loading = document.getElementById('aiReportLoading');
    const content = document.getElementById('aiReportContent');
    const container = document.getElementById('aiReportCard');
    
    if (placeholder) placeholder.style.display = 'none';
    if (content) content.style.display = 'none';
    if (loading) loading.style.display = 'flex';
    if (container) {
      container.className = 'ai-report-container'; // reset states
    }
    
    const apiKey = getGeminiApiKey();
    const isMock = (apiKey === 'YOUR_API_KEY');
    
    try {
      if (isMock) {
        // Simulate a delay of 1.5 seconds for loading animation
        await new Promise(resolve => setTimeout(resolve, 1500));
        const report = getMockReport(temp, hr, gas, movement, health);
        renderAIReport(report);
      } else {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
        
        const promptText = `You are an expert livestock veterinarian and animal health specialist.

Analyze the following real-time livestock sensor readings:

Temperature: ${temp} °C
Heart Rate: ${hr} BPM
Gas Level: ${gas} ppm
Movement: ${movement} m/s²
Current Status: ${health}

Generate a professional livestock health report containing:

1. Health Status
2. Health Score (0-100)
3. Risk Level (Low, Medium, High)
4. Possible Conditions
5. Key Observations
6. Veterinary Recommendations
7. Preventive Actions
8. Confidence Score (%)
9. Explain why the animal received this status

Format the response professionally with clear headings and bullet points.

If values indicate abnormal conditions, explain possible causes and suggest practical actions for the farmer.

Keep the report concise, realistic, and suitable for a livestock monitoring dashboard. You MUST format the response as JSON using the requested schema.`;

        const payload = {
          contents: [{
            parts: [{ text: promptText }]
          }],
          systemInstruction: {
            parts: [{
              text: "You are an expert livestock veterinarian and animal health specialist. Analyze the provided sensor readings and generate a concise professional health report. Consider temperature, heart rate, gas exposure, movement, and current status. Identify risks, possible conditions, and provide practical recommendations for the farmer. You MUST format the response as JSON using the requested schema. Important: Do NOT return empty arrays for possibleConditions, keyObservations, veterinaryRecommendations, or preventiveActions. If the animal is healthy, populate them with appropriate positive observations (e.g., 'Normal body temperature maintained') and standard preventive actions (e.g., 'Ensure continuous access to fresh water')."
            }]
          },
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                healthStatus: { type: "STRING" },
                healthScore: { type: "INTEGER" },
                riskLevel: { type: "STRING" },
                possibleConditions: { type: "ARRAY", items: { type: "STRING" } },
                keyObservations: { type: "ARRAY", items: { type: "STRING" } },
                veterinaryRecommendations: { type: "ARRAY", items: { type: "STRING" } },
                preventiveActions: { type: "ARRAY", items: { type: "STRING" } },
                confidenceScore: { type: "STRING" },
                statusExplanation: { type: "STRING" }
              },
              required: [
                "healthStatus",
                "healthScore",
                "riskLevel",
                "possibleConditions",
                "keyObservations",
                "veterinaryRecommendations",
                "preventiveActions",
                "confidenceScore",
                "statusExplanation"
              ]
            }
          }
        };

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          throw new Error(`Gemini API returned status ${res.status}`);
        }

        const json = await res.json();
        const text = json.candidates[0].content.parts[0].text;
        const result = JSON.parse(text);
        
        // Ensure the report healthScore and healthStatus align with the dashboard's calculated metrics
        result.healthScore = 100 - currentVitals.riskScore;
        result.healthStatus = currentVitals.health;
        
        // Set the risk level accordingly
        if (currentVitals.health === 'CRITICAL') {
          result.riskLevel = 'High';
        } else if (currentVitals.health === 'WARNING') {
          result.riskLevel = 'Medium';
        } else {
          result.riskLevel = 'Low';
        }
        
        renderAIReport(result);
        showToast("Gemini Health intelligence report generated successfully.", "success");
      }
    } catch (err) {
      console.error("Gemini API Error:", err);
      showToast("Offline mode: Displaying local health intelligence assessment.", "info");
      
      // Visual feedback for error but fallback
      await new Promise(resolve => setTimeout(resolve, 800));
      const report = getMockReport(temp, hr, gas, movement, health);
      renderAIReport(report);
    } finally {
      btn.disabled = false;
      if (btnText) btnText.textContent = 'Generate AI Report';
    }
  });
}

// ============================================================
//  INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  setupSidebarToggle();
  setupTokenHandlers();
  setupChatbotHandlers();
  setupEmergencyHandlers();
  setupReportModalHandlers();
  setupGeminiHandlers();
  
  const token = getBlynkToken();
  const hasToken = (token && token !== 'YOUR_AUTH_TOKEN' && token.trim() !== '');
  
  updateTokenStateUI(hasToken);

  if (hasToken) {
    initRealtimeCharts();
    
    // Poll immediately
    pollBlynkData();
    
    // Poll every 3 seconds
    setInterval(pollBlynkData, 3000);
  }

  // Live sidebar clock ticking
  setInterval(updateClock, 1000);
  updateClock();

  console.log('🌿 FarmGuard AI Blynk-Connected Dashboard Loaded.');
});
