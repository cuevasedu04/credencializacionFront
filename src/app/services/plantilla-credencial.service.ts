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
  fecha_actualizacion: string | null;
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

  medios(numEmpleado: string): Observable<any> {
    return this.http.get(`${this.apiEnrolamiento}medios/?num_empleado=${encodeURIComponent(numEmpleado)}`);
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

  marcarImpreso(id: number, fechaExpedicion?: string): Observable<any> {
    return this.http.post(`${this.apiEnrolamiento}${id}/marcar-impreso/`, {
      fecha_expedicion: fechaExpedicion,
    });
  }
}
