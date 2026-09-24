(function () {
  if (!('serviceWorker' in navigator) || !window.isSecureContext || location.protocol === 'file:') {
    window.addEventListener('load', () => window.alert('A abertura offline precisa do endereço HTTPS publicado. O arquivo local não prepara esse recurso.'));
    return;
  }
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
      if (registration.installing) {
        registration.installing.addEventListener('statechange', function () {
          if(this.state === 'redundant' && !registration.active) window.alert('Não foi possível preparar a abertura offline. Abra novamente com conexão.');
        });
      }
    } catch (_) {
      window.alert('Não foi possível preparar a abertura offline. Abra novamente com conexão.');
    }
  });
})();
