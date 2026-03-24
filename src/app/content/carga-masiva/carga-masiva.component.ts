import { Component, OnInit, ViewChild, TemplateRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { UtilsService } from '../../services/utils.service';
import { TipoToast } from '../../../api/entidades/enumeraciones';
import { ModalManagerService } from '../../components/shared/modal-manager.service';
import { environment } from '../../../environments/environment.prod';

@Component({
  selector: 'app-carga-masiva',
  standalone: false,
  templateUrl: './carga-masiva.component.html',
  styleUrl: './carga-masiva.component.scss'
})
export class CargaMasivaComponent implements OnInit {
  Math = Math;

  // Tabla SIG server-side
  sigRegistros: any[] = [];
  sigTotal: number = 0;
  sigPage: number = 1;
  sigPageSize: number = 5;
  pageSizeOptions: number[] = [5, 10, 25, 50, 100];
  sigTotalPages: number = 0;
  sigVisiblePages: number[] = [];
  sigLoading: boolean = false;
  sigSearchTerm: string = '';
  private searchTimeout: any = null;

  // Upload
  subiendoRegistros: boolean = false;
  archivoSeleccionado: File | null = null;
  errorResponse: any = null;
  resumenCarga: any = null;

  // ViewChild para los modales
  @ViewChild('modalConfirmacion') modalConfirmacion!: TemplateRef<any>;
  @ViewChild('modalDuplicados') modalDuplicados!: TemplateRef<any>;
  @ViewChild('modalResumen') modalResumen!: TemplateRef<any>;

  private apiUrl = `/api-sicre/empleados-sig/`;

  constructor(
    private http: HttpClient,
    private utils: UtilsService,
    private modalManager: ModalManagerService
  ) {}

  ngOnInit(): void {
    this.cargarSig();
  }

  // --- Tabla server-side ---
  cargarSig(page: number = 1) {
    this.sigLoading = true;
    this.sigPage = page;
    const params: any = { page, page_size: this.sigPageSize };
    if (this.sigSearchTerm.trim()) params.search = this.sigSearchTerm.trim();

    this.http.get(this.apiUrl, { params }).subscribe(
      (res: any) => {
        this.sigLoading = false;
        this.sigRegistros = res.results || [];
        this.sigTotal = res.count || 0;
        this.sigTotalPages = Math.ceil(this.sigTotal / this.sigPageSize);
        this.updateSigVisiblePages();
      },
      (error) => {
        this.sigLoading = false;
        this.utils.MuestraErrorInterno(error);
      }
    );
  }

  buscarSig() {
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.cargarSig(1), 400);
  }

  sigPrevPage() { if (this.sigPage > 1) this.cargarSig(this.sigPage - 1); }
  sigNextPage() { if (this.sigPage < this.sigTotalPages) this.cargarSig(this.sigPage + 1); }
  sigGoToPage(page: number) { this.cargarSig(page); }
  changeSigPageSize() { this.sigPageSize = Number(this.sigPageSize); this.cargarSig(1); }

  updateSigVisiblePages() {
    const total = this.sigTotalPages;
    const current = this.sigPage;
    const visibleCount = 5;
    let start = Math.max(current - Math.floor(visibleCount / 2), 1);
    let end = Math.min(start + visibleCount - 1, total);
    start = Math.max(end - visibleCount + 1, 1);
    this.sigVisiblePages = [];
    for (let i = start; i <= end; i++) this.sigVisiblePages.push(i);
  }

  // --- Upload ---
  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) this.archivoSeleccionado = file;
  }

  subirRegistros() {
    if (!this.archivoSeleccionado) {
      this.utils.MuestrasToast(TipoToast.Warning, 'No hay archivo para subir');
      return;
    }
    this.modalManager.openModal({
      title: 'Confirmar Carga',
      template: this.modalConfirmacion,
      showFooter: true,
      onAccept: () => { this.ejecutarSubidaRegistros(); }
    });
  }

  ejecutarSubidaRegistros() {
    this.subiendoRegistros = true;
    const formData = new FormData();
    formData.append('archivo', this.archivoSeleccionado!);

    this.http.post(`${this.apiUrl}subir_excel/`, formData).subscribe(
      (response: any) => {
        this.subiendoRegistros = false;
        this.archivoSeleccionado = null;

        if (response.status === 'success') {
          const r = response.resumen || {};
          const sinCambios = (r.sig_creados === 0 && r.sig_actualizados === 0 &&
                              r.enrolamiento_creados === 0 && r.enrolamiento_actualizados === 0);
          if (sinCambios) {
            this.utils.MuestrasToast(TipoToast.Warning, response.mensaje || 'No se encontraron cambios');
          } else {
            this.resumenCarga = r;
            this.cargarSig(1);
            setTimeout(() => {
              this.modalManager.openModal({
                title: 'Resumen de carga SIG',
                template: this.modalResumen,
                showFooter: true,
                width: '580px'
              });
            }, 100);
          }
        } else {
          this.utils.MuestrasToast(TipoToast.Error, response.mensaje || 'Error al subir registros');
        }
      },
      (error) => {
        this.subiendoRegistros = false;
        if (error.error && (error.error.status === 'error' || error.error.curps_duplicadas || error.error.numeros_empleado_duplicados)) {
          this.errorResponse = error.error;
          this.mostrarModalDuplicados();
        } else {
          this.utils.MuestraErrorInterno(error);
        }
      }
    );
  }

  cancelarCarga() {
    this.archivoSeleccionado = null;
    this.utils.MuestrasToast(TipoToast.Info, 'Carga cancelada');
  }

  cerrarModalResumen() { this.modalManager.closeModal(); }

  mostrarModalDuplicados() {
    this.modalManager.openModal({
      title: 'Error - Duplicados Encontrados',
      template: this.modalDuplicados,
      showFooter: false,
      width: '600px'
    });
  }

  cerrarModalDuplicados() { this.modalManager.closeModal(); }

  formatearFecha(fecha: string): string {
    if (!fecha) return 'N/A';
    try {
      const date = new Date(fecha);
      const dia = String(date.getDate()).padStart(2, '0');
      const mes = String(date.getMonth() + 1).padStart(2, '0');
      const anio = date.getFullYear();
      return `${dia}/${mes}/${anio}`;
    } catch { return fecha; }
  }
}
