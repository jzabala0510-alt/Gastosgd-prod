<template>
  <section class="home">

    <!-- Bienvenida -->
    <div class="home__hero">
      <div class="home__hero-text">
        <h1 class="home__title">Hola, {{ auth.nombre }} 👋</h1>
        <p class="home__sub">Ingresaste como <strong>{{ auth.rolLabel }}</strong> · Selecciona una zona para ver sus gastos</p>
      </div>
      <div class="home__hero-stats">
        <div class="home__stat">
          <span class="home__stat-val">{{ zonas.length }}</span>
          <span class="home__stat-label">Zonas</span>
        </div>
        <div class="home__stat-sep"></div>
        <div class="home__stat">
          <span class="home__stat-val">{{ totalTiendas }}</span>
          <span class="home__stat-label">Tiendas</span>
        </div>
      </div>
    </div>

    <!-- Lista de zonas -->
    <div class="home__section-head">
      <h2 class="home__section-title">Zonas disponibles</h2>
      <span class="home__section-hint">Haz clic en una zona para ver sus gastos</span>
    </div>

    <p v-if="loading" class="home__loading">
      <span class="home__loading-spinner"></span> Cargando zonas…
    </p>

    <div v-else class="home__grid">
      <button v-for="z in zonas" :key="z.Zona" class="home__zona" @click="irAGastos(z)">
        <div class="home__zona-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>
        </div>
        <div class="home__zona-info">
          <span class="home__zona-nombre">{{ z.Zona }}</span>
          <span class="home__zona-cont">{{ z.Tiendas }} tienda{{ z.Tiendas === 1 ? '' : 's' }}</span>
        </div>
        <span class="home__zona-arrow">›</span>
      </button>
    </div>

  </section>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { getZonas } from '../api/facturas';
import { useAuthStore } from '../stores/auth';
import { useGastosStore } from '../stores/vistas';

const router = useRouter();
const auth = useAuthStore();
const gastos = useGastosStore();
const zonas = ref([]);
const loading = ref(true);

const totalTiendas = computed(() => zonas.value.reduce((a, z) => a + (z.Tiendas || 0), 0));

function irAGastos(z) {
  gastos.$patch({ zona: z.Zona, marca: '', codTienda: null });
  router.push('/gastos');
}

onMounted(async () => {
  try { zonas.value = await getZonas(); } finally { loading.value = false; }
});
</script>

<style scoped>
.home { padding: 0; }

/* ── Bienvenida ─────────────────────────────────────────── */
.home__hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  background: linear-gradient(135deg, #202020 0%, #2a2f23 100%);
  border-radius: 14px;
  padding: 28px 32px;
  margin-bottom: 28px;
  flex-wrap: wrap;
}
.home__title {
  margin: 0 0 6px;
  font-size: 24px;
  font-weight: 700;
  color: #fff;
}
.home__sub {
  margin: 0;
  font-size: 14px;
  color: #9ca3af;
}
.home__sub strong { color: #86bb25; }

.home__hero-stats {
  display: flex;
  align-items: center;
  gap: 24px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px;
  padding: 14px 24px;
  flex-shrink: 0;
}
.home__stat { text-align: center; }
.home__stat-val {
  display: block;
  font-size: 26px;
  font-weight: 700;
  color: #86bb25;
  line-height: 1;
}
.home__stat-label {
  display: block;
  font-size: 11px;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-top: 4px;
}
.home__stat-sep {
  width: 1px;
  height: 36px;
  background: rgba(255,255,255,0.12);
}

/* ── Cabecera sección ───────────────────────────────────── */
.home__section-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 16px;
}
.home__section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #202020;
}
.home__section-hint {
  font-size: 13px;
  color: #9ca3af;
}

/* ── Loading ────────────────────────────────────────────── */
.home__loading {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #6b7280;
  font-size: 14px;
  padding: 20px 0;
}
.home__loading-spinner {
  width: 18px; height: 18px;
  border-radius: 50%;
  border: 2.5px solid #e5e7eb;
  border-top-color: #86bb25;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Grid de zonas ──────────────────────────────────────── */
.home__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.home__zona {
  display: flex;
  align-items: center;
  gap: 14px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 16px 18px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: border-color .15s, box-shadow .15s, transform .1s;
  position: relative;
  overflow: hidden;
}
.home__zona::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3px;
  background: #86bb25;
  border-radius: 3px 0 0 3px;
  transform: scaleY(0);
  transition: transform .15s;
}
.home__zona:hover {
  border-color: #86bb25;
  box-shadow: 0 4px 16px rgba(134,187,37,0.12);
  transform: translateY(-1px);
}
.home__zona:hover::before { transform: scaleY(1); }
.home__zona:active { transform: translateY(0); }

.home__zona-icon {
  width: 40px; height: 40px;
  border-radius: 10px;
  background: #eef6df;
  color: #6f9e1f;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background .15s;
}
.home__zona-icon svg { width: 20px; height: 20px; }
.home__zona:hover .home__zona-icon { background: #86bb25; color: #fff; }

.home__zona-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.home__zona-nombre {
  font-size: 14px;
  font-weight: 700;
  color: #202020;
  letter-spacing: 0.2px;
}
.home__zona-cont {
  font-size: 12px;
  color: #9ca3af;
}

.home__zona-arrow {
  color: #86bb25;
  font-size: 22px;
  line-height: 1;
  opacity: 0;
  transform: translateX(-4px);
  transition: opacity .15s, transform .15s;
}
.home__zona:hover .home__zona-arrow {
  opacity: 1;
  transform: translateX(0);
}

/* ── Responsive ─────────────────────────────────────────── */
@media (max-width: 600px) {
  .home__hero { padding: 20px; }
  .home__grid { grid-template-columns: 1fr; }
  .home__hero-stats { display: none; }
}
</style>
