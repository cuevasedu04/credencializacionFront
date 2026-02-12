import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../src/environments/environment';

@Injectable({ providedIn: 'root' })
export class EnrolamientoService {
  
  private apiUrl = `http://127.0.0.1:8080/api/expedientes/`;
  private apiCredencializacionUrl = `http://127.0.0.1:8080/api/credencializacion/`;

  constructor(private http: HttpClient) { }

  // --- MÉTODOS DE ENROLAMIENTO ---

  // 1. Obtener lista de PENDIENTES (Sin foto O sin firma)
  getPendientes(): Observable<any[]> {
    // Django DRF agrega el nombre de la acción a la URL: /api/expedientes/pendientes/
    return this.http.get<any[]>(`${this.apiUrl}pendientes/`);
  }

  // 2. Obtener lista completa (Histórico o todos)
  getExpedientes(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl);
  }

  // 3. Buscar (Ojo: Tu endpoint 'pendientes' en el back no tiene activado el filtro de búsqueda ?search=
  // por lo que recomendaremos usar el filtro local de la tabla para buscar dentro de los pendientes)
  buscarExpediente(termino: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}?search=${termino}`);
  }

  // Actualizar un expediente existente (PATCH)
  actualizarExpediente(id: number, datos: any): Observable<any> {
    // La URL final será tipo: http://.../api/expedientes/37/
    return this.http.patch(`${this.apiUrl}${id}/`, datos);
  }


  // Obtener lista de expedientes listos para credencializar
  getListosParaImprimir(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}listos-para_imprimir/`);
  }

  getDataTableImprimir(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}datatableImprimir/`);
  }

  // ... (Resto de tus métodos: crearExpediente, credencialización, etc.) ...
  crearExpediente(datos: any): Observable<any> {
    return this.http.post(this.apiUrl, datos);
  }
  
  guardarEnrolamiento(datos: any): Observable<any> {
    return this.http.post(this.apiCredencializacionUrl, datos);
  }

  // Obtener folio máximo / siguiente folio desde backend
  obtenerFolioMaximo(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}obtener-folio-maximo/`);
  }

  // Marcar registro como impreso después de generar PDF
  marcarComoImpreso(id: number, fechaExpedicion?: string): Observable<any> {
    const payload = fechaExpedicion ? { fecha_expedicion: fechaExpedicion } : {};
    return this.http.post(`${this.apiUrl}${id}/marcar-impreso/`, payload);
  }

  // Búsqueda avanzada con múltiples filtros
  busquedaAvanzada(filtros: any): Observable<any> {
    return this.http.post(`${this.apiUrl}busqueda-avanzada/`, filtros);
  }

  // Estadísticas generales del sistema
  obtenerEstadisticas(fechaDesde?: string, fechaHasta?: string): Observable<any> {
    let params: any = {};
    if (fechaDesde) params.fecha_desde = fechaDesde;
    if (fechaHasta) params.fecha_hasta = fechaHasta;
    return this.http.get(`${this.apiUrl}estadisticas/`, { params });
  }
}