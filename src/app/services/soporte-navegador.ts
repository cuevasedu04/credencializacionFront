/**
 * Deteccion de soporte del navegador para captura de foto y firma.
 *
 * Tanto la camara (getUserMedia) como la tableta Wacom (WebHID) son APIs
 * restringidas a "contexto seguro": el navegador las expone SOLO en HTTPS o
 * en localhost. Servido por HTTP plano en una IP o dominio, Chrome y Edge
 * directamente no definen `navigator.mediaDevices` ni `navigator.hid` -- no
 * lanzan error, simplemente no existen.
 *
 * Sin distinguir ese caso, el sintoma es identico al de un navegador que no
 * soporta la funcion, y se pierde tiempo buscando el problema en el cable, el
 * driver o el equipo cuando en realidad falta el certificado del servidor.
 */

export function esContextoSeguro(): boolean {
  // isSecureContext cubre https:// y localhost/127.0.0.1 en todos los
  // navegadores modernos. El respaldo es por si faltara la propiedad.
  if (typeof window === 'undefined') return false;
  if (typeof window.isSecureContext === 'boolean') return window.isSecureContext;
  return location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
}

export function soportaCamara(): boolean {
  return !!navigator.mediaDevices?.getUserMedia;
}

export function soportaWacom(): boolean {
  return !!(navigator as any).hid;
}

/** True si el navegador es de la familia Chromium (unica con WebHID). */
export function esChromium(): boolean {
  const ua = navigator.userAgent;
  return /Chrome|Chromium|Edg\//.test(ua) && !/Firefox/.test(ua);
}

/**
 * Explica por que no esta disponible la tableta, o null si si lo esta.
 * El orden importa: primero se descarta el contexto inseguro, porque en ese
 * caso ni siquiera Chrome expone la API y el mensaje "usa Chrome" seria
 * enganoso.
 */
export function motivoSinWacom(): string | null {
  if (soportaWacom()) return null;

  if (!esContextoSeguro()) {
    return 'La tableta Wacom necesita que el sistema se abra por HTTPS (o en localhost). '
      + 'Con HTTP el navegador bloquea el acceso al dispositivo USB.';
  }
  if (!esChromium()) {
    return 'Para firmar con la tableta Wacom abre el sistema en Chrome o Edge: '
      + 'la conexión USB usa WebHID, que Firefox no implementa.';
  }
  return 'Este navegador no permite acceder a la tableta Wacom por USB (WebHID no disponible).';
}

/** Explica por que no hay camara, o null si si la hay. */
export function motivoSinCamara(): string | null {
  if (soportaCamara()) return null;

  if (!esContextoSeguro()) {
    return 'La cámara necesita que el sistema se abra por HTTPS (o en localhost). '
      + 'Con HTTP el navegador bloquea el acceso a la cámara. Puedes subir la foto desde archivo.';
  }
  return 'Este navegador no permite acceder a la cámara. Puedes subir la foto desde archivo.';
}
