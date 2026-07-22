// Tono de notificación sintetizado con Web Audio API — sin archivo de audio externo.
// Un "ding-ding" corto y suave (dos notas ascendentes con envolvente de volumen).
let ctx = null;

export function reproducirSonidoNotificacion() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const ahora = ctx.currentTime;
    [[880, 0], [1175, 0.12]].forEach(([frecuencia, retraso]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frecuencia;
      gain.gain.setValueAtTime(0.0001, ahora + retraso);
      gain.gain.exponentialRampToValueAtTime(0.2, ahora + retraso + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ahora + retraso + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ahora + retraso);
      osc.stop(ahora + retraso + 0.32);
    });
  } catch {
    // Web Audio bloqueado/no disponible (ej. autoplay del navegador) — sin sonido, sin romper nada.
  }
}
