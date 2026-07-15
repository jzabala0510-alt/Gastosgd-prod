import { reactive } from 'vue';

// Estado singleton: lo comparten todas las vistas que llaman confirm() y el
// único <ModalConfirm /> montado en App.vue.
const state = reactive({
  visible: false,
  titulo: '',
  mensaje: '',
  tipo: 'warn',                 // warn | danger | info
  pedirComentario: false,
  comentarioRequerido: false,
  placeholder: 'Comentario (opcional)',
  labelConfirmar: 'Confirmar',
  labelCancelar: 'Cancelar',
  comentario: '',
});

let resolver = null;

// Devuelve { ok: false } si cancela, o { ok: true, comentario } si confirma.
function confirm(opts) {
  Object.assign(state, {
    titulo: 'Confirmar acción',
    mensaje: '',
    tipo: 'warn',
    pedirComentario: false,
    comentarioRequerido: false,
    placeholder: 'Comentario (opcional)',
    labelConfirmar: 'Confirmar',
    labelCancelar: 'Cancelar',
    comentario: '',
    ...opts,
    visible: true,
  });
  return new Promise((resolve) => { resolver = resolve; });
}

function responder(ok) {
  state.visible = false;
  const out = ok ? { ok: true, comentario: state.comentario } : { ok: false, comentario: '' };
  if (resolver) { resolver(out); resolver = null; }
}

export function useConfirm() {
  return { confirmState: state, confirm, responder };
}
