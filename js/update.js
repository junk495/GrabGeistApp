// Service-Worker-Registrierung + Update-Prüfung.
// Prüft beim Start, ob eine neue Version bereitsteht, und bietet dann
// unten am Bildschirm ein Neuladen an („Neue Version verfügbar“).

(function () {
  if (!('serviceWorker' in navigator)) return;

  const toast = document.getElementById('updateToast');
  const updateBtn = document.getElementById('updateNow');
  let newWorker = null;

  // Aktuelle Version anzeigen (Wert aus js/version.js).
  const versionEl = document.getElementById('appVersion');
  if (versionEl && typeof APP_VERSION !== 'undefined') {
    versionEl.textContent = APP_VERSION;
  }

  function showUpdate() {
    if (toast) toast.hidden = false;
  }

  if (updateBtn) {
    updateBtn.addEventListener('click', () => {
      if (newWorker) newWorker.postMessage('SKIP_WAITING');
    });
  }

  // Wenn der neue Worker die Kontrolle übernimmt, Seite neu laden.
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker.register('./sw.js')
    .then((reg) => {
      reg.addEventListener('updatefound', () => {
        newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdate();
          }
        });
      });

      // Beim Start wartet evtl. bereits eine neue Version.
      navigator.serviceWorker.ready.then(() => {
        if (reg.waiting && navigator.serviceWorker.controller) {
          newWorker = reg.waiting;
          showUpdate();
        }
      });
    })
    .catch((err) => console.warn('Service Worker nicht registrierbar:', err));
})();
