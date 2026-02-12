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
  
  // Variables para la tabla
  registros: any[] = [];
  paginaRegistros: any[] = [];
  searchTerm: string = '';
  filteredRegistros: any[] = [];
  
  // Variables de paginación
  pageSize: number = 10;
  currentPage: number = 0;
  totalPages: number = 0;
  visiblePages: number[] = [];
  
  // Variables de estado
  totalRegistros: number = 0;
  cargando: boolean = false;
  subiendoRegistros: boolean = false;
  archivoSeleccionado: File | null = null;
  errorResponse: any = null;
  
  // ViewChild para los modales
  @ViewChild('modalConfirmacion') modalConfirmacion!: TemplateRef<any>;
  @ViewChild('modalDuplicados') modalDuplicados!: TemplateRef<any>;
  
  private apiUrl = `http://127.0.0.1:8080/api/empleados-sig/`;

  constructor(
    private http: HttpClient,
    private utils: UtilsService,
    private modalManager: ModalManagerService
  ) {}

  ngOnInit(): void {
    // Inicialización si es necesaria
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.archivoSeleccionado = file;
      this.previsualizarExcel();
    }
  }

  previsualizarExcel() {
    if (!this.archivoSeleccionado) {
      this.utils.MuestrasToast(TipoToast.Warning, 'Por favor selecciona un archivo');
      return;
    }

    this.cargando = true;
    const formData = new FormData();
    formData.append('archivo', this.archivoSeleccionado);

    this.http.post(`${this.apiUrl}previsualizar_excel/`, formData).subscribe(
      (response: any) => {
        this.cargando = false;
        
        if (response.status === 'success') {
          this.registros = response.registros || [];
          this.totalRegistros = response.total_registros || 0;
          this.filteredRegistros = [...this.registros];
          
          this.totalPages = Math.ceil(this.filteredRegistros.length / this.pageSize);
          this.currentPage = 0;
          this.updateVisiblePages();
          this.updatePaginaRegistros();
          
          this.utils.MuestrasToast(TipoToast.Success, response.mensaje || 'Vista previa generada correctamente');
        } else {
          this.utils.MuestrasToast(TipoToast.Error, 'Error al generar vista previa');
        }
      },
      (error) => {
        this.cargando = false;
        this.utils.MuestraErrorInterno(error);
      }
    );
  }

  subirRegistros() {
    if (!this.archivoSeleccionado) {
      this.utils.MuestrasToast(TipoToast.Warning, 'No hay archivo para subir');
      return;
    }

    // Abrir modal de confirmación
    this.modalManager.openModal({
      title: 'Confirmar Carga',
      template: this.modalConfirmacion,
      showFooter: true,
      onAccept: () => {
        this.ejecutarSubidaRegistros();
      }
    });
  }

  ejecutarSubidaRegistros() {
    this.subiendoRegistros = true;
    const formData = new FormData();
    formData.append('archivo', this.archivoSeleccionado!);

    this.http.post(`${this.apiUrl}subir_excel/`, formData).subscribe(
      (response: any) => {
        this.subiendoRegistros = false;
        
        if (response.status === 'success') {
          this.utils.MuestrasToast(TipoToast.Success, response.mensaje || 'Registros subidos correctamente');
          this.limpiarFormulario();
        } else {
          this.utils.MuestrasToast(TipoToast.Error, response.mensaje || 'Error al subir registros');
        }
      },
      (error) => {
        this.subiendoRegistros = false;
        
        // Manejar errores de duplicados del backend
        if (error.error && (error.error.status === 'error' || error.error.lista_duplicados)) {
          this.errorResponse = error.error;
          this.mostrarModalDuplicados();
        } else {
          this.utils.MuestraErrorInterno(error);
        }
      }
    );
  }

  mostrarModalDuplicados() {
    this.modalManager.openModal({
      title: 'Error - Duplicados Encontrados',
      template: this.modalDuplicados,
      showFooter: false,
      width: '600px'
    });
  }

  cerrarModalDuplicados() {
    this.modalManager.closeModal();
  }

  cancelarCarga() {
    this.limpiarFormulario();
    this.utils.MuestrasToast(TipoToast.Info, 'Carga cancelada');
  }

  limpiarFormulario() {
    this.registros = [];
    this.paginaRegistros = [];
    this.filteredRegistros = [];
    this.totalRegistros = 0;
    this.archivoSeleccionado = null;
    this.searchTerm = '';
    this.currentPage = 0;
    this.totalPages = 0;
    this.visiblePages = [];
  }

  // Métodos de paginación
  updatePaginaRegistros() {
    const start = this.currentPage * this.pageSize;
    const end = start + this.pageSize;
    this.paginaRegistros = this.filteredRegistros.slice(start, end);
  }

  prevPage() {
    if (this.currentPage > 0) {
      this.currentPage--;
      this.updatePaginaRegistros();
      this.updateVisiblePages();
    }
  }

  nextPage() {
    if (this.currentPage < this.totalPages - 1) {
      this.currentPage++;
      this.updatePaginaRegistros();
      this.updateVisiblePages();
    }
  }

  goToPage(page: number) {
    this.currentPage = page;
    this.updatePaginaRegistros();
    this.updateVisiblePages();
  }

  updateVisiblePages() {
    const total = this.totalPages;
    const current = this.currentPage;
    const visibleCount = 5;

    let start = Math.max(current - Math.floor(visibleCount / 2), 0);
    let end = start + visibleCount;

    if (end > total) {
      end = total;
      start = Math.max(end - visibleCount, 0);
    }

    this.visiblePages = [];
    for (let i = start; i < end; i++) {
      this.visiblePages.push(i);
    }
  }

  applyFilter() {
    const term = this.searchTerm.toLowerCase();

    this.filteredRegistros = this.registros.filter((registro: any) => {
      const nombreCompleto = `${registro.nombre || ''} ${registro.paterno || ''} ${registro.materno || ''}`.toLowerCase();
      return (
        (registro.num_empleado && registro.num_empleado.toString().toLowerCase().includes(term)) ||
        (registro.rfc && registro.rfc.toLowerCase().includes(term)) ||
        (registro.curp && registro.curp.toLowerCase().includes(term)) ||
        nombreCompleto.includes(term) ||
        (registro.adscripcion && registro.adscripcion.toLowerCase().includes(term)) ||
        (registro.puesto && registro.puesto.toLowerCase().includes(term))
      );
    });

    this.totalPages = Math.ceil(this.filteredRegistros.length / this.pageSize);
    this.currentPage = 0;
    this.updateVisiblePages();
    this.updatePaginaRegistros();
  }

  formatearFecha(fecha: string): string {
    if (!fecha) return 'N/A';
    try {
      const date = new Date(fecha);
      const dia = String(date.getDate()).padStart(2, '0');
      const mes = String(date.getMonth() + 1).padStart(2, '0');
      const anio = date.getFullYear();
      return `${dia}/${mes}/${anio}`;
    } catch {
      return fecha;
    }
  }
}
