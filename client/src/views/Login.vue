<template>
  <div class="lp">

    <!-- Panel izquierdo -->
    <aside class="lp__side">
      <div class="lp__side-inner">
        <img class="lp__logo" src="/redesip-logo-blanco.png" alt="RedesIP" />
        <h2 class="lp__tagline">Programación de Pagos</h2>
        <ul class="lp__features">
          <li>
            <span class="lp__feat-icon">📋</span>
            <span><b>Registra</b> gastos con sus soportes</span>
          </li>
          <li>
            <span class="lp__feat-icon">💰</span>
            <span><b>Valida</b> fondos en Tesorería</span>
          </li>
          <li>
            <span class="lp__feat-icon">✅</span>
            <span><b>Aprueba</b> en Auditoría</span>
          </li>
          <li>
            <span class="lp__feat-icon">📊</span>
            <span><b>Reportes</b> y control de saldos</span>
          </li>
        </ul>
      </div>
      <!-- Decoración de fondo -->
      <div class="lp__deco lp__deco--1"></div>
      <div class="lp__deco lp__deco--2"></div>
      <div class="lp__deco lp__deco--3"></div>
    </aside>

    <!-- Panel derecho: formulario -->
    <main class="lp__main">
      <div class="lp__card">
        <div class="lp__card-head">
          <div class="lp__card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <h1 class="lp__card-title">Iniciar sesión</h1>
          <p class="lp__card-hint">Ingresa tu contraseña del sistema (ICG)</p>
        </div>

        <form @submit.prevent="onSubmit" class="lp__form">
          <div class="lp__field">
            <label for="password">Contraseña</label>
            <div class="lp__input-wrap">
              <svg class="lp__input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <input id="password" :type="verPass ? 'text' : 'password'" v-model="password" autocomplete="current-password" required placeholder="••••••••" :disabled="loading" />
              <button type="button" class="lp__eye" @click="verPass = !verPass" tabindex="-1">
                <svg v-if="!verPass" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              </button>
            </div>
          </div>

          <transition name="fade">
            <div v-if="error" class="lp__error">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {{ error }}
            </div>
          </transition>

          <button type="submit" class="lp__btn" :disabled="loading || !password">
            <span v-if="!loading">Entrar</span>
            <span v-else class="lp__spinner"></span>
          </button>
        </form>

        <p class="lp__footer">RedesIP · Sistema de Gestión de Gastos</p>
      </div>
    </main>

  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const auth = useAuthStore();

const password = ref('');
const error = ref('');
const loading = ref(false);
const verPass = ref(false);

async function onSubmit() {
  error.value = '';
  loading.value = true;
  try {
    await auth.login(password.value);
    router.push('/');
  } catch (e) {
    error.value = e.response?.data?.error || 'Contraseña incorrecta';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
/* ── Layout ─────────────────────────────────────────────── */
.lp {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1fr 1fr;
}

/* ── Panel izquierdo ────────────────────────────────────── */
.lp__side {
  background: #1a1a1a;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 56px 48px;
  position: relative;
  overflow: hidden;
}
.lp__side::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(134,187,37,0.15) 0%, transparent 60%);
  pointer-events: none;
}
.lp__side-inner {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0;
  max-width: 380px;
  width: 100%;
}
.lp__logo {
  height: 100px;
  width: auto;
  display: block;
  margin-bottom: 24px;
  filter: drop-shadow(0 4px 24px rgba(134,187,37,0.25));
}
.lp__tagline {
  color: #fff;
  font-size: 24px;
  font-weight: 700;
  margin: 0 0 36px;
  line-height: 1.3;
}
.lp__tagline span { color: #86bb25; }

.lp__features {
  list-style: none;
  padding: 28px 0 0;
  margin: 0;
  border-top: 1px solid rgba(255,255,255,0.08);
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: 100%;
}
.lp__features li {
  display: flex;
  align-items: center;
  gap: 14px;
  color: #c9d1d9;
  font-size: 15px;
  text-align: left;
}
.lp__feat-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: rgba(134,187,37,0.15);
  border: 1px solid rgba(134,187,37,0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}
.lp__features b { color: #fff; }

/* Decoraciones de fondo */
.lp__deco {
  position: absolute;
  border-radius: 50%;
  border: 1px solid rgba(134,187,37,0.12);
  pointer-events: none;
}
.lp__deco--1 { width: 420px; height: 420px; bottom: -140px; right: -120px; }
.lp__deco--2 { width: 260px; height: 260px; bottom: -60px; right: -40px; background: rgba(134,187,37,0.05); }
.lp__deco--3 { width: 160px; height: 160px; top: -50px; left: -50px; }

/* ── Panel derecho ──────────────────────────────────────── */
.lp__main {
  background: #f5f6f8;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
}
.lp__card {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 4px 6px rgba(0,0,0,0.05), 0 20px 40px rgba(0,0,0,0.08);
  padding: 40px 44px;
  width: 100%;
  max-width: 400px;
}

.lp__card-head {
  text-align: center;
  margin-bottom: 32px;
}
.lp__card-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: #eef6df;
  border: 1px solid #c8e89a;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
  color: #6f9e1f;
}
.lp__card-icon svg { width: 26px; height: 26px; }
.lp__card-title {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 700;
  color: #202020;
}
.lp__card-hint {
  margin: 0;
  font-size: 13px;
  color: #6b7280;
}

/* ── Form ───────────────────────────────────────────────── */
.lp__form { display: flex; flex-direction: column; gap: 18px; }

.lp__field { display: flex; flex-direction: column; gap: 6px; }
.lp__field label { font-size: 13px; font-weight: 600; color: #374151; }

.lp__input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.lp__input-icon {
  position: absolute;
  left: 13px;
  width: 17px;
  height: 17px;
  color: #9ca3af;
  pointer-events: none;
  flex-shrink: 0;
}
.lp__input-wrap input {
  width: 100%;
  padding: 11px 42px;
  border: 1.5px solid #e5e7eb;
  border-radius: 9px;
  font-size: 14px;
  outline: none;
  font-family: inherit;
  background: #fafafa;
  color: #202020;
  transition: border-color .15s, box-shadow .15s, background .15s;
}
.lp__input-wrap input:focus {
  border-color: #86bb25;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(134,187,37,0.18);
}
.lp__input-wrap input:disabled { opacity: 0.6; cursor: not-allowed; }
.lp__input-wrap input::placeholder { color: #bfc4cc; }

.lp__eye {
  position: absolute;
  right: 11px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  color: #9ca3af;
  display: flex;
  align-items: center;
}
.lp__eye:hover { color: #555; }
.lp__eye svg { width: 17px; height: 17px; }

/* ── Error ──────────────────────────────────────────────── */
.lp__error {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 13px;
}

/* ── Botón ──────────────────────────────────────────────── */
.lp__btn {
  width: 100%;
  padding: 13px;
  border: none;
  border-radius: 9px;
  background: #86bb25;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 4px;
  transition: background .15s, transform .1s, box-shadow .15s;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 46px;
}
.lp__btn:hover:not(:disabled) {
  background: #6f9e1f;
  box-shadow: 0 4px 14px rgba(134,187,37,0.35);
}
.lp__btn:active:not(:disabled) { transform: scale(0.98); }
.lp__btn:disabled { opacity: 0.55; cursor: not-allowed; }

/* Spinner dentro del botón */
.lp__spinner {
  width: 18px; height: 18px;
  border-radius: 50%;
  border: 2.5px solid rgba(255,255,255,0.35);
  border-top-color: #fff;
  animation: lp-spin 0.7s linear infinite;
}
@keyframes lp-spin { to { transform: rotate(360deg); } }

/* ── Footer ─────────────────────────────────────────────── */
.lp__footer {
  text-align: center;
  margin: 28px 0 0;
  font-size: 12px;
  color: #9ca3af;
}

/* ── Transición error ───────────────────────────────────── */
.fade-enter-active, .fade-leave-active { transition: opacity .2s, transform .2s; }
.fade-enter-from { opacity: 0; transform: translateY(-6px); }
.fade-leave-to   { opacity: 0; }

/* ── Responsive ─────────────────────────────────────────── */
@media (max-width: 760px) {
  .lp { grid-template-columns: 1fr; }
  .lp__side { display: none; }
  .lp__card { padding: 32px 24px; }
}
</style>
