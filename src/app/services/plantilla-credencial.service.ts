import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface PlantillaCredencial {
  id_plantilla?: number;
  clave: string;
  nombre: string;
  descripcion?: string | null;
  fondo_frente?: string | null;
  fondo_reverso?: string | null;
  fondo_frente_url?: string | null;
  fondo_reverso_url?: string | null;
  canvas_frente?: any;
  canvas_reverso?: any;
  ancho_px?: number;
  alto_px?: number;
  ancho_mm?: number | string;
  alto_mm?: number | string;
  activo?: boolean;
  por_defecto?: boolean;
  fecha_registro?: string;
  fecha_modificacion?: string;
}

export interface FondoDisponible {
  nombre: string;
  ruta: string;
  url: string;
}

/** Fila del roster SIG (sicre_tbl_sig), tal cual llega del endpoint `todos`. */
export interface EmpleadoSig {
  id: number | null;
  empleado_anam: string | null;
  no_empleado: string | null;
  curp: string | null;
  nombres: string | null;
  primer_apellido: string | null;
  segundo_apellido: string | null;
  area: string | null;
  cargo: string | null;
  fecha_expedicion: string | null;
  firma_drh: string | null;
  cargo_drh: string | null;
  qr: string | null;
  estatus: string | null;
  estado_hum: string | null;
  estado_nom: string | null;
  /** Se reescribe en CADA sync para TODOS los registros -- no sirve para detectar altas nuevas. */
  fecha_actualizacion: string | null;
  /**
   * Se escribe UNA sola vez, la primera vez que se ve a este empleado; en
   * syncs posteriores se conserva tal cual (ver Control_De_Plazas_Backend,
   * _obtener_fechas_primera_deteccion). Esta es la que sí distingue altas
   * reales de un refresco rutinario del roster.
   */
  fecha_primera_deteccion: string | null;
  [key: string]: any;
}

@Injectable({ providedIn: 'root' })
export class PlantillaCredencialService {

  private readonly apiPlantillas = '/api-sicre/plantillas-credencial/';
  private readonly apiEnrolamiento = '/api-sicre/enrolamiento-credencial/';

  constructor(private http: HttpClient) { }

  // ---- Plantillas ------------------------------------------------------

  listar(soloActivas = false): Observable<any> {
    const query = soloActivas ? '?activo=1' : '';
    return this.http.get<any>(`${this.apiPlantillas}${query}`);
  }

  obtener(id: number): Observable<PlantillaCredencial> {
    return this.http.get<PlantillaCredencial>(`${this.apiPlantillas}${id}/`);
  }

  crear(datos: PlantillaCredencial): Observable<PlantillaCredencial> {
    return this.http.post<PlantillaCredencial>(this.apiPlantillas, datos);
  }

  actualizar(id: number, datos: Partial<PlantillaCredencial>): Observable<PlantillaCredencial> {
    return this.http.patch<PlantillaCredencial>(`${this.apiPlantillas}${id}/`, datos);
  }

  eliminar(id: number): Observable<any> {
    return this.http.delete(`${this.apiPlantillas}${id}/`);
  }

  duplicar(id: number, clave?: string, nombre?: string): Observable<any> {
    return this.http.post(`${this.apiPlantillas}${id}/duplicar/`, { clave, nombre });
  }

  /** Plantilla que se usa por omision al abrir "Imprimir credenciales". */
  obtenerPorDefecto(): Observable<{ status: string; origen: string; plantilla: PlantillaCredencial }> {
    return this.http.get<{ status: string; origen: string; plantilla: PlantillaCredencial }>(
      `${this.apiPlantillas}por-defecto/`
    );
  }

  /** Marca una plantilla como la de uso por omision (desmarca las demas). */
  marcarPorDefecto(id: number): Observable<any> {
    return this.http.post(`${this.apiPlantillas}${id}/marcar-por-defecto/`, {});
  }

  // ---- Roster SIG (sicre_tbl_sig) --------------------------------------

  /**
   * Dataset completo del roster, sin paginar, para filtrado client-side.
   * ~16k registros (~1 MB comprimido). Se carga una sola vez al abrir la
   * pantalla; a partir de ahi todo el filtrado es inmediato en memoria.
   */
  empleadosSigTodos(): Observable<{ status: string; total: number; registros: EmpleadoSig[] }> {
    return this.http.get<{ status: string; total: number; registros: EmpleadoSig[] }>(
      '/api-sicre/empleados-sig/todos/'
    );
  }

  // ---- Fondos ----------------------------------------------------------

  fondosDisponibles(): Observable<{ status: string; fondos: FondoDisponible[] }> {
    return this.http.get<{ status: string; fondos: FondoDisponible[] }>(
      `${this.apiPlantillas}fondos-disponibles/`
    );
  }

  subirFondo(imagenBase64: string, nombre: string): Observable<any> {
    return this.http.post(`${this.apiPlantillas}subir-fondo/`, { imagen: imagenBase64, nombre });
  }

  // ---- Enrolamiento (datos para poblar la credencial) -------------------

  buscarEmpleado(numEmpleado: string): Observable<any> {
    return this.http.get(`${this.apiEnrolamiento}buscar-empleado/?num_empleado=${encodeURIComponent(numEmpleado)}`);
  }

  /**
   * Resuelve foto/firma en MEDIA_ROOT. Si se manda `curp`, el backend
   * reintenta con el prefijo de 10 caracteres comun a RFC y CURP cuando no
   * hay nada guardado por num_empleado -- asi se cruzan las capturas de
   * "Enrolamiento previo", nombradas por RFC porque se hicieron antes de que
   * la persona tuviera numero asignado. La respuesta incluye
   * `requiere_migracion` para saber si al imprimir hay que renombrarlas.
   */
  medios(numEmpleado: string, curp?: string): Observable<any> {
    const params = new URLSearchParams();
    if (numEmpleado) params.set('num_empleado', numEmpleado);
    if (curp) params.set('curp', curp);
    return this.http.get(`${this.apiEnrolamiento}medios/?${params.toString()}`);
  }

  listarEnrolamientos(params: { search?: string; page?: number; page_size?: number } = {}): Observable<any> {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.page) query.set('page', String(params.page));
    if (params.page_size) query.set('page_size', String(params.page_size));
    const qs = query.toString();
    return this.http.get(`${this.apiEnrolamiento}${qs ? '?' + qs : ''}`);
  }

  guardarMedios(id: number, foto?: string, firma?: string): Observable<any> {
    return this.http.post(`${this.apiEnrolamiento}${id}/guardar-medios/`, { foto, firma });
  }

  /**
   * Igual que guardarMedios(), pero sin requerir un EnrolamientoCredencial
   * existente -- guarda directo en MEDIA_ROOT por num_empleado. Util para
   * capturar foto/firma de un empleado del roster SIG que aun no tiene
   * expediente de credencial.
   */
  guardarMediosPorEmpleado(numEmpleado: string, foto?: string, firma?: string): Observable<any> {
    return this.http.post(`${this.apiEnrolamiento}guardar-medios-empleado/`, {
      num_empleado: numEmpleado, foto, firma,
    });
  }

  /**
   * Guarda foto/firma nombradas por RFC -- para "Enrolamiento previo", donde
   * se captura a personal cuyo movimiento de ingreso todavia no se aplica y
   * por tanto aun no tiene num_empleado asignado.
   */
  guardarMediosPorRfc(rfc: string, foto?: string, firma?: string): Observable<any> {
    return this.http.post(`${this.apiEnrolamiento}guardar-medios-empleado/`, {
      rfc, foto, firma,
    });
  }

  /**
   * Renombra los archivos guardados por RFC para que pasen a llamarse por
   * num_empleado, una vez confirmado el cruce. Se dispara al imprimir.
   */
  migrarMedios(numEmpleado: string, curp: string): Observable<any> {
    return this.http.post(`${this.apiEnrolamiento}migrar-medios/`, {
      num_empleado: numEmpleado, curp,
    });
  }

  /**
   * Capturas nombradas por RFC/CURP que todavia no se cruzan con un
   * num_empleado. Se reconstruye leyendo MEDIA_ROOT: no hay tabla en BD que
   * las registre.
   */
  enrolamientosPrevios(): Observable<{ status: string; registros: any[]; total: number; cruzables: number }> {
    return this.http.get<{ status: string; registros: any[]; total: number; cruzables: number }>(
      `${this.apiEnrolamiento}enrolamientos-previos/`
    );
  }

  /**
   * Renombra en bloque las capturas que ya cruzan con el roster. Si se manda
   * `rfcs`, solo esas; si no, todas las cruzables. El num_empleado destino lo
   * recalcula el backend -- nunca se manda desde aqui.
   */
  migrarMediosLote(rfcs?: string[]): Observable<{ status: string; total_migrados: number; resultados: any[] }> {
    return this.http.post<{ status: string; total_migrados: number; resultados: any[] }>(
      `${this.apiEnrolamiento}migrar-medios-lote/`, rfcs ? { rfcs } : {}
    );
  }

  /** Elimina foto y firma guardadas por RFC (p.ej. un RFC mal capturado). */
  borrarMediosPrevio(rfc: string): Observable<any> {
    return this.http.post(`${this.apiEnrolamiento}borrar-medios-previo/`, { rfc });
  }

  /**
   * Resuelve foto/firma de varios RFC de golpe. Barato: solo toca disco, sin
   * cruzar contra el roster. Sirve para reconstruir la sesion de
   * "Enrolamiento previo" tras recargar la pagina.
   */
  mediosLote(rfcs: string[]): Observable<{ status: string; registros: any[] }> {
    return this.http.post<{ status: string; registros: any[] }>(
      `${this.apiEnrolamiento}medios-lote/`, { rfcs }
    );
  }

  // ---- Consecutivo de folio -------------------------------------------
  // Vive en el servidor, no en el navegador: el folio debe ser unico entre
  // todas las estaciones de impresion.

  /** Proximo folio a emitir, sin consumirlo. */
  folioActual(): Observable<{ status: string; folio: string; valor: number; longitud: number }> {
    return this.http.get<{ status: string; folio: string; valor: number; longitud: number }>(
      `${this.apiEnrolamiento}folio-actual/`
    );
  }

  /** Fija manualmente el proximo folio. */
  folioEstablecer(folio: string): Observable<{ status: string; folio: string }> {
    return this.http.post<{ status: string; folio: string }>(
      `${this.apiEnrolamiento}folio-establecer/`, { folio }
    );
  }

  /** Entrega el folio actual y avanza el contador de forma atomica. */
  folioConsumir(): Observable<{ status: string; folio_emitido: string; folio_siguiente: string }> {
    return this.http.post<{ status: string; folio_emitido: string; folio_siguiente: string }>(
      `${this.apiEnrolamiento}folio-consumir/`, {}
    );
  }

  marcarImpreso(id: number, fechaExpedicion?: string): Observable<any> {
    return this.http.post(`${this.apiEnrolamiento}${id}/marcar-impreso/`, {
      fecha_expedicion: fechaExpedicion,
    });
  }
}
