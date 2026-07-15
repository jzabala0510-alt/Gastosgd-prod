<template>
  <section class="page">
    <div class="page__head">
      <div>
        <h1 class="page__title">Notificaciones</h1>
        <p class="page__hint">Todas tus notificaciones pendientes, agrupadas por módulo. Haz clic en una tienda para ir directo a ella.</p>
      </div>
      <div class="head-actions"><button class="btn" @click="$router.back()">← Volver</button></div>
    </div>

    <template v-if="secciones.length">
      <div v-for="s in secciones" :key="s.tipo" class="card">
        <h3 class="card__title">
          {{ s.titulo }}
          <span class="badge" :class="s.clase" style="margin-left:8px">{{ s.n }}</span>
          <small class="notif-sub">{{ s.items.length }} tienda{{ s.items.length > 1 ? 's' : '' }}</small>
          <button v-if="['analista', 'rechazadas'].includes(s.tipo)" class="btn btn--sm" style="margin-left:auto" @click="limpiarNotifAnalista()">Marcar todo como leído</button>
        </h3>
        <ul class="pend-lista">
          <li v-for="it in s.items" :key="it.codTienda" class="pend-row" @click="irA(s, it)">
            <span class="pend-row__lugar"><b>{{ it.tienda }}</b> · {{ it.zona }} · {{ it.marca }}</span>
            <span class="badge" :class="s.clase">{{ it.n }}</span>
            <span class="zona-row__arrow">›</span>
          </li>
        </ul>
      </div>
    </template>
    <div v-else class="empty card">No tienes notificaciones por ahora.</div>
  </section>
</template>

<script setup>
import { useNotificaciones } from '../composables/useNotificaciones';

const { secciones, irA, limpiarNotifAnalista } = useNotificaciones();
</script>
