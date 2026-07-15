import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import './style.css';

const pinia = createPinia();

// Persistencia de las "vistas" (zona/marca/tienda/filtros/selección) en localStorage.
pinia.use(({ store }) => {
  if (!store.$id.startsWith('vista-')) return;
  const key = `gd_${store.$id}`;
  const saved = localStorage.getItem(key);
  if (saved) { try { store.$patch(JSON.parse(saved)); } catch { /* ignore */ } }
  store.$subscribe((_m, state) => { localStorage.setItem(key, JSON.stringify(state)); });
});

createApp(App).use(pinia).use(router).mount('#app');
