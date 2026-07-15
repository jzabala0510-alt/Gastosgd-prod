// Cifrado ICG (mismo algoritmo que usa el ERP para USUARIOS.NEWPASS).
// La clave es la secuencia "NORMALKEY" repetida. Reversible.
const CONSTANTES = [78, 79, 82, 77, 65, 76, 75, 69, 89, 78, 79, 82, 77, 65, 76, 75, 69, 89, 78, 79, 82, 77, 65, 76, 75, 69, 89, 78, 79, 82, 77, 65, 76, 75, 69, 89, 78];

function encriptar(texto) {
  let resultado = '';
  for (let i = 0; i < texto.length; i++) {
    const c = CONSTANTES[i % CONSTANTES.length];
    resultado += (texto.charCodeAt(i) + c).toString(16).toUpperCase();
  }
  return resultado;
}

function desEncriptar(encriptado) {
  let resultado = '';
  let j = 0;
  for (let i = 0; i < encriptado.length; i += 2) {
    const c = CONSTANTES[j % CONSTANTES.length];
    resultado += String.fromCharCode(parseInt(encriptado.substring(i, i + 2), 16) - c);
    j++;
  }
  return resultado;
}

module.exports = { encriptar, desEncriptar };
