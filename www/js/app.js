/* =============================================
   BUS ALERT - MAIN APPLICATION LOGIC
   ============================================= */

// ---- STATE ----
let map = null;
let userMarker = null;
let destinationMarker = null;
let destinationCircle = null;
let userLocation = null;
let destination = null;
let isTracking = false;
let watchId = null;
let alarmAudio = null;
let customSoundUrl = null;
let customSoundName = null;
let favorites = [];
let vibrationInterval = null;
let donatedStatus = false;
let donationTimer = null;

// Default alarm sound
const DEFAULT_ALARM_URL = 'https://cdn.pixabay.com/audio/2022/10/14/audio_332faeeab6.mp3';

// ---- DOM ELEMENTS ----
const $ = (id) => document.getElementById(id);

const loadingScreen = $('loading-screen');
const placeholderBox = $('placeholder-box');
const statsContainer = $('stats-container');
const distanceValue = $('distance-value');
const radiusInput = $('radius-input');
const btnAction = $('btn-action');
const btnActionText = $('btn-action-text');
const btnMenu = $('btn-menu');
const btnCenter = $('btn-center');
const btnSaveFavorite = $('btn-save-favorite');
const modalSettings = $('modal-settings');
const modalSaveFavorite = $('modal-save-favorite');
const soundNameEl = $('sound-name');
const btnPickSound = $('btn-pick-sound');
const btnRestoreSound = $('btn-restore-sound');
const btnCloseSettings = $('btn-close-settings');
const btnCancelFav = $('btn-cancel-fav');
const btnConfirmFav = $('btn-confirm-fav');
const favoriteNameInput = $('favorite-name-input');
const favoritesList = $('favorites-list');
const emptyFavorites = $('empty-favorites');
const audioFileInput = $('audio-file-input');
const modalDonation = $('modal-donation');
const checkDonated = $('check-donated');
const btnCloseDonation = $('btn-close-donation');

// ---- UTILITIES ----
function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function showToast(message, duration = 3000) {
  // Remove existing toasts
  document.querySelectorAll('.toast').forEach(t => t.remove());

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ---- MAP INITIALIZATION ----
function initMap(lat, lng) {
  map = L.map('map', {
    zoomControl: false,
    fadeAnimation: true,
    attributionControl: false
  }).setView([lat, lng], 15);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(map);

  // User location marker (blue dot)
  const userIcon = L.divIcon({
    className: 'user-dot-wrapper',
    html: '<div class="user-dot"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });

  userMarker = L.marker([lat, lng], {
    icon: userIcon,
    zIndexOffset: 1000
  }).addTo(map);

  // Map click handler
  map.on('click', function (e) {
    setDestination(e.latlng.lat, e.latlng.lng);
  });
}

function setDestination(lat, lng) {
  destination = { latitude: lat, longitude: lng };

  const radius = parseInt(radiusInput.value) || 50;

  // Remove old markers
  if (destinationMarker) map.removeLayer(destinationMarker);
  if (destinationCircle) map.removeLayer(destinationCircle);

  // Add destination marker
  const destIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41]
  });

  destinationMarker = L.marker([lat, lng], { icon: destIcon }).addTo(map);

  // Add radius circle
  destinationCircle = L.circle([lat, lng], {
    radius: radius,
    color: '#3B82F6',
    fillColor: '#3B82F6',
    fillOpacity: 0.15,
    weight: 2
  }).addTo(map);

  // Update UI
  updateDistanceDisplay();
  showDestinationUI();
  updateSaveFavoriteButton();
}

function updateDistanceDisplay() {
  if (userLocation && destination) {
    const dist = getDistanceInMeters(
      userLocation.latitude, userLocation.longitude,
      destination.latitude, destination.longitude
    );
    distanceValue.textContent = (dist / 1000).toFixed(2) + ' km';
  } else {
    distanceValue.textContent = '-- km';
  }
}

function showDestinationUI() {
  placeholderBox.classList.add('hidden');
  statsContainer.classList.remove('hidden');
  btnAction.disabled = false;
}

function hideDestinationUI() {
  placeholderBox.classList.remove('hidden');
  statsContainer.classList.add('hidden');
  btnAction.disabled = true;
  distanceValue.textContent = '-- km';
}

function updateSaveFavoriteButton() {
  if (!destination) {
    btnSaveFavorite.classList.add('hidden');
    return;
  }

  // Check if already saved
  const alreadySaved = favorites.some(f =>
    Math.abs(f.latitude - destination.latitude) < 0.0001 &&
    Math.abs(f.longitude - destination.longitude) < 0.0001
  );

  if (alreadySaved) {
    btnSaveFavorite.classList.add('hidden');
  } else {
    btnSaveFavorite.classList.remove('hidden');
  }
}

// ---- GEOLOCATION ----
async function initGeolocation() {
  if (!('geolocation' in navigator)) {
    showToast('Geolocalização não suportada neste dispositivo.');
    hideLoading();
    return;
  }

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 30000
      });
    });

    userLocation = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude
    };

    initMap(userLocation.latitude, userLocation.longitude);
    hideLoading();

  } catch (error) {
    console.warn('High accuracy failed, trying low accuracy...', error);

    // Fallback: try without high accuracy
    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 60000
        });
      });

      userLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };

      initMap(userLocation.latitude, userLocation.longitude);

    } catch (err) {
      // Start with default location (São Paulo)
      showToast('Não foi possível obter sua localização. Verifique o GPS.');
      initMap(-23.5505, -46.6333);
    }
    hideLoading();
  }
}

function updateUserPosition(lat, lng) {
  userLocation = { latitude: lat, longitude: lng };

  if (userMarker) {
    userMarker.setLatLng([lat, lng]);
  }

  updateDistanceDisplay();
}

// ---- TRACKING ----
function startTracking() {
  if (!destination) {
    showToast('Toque no mapa para definir seu destino primeiro.');
    return;
  }

  isTracking = true;
  radiusInput.disabled = true;

  btnAction.classList.remove('btn-start');
  btnAction.classList.add('btn-stop');
  btnActionText.textContent = 'Parar Alerta';

  // Replace icon
  const iconEl = btnAction.querySelector('svg, [data-lucide]');
  if (iconEl) {
    iconEl.setAttribute('data-lucide', 'bell-off');
    lucide.createIcons();
  }

  // Center on user
  if (userLocation && map) {
    map.setView([userLocation.latitude, userLocation.longitude], 17, { animate: true });
  }

  // Start watching position
  watchId = navigator.geolocation.watchPosition(
    (position) => {
      updateUserPosition(position.coords.latitude, position.coords.longitude);

      if (destination) {
        const dist = getDistanceInMeters(
          position.coords.latitude, position.coords.longitude,
          destination.latitude, destination.longitude
        );

        const radius = parseInt(radiusInput.value) || 50;
        if (dist <= radius) {
          triggerArrivalAlarm();
        }
      }
    },
    (error) => {
      console.error('Watch position error:', error);
    },
    {
      enableHighAccuracy: true,
      distanceFilter: 10,
      maximumAge: 5000
    }
  );

  const radius = radiusInput.value || '50';
  showToast(`Alerta iniciado! Você será avisado a ${radius}m do destino.`);
}

function stopTracking() {
  isTracking = false;
  radiusInput.disabled = false;

  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  btnAction.classList.remove('btn-stop');
  btnAction.classList.add('btn-start');
  btnActionText.textContent = 'Iniciar Alerta';

  const iconEl = btnAction.querySelector('svg, [data-lucide]');
  if (iconEl) {
    iconEl.setAttribute('data-lucide', 'bell-ring');
    lucide.createIcons();
  }

  stopAlarm();
}

// ---- ALARM ----
function triggerArrivalAlarm() {
  // Stop tracking
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  isTracking = false;

  // Play sound
  playAlarmSound();

  // Vibrate (if supported)
  if ('vibrate' in navigator) {
    vibrationInterval = setInterval(() => {
      navigator.vibrate([1000, 500, 1000, 500]);
    }, 3000);
    navigator.vibrate([1000, 500, 1000, 500]);
  }

  // Show arrival overlay
  showArrivalOverlay();
}

function showArrivalOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'arrival-overlay';
  overlay.id = 'arrival-overlay';
  overlay.innerHTML = `
    <div class="arrival-icon">
      <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
    </div>
    <h2 class="arrival-title">Acorde! O Ônibus Chegou 🚌</h2>
    <p class="arrival-subtitle">Você está dentro do raio alvo do seu destino.</p>
    <button class="arrival-btn" id="btn-dismiss-alarm">Desligar Alarme</button>
  `;
  document.body.appendChild(overlay);

  document.getElementById('btn-dismiss-alarm').addEventListener('click', () => {
    dismissAlarm();
  });
}

function dismissAlarm() {
  stopAlarm();

  // Remove overlay
  const overlay = document.getElementById('arrival-overlay');
  if (overlay) overlay.remove();

  // Reset state
  destination = null;
  if (destinationMarker) { map.removeLayer(destinationMarker); destinationMarker = null; }
  if (destinationCircle) { map.removeLayer(destinationCircle); destinationCircle = null; }

  hideDestinationUI();
  updateSaveFavoriteButton();

  // Reset button
  btnAction.classList.remove('btn-stop');
  btnAction.classList.add('btn-start');
  btnActionText.textContent = 'Iniciar Alerta';
  radiusInput.disabled = false;

  const iconEl = btnAction.querySelector('svg, [data-lucide]');
  if (iconEl) {
    iconEl.setAttribute('data-lucide', 'bell-ring');
    lucide.createIcons();
  }
}

function playAlarmSound(url) {
  stopAlarmSound();
  const soundUrl = url || customSoundUrl || DEFAULT_ALARM_URL;
  alarmAudio = new Audio(soundUrl);
  alarmAudio.loop = !url; // Loop if not preview
  alarmAudio.play().catch(err => {
    console.error('Error playing audio:', err);
    showToast('Erro ao reproduzir o som. Verifique se o arquivo é válido.');
  });
}

function stopAlarmSound() {
  if (alarmAudio) {
    alarmAudio.pause();
    alarmAudio.currentTime = 0;
    alarmAudio = null;
  }
}

function stopAlarm() {
  stopAlarmSound();
  if (vibrationInterval) {
    clearInterval(vibrationInterval);
    vibrationInterval = null;
  }
  if ('vibrate' in navigator) {
    navigator.vibrate(0);
  }
}

// ---- FAVORITES ----
function loadFavorites() {
  try {
    const saved = localStorage.getItem('@busalert_favorites');
    if (saved) {
      favorites = JSON.parse(saved);
    }
  }
}

// ---- MONETIZATION / DONATION ----
function loadDonationStatus() {
  const saved = localStorage.getItem('@busalert_donated');
  donatedStatus = (saved === 'true');
}

function startDonationTimer() {
  if (donatedStatus) return;

  // Set timer to show donation modal every 5 minutes (300000 ms)
  donationTimer = setInterval(() => {
    if (!donatedStatus) {
      showDonationModal();
    }
  }, 300000);
}

function showDonationModal() {
  modalDonation.classList.remove('hidden');
}

function handleDonationClose() {
  if (checkDonated.checked) {
    donatedStatus = true;
    localStorage.setItem('@busalert_donated', 'true');
    clearInterval(donationTimer);
  }
  modalDonation.classList.add('hidden');
}

function saveFavorites() {
  try {
    localStorage.setItem('@busalert_favorites', JSON.stringify(favorites));
  } catch (e) {
    console.error('Error saving favorites:', e);
  }
}

function renderFavorites() {
  favoritesList.innerHTML = '';

  if (favorites.length === 0) {
    emptyFavorites.classList.remove('hidden');
    return;
  }

  emptyFavorites.classList.add('hidden');

  favorites.forEach(fav => {
    const item = document.createElement('div');
    item.className = 'favorite-item';
    item.innerHTML = `
      <div class="favorite-info" data-id="${fav.id}">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
        <span class="favorite-name">${fav.name}</span>
      </div>
      <button class="favorite-delete" data-delete-id="${fav.id}">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
      </button>
    `;

    // Select favorite
    item.querySelector('.favorite-info').addEventListener('click', () => {
      selectFavorite(fav);
    });

    // Delete favorite
    item.querySelector('.favorite-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteFavorite(fav.id);
    });

    favoritesList.appendChild(item);
  });
}

function selectFavorite(fav) {
  setDestination(fav.latitude, fav.longitude);
  modalSettings.classList.add('hidden');

  // Center map on favorite
  if (map) {
    map.setView([fav.latitude, fav.longitude], 16, { animate: true });
  }
}

function deleteFavorite(id) {
  favorites = favorites.filter(f => f.id !== id);
  saveFavorites();
  renderFavorites();
  updateSaveFavoriteButton();
}

function openSaveFavoriteModal() {
  if (!destination) return;
  favoriteNameInput.value = '';
  modalSaveFavorite.classList.remove('hidden');
  setTimeout(() => favoriteNameInput.focus(), 100);
}

function confirmSaveFavorite() {
  const name = favoriteNameInput.value.trim();
  if (!name || !destination) return;

  const newFav = {
    id: Date.now().toString(),
    name: name,
    latitude: destination.latitude,
    longitude: destination.longitude
  };

  favorites.unshift(newFav);
  saveFavorites();
  renderFavorites();

  modalSaveFavorite.classList.add('hidden');
  updateSaveFavoriteButton();
  showToast('Parada salva nos favoritos!');
}

// ---- CUSTOM SOUND ----
function pickCustomSound() {
  audioFileInput.click();
}

function handleSoundSelected(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Create object URL
  const url = URL.createObjectURL(file);
  customSoundUrl = url;
  customSoundName = file.name;

  soundNameEl.textContent = `Selecionado: ${file.name}`;
  btnRestoreSound.classList.remove('hidden');

  // Play 5s preview
  stopAlarmSound();
  playAlarmSound(url);
  setTimeout(() => stopAlarmSound(), 5000);

  // Reset file input so same file can be selected again
  audioFileInput.value = '';
}

function restoreDefaultSound() {
  customSoundUrl = null;
  customSoundName = null;
  soundNameEl.textContent = 'Padrão (Sirene)';
  btnRestoreSound.classList.add('hidden');
  stopAlarmSound();
}

// ---- LOADING ----
function hideLoading() {
  loadingScreen.classList.add('fade-out');
  setTimeout(() => {
    loadingScreen.style.display = 'none';
  }, 400);
}

// ---- RADIUS CHANGE -> UPDATE CIRCLE ----
function handleRadiusChange() {
  if (destination && destinationCircle) {
    const radius = parseInt(radiusInput.value) || 50;
    destinationCircle.setRadius(radius);
  }
}

// ---- CENTER ON USER ----
function centerOnUser() {
  if (userLocation && map) {
    map.setView([userLocation.latitude, userLocation.longitude], 16, { animate: true });
  }
}

// ---- EVENT LISTENERS ----
function setupEventListeners() {
  // Action button (start/stop)
  btnAction.addEventListener('click', () => {
    if (isTracking) {
      stopTracking();
      showToast('Alerta parado.');
    } else {
      startTracking();
    }
  });

  // Center on user
  btnCenter.addEventListener('click', centerOnUser);

  // Menu
  btnMenu.addEventListener('click', () => {
    renderFavorites();
    modalSettings.classList.remove('hidden');
  });

  // Close settings
  btnCloseSettings.addEventListener('click', () => {
    stopAlarmSound(); // Stop preview if playing
    modalSettings.classList.add('hidden');
  });

  // Save favorite button
  btnSaveFavorite.addEventListener('click', openSaveFavoriteModal);

  // Cancel save favorite
  btnCancelFav.addEventListener('click', () => {
    modalSaveFavorite.classList.add('hidden');
  });

  // Confirm save favorite
  btnConfirmFav.addEventListener('click', confirmSaveFavorite);

  // Enter key on favorite name input
  favoriteNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmSaveFavorite();
  });

  // Pick custom sound
  btnPickSound.addEventListener('click', pickCustomSound);
  audioFileInput.addEventListener('change', handleSoundSelected);

  // Restore default sound
  btnRestoreSound.addEventListener('click', restoreDefaultSound);

  // Radius change
  radiusInput.addEventListener('input', handleRadiusChange);

  // Close modals on overlay click
  modalSettings.addEventListener('click', (e) => {
    if (e.target === modalSettings) {
      stopAlarmSound();
      modalSettings.classList.add('hidden');
    }
  });

  modalSaveFavorite.addEventListener('click', (e) => {
    if (e.target === modalSaveFavorite) {
      modalSaveFavorite.classList.add('hidden');
    }
  });

  // Donation Modal
  btnCloseDonation.addEventListener('click', handleDonationClose);
}

// ---- INIT ----
document.addEventListener('DOMContentLoaded', () => {
  // Safety timeout: Always hide loading after 10 seconds, no matter what
  setTimeout(() => {
    if (loadingScreen.style.display !== 'none') {
      console.warn('Safety timeout: Hiding loading screen manually.');
      hideLoading();
    }
  }, 10000);

  try {
    // Initialize Lucide icons
    lucide.createIcons();
    
    // Load favorites from localStorage
    loadFavorites();

    // Load donation status and start timer
    loadDonationStatus();
    startDonationTimer();

    // Set up all event listeners
    setupEventListeners();

    // Initialize geolocation & map
    initGeolocation();
    
  } catch (err) {
    console.error('Critical initialization error:', err);
    hideLoading(); // At least let the user see the app
  }
});
