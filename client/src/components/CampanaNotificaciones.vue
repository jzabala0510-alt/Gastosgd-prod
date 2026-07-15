<template>
  <div class="campana">
    <button class="campana__btn" :class="{ 'is-open': abierto }" @click="abierto = !abierto" title="Notificaciones">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
           stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      <span v-if="total" class="campana__count">{{ total > 99 ? '99+' : total }}</span>
    </button>

    <div v-if="abierto" class="campana__overlay" @click="abierto = false"></div>

    <div v-if="abierto" class="campana__panel">
      <div class="campana__head">
        <b>Notificaciones</b>
        <button class="campana__close" @click="abierto = false" aria-label="Cerrar">✕</button>
      </div>
      <div class="campana__body">
        <template v-if="secciones.length">
          <div v-for="s in secciones" :key="s.tipo" class="campana__sec">
            <div class="campana__sectitle">
              <span>{{ s.titulo }}</span>
              <span class="badge" :class="s.clase">{{ s.n }}</span>
              <button v-if="['analista', 'rechazadas'].includes(s.tipo)" class="btn btn--sm campana__limpiar" @click.stop="limpiarNotifAnalista()">Limpiar</button>
            </div>
            <ul class="pend-lista">
              <li v-for="it in s.items.slice(0, LIMITE)" :key="it.codTienda" class="pend-row" @click="ir(s, it)">
                <span class="pend-row__lugar"><b>{{ it.tienda }}</b> · {{ it.zona }} · {{ it.marca }}</span>
                <span class="badge" :class="s.clase">{{ it.n }}</span>
                <span class="zona-row__arrow">›</span>
              </li>
            </ul>
            <p v-if="s.items.length > LIMITE" class="campana__mas">+ {{ s.items.length - LIMITE }} tienda{{ s.items.length - LIMITE > 1 ? 's' : '' }} más</p>
          </div>
        </template>
        <p v-else class="campana__empty">No tienes notificaciones por ahora.</p>
      </div>
      <div v-if="total" class="campana__foot">
        <button class="btn btn--primary btn--sm campana__vertodas" @click="verTodas">Ver todas las notificaciones</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useNotificaciones } from '../composables/useNotificaciones';

const LIMITE = 3; // filas por sección en el resumen del dropdown
const router = useRouter();
const route = useRoute();
const { secciones, total, irA, limpiarNotifAnalista } = useNotificaciones();
const abierto = ref(false);

function ir(s, it) { abierto.value = false; irA(s, it); }
function verTodas() { abierto.value = false; router.push('/notificaciones'); }

watch(() => route.path, () => { abierto.value = false; }); // cerrar al navegar
</script>
