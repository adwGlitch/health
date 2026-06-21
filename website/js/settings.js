/* =========================================================
   FarmGuard AI – Settings Logic
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {
  // Load existing values
  const tokenInput = document.getElementById('settingBlynkToken');
  const geminiInput = document.getElementById('settingGeminiKey');
  const cowNameInput = document.getElementById('settingCowName');
  const cowBreedInput = document.getElementById('settingCowBreed');

  const savedToken = typeof getBlynkToken === 'function' ? getBlynkToken() : localStorage.getItem('blynk_auth_token');
  const savedGeminiKey = typeof getGeminiApiKey === 'function' ? getGeminiApiKey() : localStorage.getItem('gemini_api_key');
  const savedCowName = localStorage.getItem('cow_name');
  const savedCowBreed = localStorage.getItem('cow_breed');

  if (tokenInput && savedToken && savedToken !== 'YOUR_AUTH_TOKEN') {
    tokenInput.value = savedToken;
  }
  if (geminiInput && savedGeminiKey && savedGeminiKey !== 'YOUR_API_KEY') {
    geminiInput.value = savedGeminiKey;
  }
  if (cowNameInput && savedCowName) {
    cowNameInput.value = savedCowName;
  }
  if (cowBreedInput && savedCowBreed) {
    cowBreedInput.value = savedCowBreed;
  }

  // Save API Config
  const btnSaveApi = document.getElementById('btnSaveApi');
  if (btnSaveApi) {
    btnSaveApi.addEventListener('click', () => {
      const blynkVal = tokenInput ? tokenInput.value.trim() : '';
      const geminiVal = geminiInput ? geminiInput.value.trim() : '';
      
      let savedAnything = false;
      
      if (blynkVal) {
        localStorage.setItem('blynk_auth_token', blynkVal);
        savedAnything = true;
      } else {
        localStorage.removeItem('blynk_auth_token');
      }
      
      if (geminiVal) {
        localStorage.setItem('gemini_api_key', geminiVal);
        savedAnything = true;
      } else {
        localStorage.removeItem('gemini_api_key');
      }
      
      if (savedAnything) {
        showSettingsToast('API Configuration Saved!', 'success');
      } else {
        showSettingsToast('Please enter valid keys/tokens.', 'error');
      }
    });
  }

  // Save Profile
  const btnSaveProfile = document.getElementById('btnSaveProfile');
  if (btnSaveProfile) {
    btnSaveProfile.addEventListener('click', () => {
      const nameVal = cowNameInput.value.trim();
      const breedVal = cowBreedInput.value.trim();
      
      if (nameVal) localStorage.setItem('cow_name', nameVal);
      else localStorage.removeItem('cow_name');
      
      if (breedVal) localStorage.setItem('cow_breed', breedVal);
      else localStorage.removeItem('cow_breed');
      
      showSettingsToast('Livestock Profile Saved!', 'success');
    });
  }

  // Render mock history
  renderReportHistory();
});

// Mock Report Data
const mockReports = [
  { id: 'FG-908A72', date: '2023-10-25 14:30', status: 'HEALTHY', risk: 12 },
  { id: 'FG-908A71', date: '2023-10-24 09:15', status: 'WARNING', risk: 45 },
  { id: 'FG-908A70', date: '2023-10-22 18:45', status: 'CRITICAL', risk: 85 },
  { id: 'FG-908A69', date: '2023-10-20 10:00', status: 'HEALTHY', risk: 8 },
  { id: 'FG-908A68', date: '2023-10-18 13:20', status: 'HEALTHY', risk: 15 }
];

function renderReportHistory() {
  const tbody = document.getElementById('reportHistoryBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  mockReports.forEach(report => {
    const tr = document.createElement('tr');
    
    let badgeClass = 'badge-healthy';
    if (report.status === 'WARNING') badgeClass = 'badge-warning';
    if (report.status === 'CRITICAL') badgeClass = 'badge-critical';

    tr.innerHTML = `
      <td><strong>${report.id}</strong></td>
      <td>${report.date}</td>
      <td><span class="${badgeClass}">${report.status}</span></td>
      <td>${report.risk}/100</td>
      <td><button class="action-btn" onclick="viewMockReport('${report.id}')">View</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function viewMockReport(id) {
  showSettingsToast(`Loading report ${id}...`, 'info');
  // Normally this would open a modal or navigate to a report view.
}

function showSettingsToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;

  container.appendChild(toast);

  // Force reflow
  void toast.offsetWidth;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
