<template>
  <div class="app">
    <template v-if="auth.isAuth">
      <header class="topbar">
        <router-link to="/" class="brand"><img class="brand__logo" src="/redesip-logo-blanco.png" alt="RedesIP" /></router-link>
        <nav class="topbar__nav">
          <router-link to="/" :class="{ active: $route.name === 'home' }">Inicio</router-link>
          <router-link to="/gastos" :class="{ active: $route.path.startsWith('/gastos') || $route.path.startsWith('/factura') }">Gastos<span v-if="notif.devueltas + notif.rechazadas" class="nav-badge nav-badge--red">{{ notif.devueltas + notif.rechazadas }}</span><span v-if="notif.analista" class="nav-badge nav-badge--green">{{ notif.analista }}</span></router-link>
          <router-link v-if="auth.esTesoreria" to="/tesoreria" :class="{ active: $route.path === '/tesoreria' }">Tesorería<span v-if="notif.tesoreria" class="nav-badge">{{ notif.tesoreria }}</span></router-link>
          <router-link v-if="auth.esAuditor" to="/auditoria" :class="{ active: $route.path === '/auditoria' }">Auditoría<span v-if="notif.auditoria + notif.pagosRevision" class="nav-badge">{{ notif.auditoria + notif.pagosRevision }}</span></router-link>
          <router-link v-if="auth.esPagador" to="/pagos" :class="{ active: $route.path === '/pagos' }">Pagos<span v-if="notif.pago" class="nav-badge">{{ notif.pago }}</span></router-link>
          <router-link v-if="auth.esPagador" to="/pagadas" :class="{ active: $route.path === '/pagadas' }">Pagadas</router-link>
          <router-link v-if="auth.esSaldos" to="/fondos" :class="{ active: $route.path === '/fondos' }">Saldos</router-link>
          <router-link v-if="auth.esSaldos" to="/fondos/importar" :class="{ active: $route.path === '/fondos/importar' }">Importar</router-link>
          <router-link v-if="auth.esReportes" to="/reportes" :class="{ active: $route.path === '/reportes' }">Reportes</router-link>
          <router-link v-if="auth.esAdmin" to="/admin/usuarios" :class="{ active: $route.path === '/admin/usuarios' }">Usuarios</router-link>
          <router-link v-if="auth.esAdmin" to="/admin/bancos" :class="{ active: $route.path === '/admin/bancos' }">Bancos</router-link>
          <router-link v-if="auth.esAdmin" to="/admin/alias-tiendas" :class="{ active: $route.path === '/admin/alias-tiendas' }">Alias de tiendas</router-link>
        </nav>
        <div class="topbar__user">
          <CampanaNotificaciones />
          <div class="topbar__userinfo">
            <span class="topbar__name">{{ auth.nombre }}</span>
            <span class="topbar__rol">{{ auth.rolLabel }}</span>
          </div>
          <button class="topbar__logout" @click="logout">Salir</button>
        </div>
      </header>
      <main class="content"><router-view /></main>
    </template>
    <router-view v-else />
    <ModalConfirm />
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from './stores/auth';
import { useNotifStore } from './stores/notificaciones';
import CampanaNotificaciones from './components/CampanaNotificaciones.vue';
import ModalConfirm from './components/ModalConfirm.vue';

const auth = useAuthStore();
const notif = useNotifStore();
const router = useRouter();
const route = useRoute();

function refrescar() { if (auth.isAuth) notif.refrescar(); }

let timer = null;
onMounted(() => {
  refrescar();
  timer = setInterval(refrescar, 120000); // refresco cada 2 min (menos carga con muchos usuarios)
});
onUnmounted(() => { if (timer) clearInterval(timer); });
watch(() => route.path, refrescar);                    // al navegar
watch(() => auth.isAuth, (v) => { if (v) refrescar(); else notif.reset(); }); // al entrar/salir

function logout() {
  auth.logout();
  router.push('/login');
}
</script>
