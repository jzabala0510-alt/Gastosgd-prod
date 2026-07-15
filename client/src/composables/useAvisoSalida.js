import { onMounted, onBeforeUnmount } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { useConfirm } from './useConfirm';

// Advierte si el usuario intenta salir con cambios sin guardar: navegar a otro
// módulo dentro de la SPA (router) o cerrar/recargar la pestaña (beforeunload).
// `sucio` es un ref/computed booleano reactivo — true mientras haya cambios sin guardar.
export function useAvisoSalida(sucio) {
  const { confirm } = useConfirm();

  function onBeforeUnload(e) {
    if (!sucio.value) return;
    e.preventDefault();
    e.returnValue = '';
  }

  onMounted(() => window.addEventListener('beforeunload', onBeforeUnload));
  onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload));

  onBeforeRouteLeave(async () => {
    if (!sucio.value) return true;
    const { ok } = await confirm({
      titulo: 'Cambios sin guardar',
      mensaje: 'Hay saldos ingresados que no se han guardado. Si sales ahora, se van a perder. ¿Salir de todas formas?',
      tipo: 'danger',
      labelConfirmar: 'Salir sin guardar',
      labelCancelar: 'Seguir editando',
    });
    return ok;
  });
}
