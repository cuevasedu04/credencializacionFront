import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../src/environments/environment';

export interface CargaMasivaRegistro {
    id?: number;
    rfc: string;
    nombre?: string;
    foto?: string;
    firma?: string;
    lote: string;
    fecha_enrolamiento?: string;
    usuario_enrola?: number;
    activo?: boolean;
}

export interface ProgresoLote {
    lote: string;
    total_enrolados: number;
    total_fotografias: number;
    total_firmas: number;
    registros: CargaMasivaRegistro[];
}

@Injectable({
  providedIn: 'root'
})
export class CargaMasivaService {
  private apiUrl = 'http://127.0.0.1:8080/api/carga-masiva/';

  constructor(private http: HttpClient) { }

  /**
   * Guarda o actualiza un empleado a la vez (por lote y rfc).
   */
  autoGuardar(empleado: CargaMasivaRegistro): Observable<CargaMasivaRegistro> {
    return this.http.post<CargaMasivaRegistro>(this.apiUrl + 'auto-guardado/', empleado);
  }

  /**
   * Obtiene el siguiente número de lote (ej. LOTE-00001).
   */
  obtenerSiguienteLote(): Observable<{lote: string}> {
    return this.http.get<{lote: string}>(this.apiUrl + 'siguiente-lote/');
  }

  /**
   * Consulta el progreso de un lote activo.
   */
  obtenerProgresoLote(lote: string): Observable<ProgresoLote> {
    let params = new HttpParams().set('lote', lote);
    return this.http.get<ProgresoLote>(this.apiUrl + 'progreso-lote/', { params });
  }

  /**
   * Realiza un soft-delete de todos los registros de un lote.
   */
  cancelarLote(lote: string): Observable<any> {
    return this.http.post<any>(this.apiUrl + 'cancelar-lote/', { lote });
  }
}
