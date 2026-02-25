import { Component, OnInit, OnDestroy, ViewChild, TemplateRef, ElementRef } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ColDef, GridApi, GridReadyEvent, ValueFormatterParams } from 'ag-grid-community';
import { UtilsService } from '../../services/utils.service';
import { TipoToast } from '../../../api/entidades/enumeraciones';
import { FechaMexicoPipe } from '../../../app/pipes/date-mx-format'; 
import { EnrolamientoService } from '../../services/enrolamiento.service';
import { ModalManagerService } from '../../components/shared/modal-manager.service';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { PlantillaEnrolamientoComponent } from '../enrolamiento/plantilla-enrolamiento/plantilla-enrolamiento.component';
import { PlantillaAnamComponent } from '../plantilla-anam/plantilla-anam.component';
import { ProvisionalComponent } from '../provisional/provisional.component';
import { FamiliarComponent } from '../familiar/familiar.component';

@Component({
  selector: 'app-busqueda-avanzada',
  standalone: false,
  templateUrl: './busqueda-avanzada.component.html',
  styleUrl: './busqueda-avanzada.component.scss',
  providers: [FechaMexicoPipe] 
})
export class BusquedaAvanzadaComponent implements OnInit, OnDestroy {
  // Configuración de AG-Grid
  private gridApi!: GridApi;
  
  // Datos
  rowData: any[] = [];
  columnDefs: ColDef[] = []; 
  
  // Filtros
  startDate: string = '';
  endDate: string = '';
  
  // Variables para modal y visualización
  @ViewChild('modalVisualizar') modalVisualizar!: TemplateRef<any>;
  empleadoSeleccionado: any = null;
  esEditable: boolean = false;
  
  // Variables para impresión
  empleadoImprimir: any = null;
  @ViewChild('plantillaModalAnam') plantillaModalAnam!: PlantillaAnamComponent;
  @ViewChild('plantillaModalNuevoLaredo') plantillaModalNuevoLaredo!: ProvisionalComponent;
  @ViewChild('plantillaModalFamiliar') plantillaModalFamiliar!: FamiliarComponent;
  @ViewChild('plantillaImprimirAnam') plantillaImprimirAnam!: PlantillaAnamComponent;
  @ViewChild('plantillaImprimirNuevoLaredo') plantillaImprimirNuevoLaredo!: ProvisionalComponent;
  @ViewChild('plantillaImprimirFamiliar') plantillaImprimirFamiliar!: FamiliarComponent;
  @ViewChild('printContainer') printContainer!: ElementRef;
  
  // Paginación y Estado
  currentPage: number = 1;
  paginationPageSize: number = 50;
  totalRecords: number = 0;
  isLoading: boolean = false;
  isRefreshing: boolean = false;
  
  showColumnPanel: boolean = false;
  
  // Configuración por defecto
  defaultColDef: ColDef = {
    sortable: true,
    filter: true,
    resizable: true,
    floatingFilter: true,
    minWidth: 100,
    suppressHeaderMenuButton: false,
    headerClass: 'text-center',
    cellStyle: { display: 'flex', alignItems: 'center' } 
  };
  
  paginationPageSizeSelector = [10, 25, 50, 100, 200];

  constructor(
    private enrolamientoService: EnrolamientoService,
    private fechaMexicoPipe: FechaMexicoPipe,
    private utils: UtilsService,
    private sanitizer: DomSanitizer,
    private modalManager: ModalManagerService
  ) {}

  ngOnInit(): void {
    this.initColumnDefs(); 
    this.loadInitialData();
  }

  ngOnDestroy(): void {}

  // formateador para celdas vacías
  emptyCellFormatter(params: ValueFormatterParams): string {
    if (params.value === null || params.value === undefined || params.value === '') {
      return '---'; 
    }
    return params.value;
  }
    getEmptyCellStyle(params: any) {
    if (params.value === null || params.value === undefined || params.value === '') {
      return { color: '#adb5bd', fontStyle: 'italic', fontSize: '0.85rem' }; 
    }
    return null; 
  }

  initColumnDefs(): void {
    const textCol = (props: ColDef): ColDef => ({
      ...props,
      valueFormatter: (p) => this.emptyCellFormatter(p),
      cellStyle: (p) => {
        const emptyStyle = this.getEmptyCellStyle(p);
        return emptyStyle ? { ...emptyStyle, display: 'flex', alignItems: 'center' } : { display: 'flex', alignItems: 'center' };
      }
    });

    this.columnDefs = [
      { headerName: 'Num. Empleado', field: 'num_empleado', width: 140, hide: false, lockVisible: true, pinned: 'left', tooltipField: 'num_empleado' },
      textCol({ headerName: 'RFC', field: 'rfc', width: 140, hide: false, lockVisible: true }),
      textCol({ headerName: 'CURP', field: 'curp', width: 180, hide: false, lockVisible: true }),
      textCol({ headerName: 'Nombre', field: 'nombre', width: 150, hide: false, lockVisible: true }),
      textCol({ headerName: 'Apellido Paterno', field: 'paterno', width: 150, hide: false, lockVisible: true }),
      textCol({ headerName: 'Apellido Materno', field: 'materno', width: 150, hide: false, lockVisible: true }),
      textCol({ headerName: 'Puesto', field: 'puesto', width: 200, hide: false }),
      textCol({ headerName: 'Adscripción', field: 'adscripcion', width: 220, hide: false }),
      textCol({ headerName: 'Folio', field: 'folio', width: 120, hide: false }),
      { 
        headerName: 'Impreso', 
        field: 'impreso', 
        width: 110, 
        hide: false,
        cellStyle: params => {
          const baseStyle = { display: 'flex', alignItems: 'center', fontWeight: 'bold', justifyContent: 'center' };
          if (params.value === 1) return { ...baseStyle, color: '#1c5f3fff' }; 
          return { ...baseStyle, color: '#6d2626ff' };
        },
        valueFormatter: (params) => params.value === 1 ? 'Sí' : 'No'
      },
      { 
        headerName: 'Fecha Expedición', 
        field: 'fecha_expedicion', 
        width: 160, 
        hide: false,
        valueFormatter: (params) => this.dateFormatter(params, false),
        filterValueGetter: (params: any) => this.dateFormatter({ value: params.data.fecha_expedicion } as any, false)
      },
      { 
        headerName: 'Inicio Vigencia', 
        field: 'inicio_vig', 
        width: 160, 
        hide: true,
        valueFormatter: (params) => this.dateFormatter(params, false),
        filterValueGetter: (params: any) => this.dateFormatter({ value: params.data.inicio_vig } as any, false)
      },
      { 
        headerName: 'Fin Vigencia', 
        field: 'fin_vig', 
        width: 160, 
        hide: true,
        valueFormatter: (params) => this.dateFormatter(params, false),
        filterValueGetter: (params: any) => this.dateFormatter({ value: params.data.fin_vig } as any, false)
      },
      { 
        headerName: 'Fecha Registro', 
        field: 'fecha_registro', 
        width: 180, 
        hide: true,
        valueFormatter: (params) => this.dateFormatter(params, true),
        filterValueGetter: (params: any) => this.dateFormatter({ value: params.data.fecha_registro } as any, true)
      },
      textCol({ headerName: 'Eladia', field: 'eladia', width: 120, hide: true }),
      { 
        headerName: 'Tiene Foto', 
        field: 'foto', 
        width: 120, 
        hide: true,
        cellRenderer: (params: any) => {
          if (params.value) {
            return '<i class="fas fa-check text-success"></i>';
          }
          return '<i class="fas fa-times text-danger"></i>';
        }
      },
      { 
        headerName: 'Tiene Firma', 
        field: 'firma', 
        width: 120, 
        hide: true,
        cellRenderer: (params: any) => {
          if (params.value) {
            return '<i class="fas fa-check text-success"></i>';
          }
          return '<i class="fas fa-times text-danger"></i>';
        }
      },
      { 
        headerName: 'Acciones', 
        field: 'actions', 
        pinned: 'right', 
        width: 100,
        minWidth: 100,
        maxWidth: 100,
        hide: false,
        lockVisible: true,
        sortable: false, 
        filter: false,
        cellRenderer: (params: any) => this.actionsRenderer(params)
      }
    ];
  }

  dateFormatter(params: ValueFormatterParams, mostrarHora: boolean): string {
    if (!params.value) return '---'; 
    return this.fechaMexicoPipe.transform(params.value, mostrarHora, false);
  }

  toggleColumnPanel(): void {
    this.showColumnPanel = !this.showColumnPanel;
  }

  closeColumnPanel(): void {
    this.showColumnPanel = false;
  }

  toggleColumn(field: string): void {
    if (this.gridApi) {
      const colState = this.gridApi.getColumnState();
      const col = colState.find(c => c.colId === field);
      if (col) {
        this.gridApi.setColumnsVisible([field], !col.hide ? false : true);
      }
    }
  }

  isColumnVisible(field: string): boolean {
    if (!this.columnDefs || this.columnDefs.length === 0) return false;
    if (!this.gridApi) {
      const col = this.columnDefs.find(c => c.field === field);
      return col ? !col.hide : false;
    }

    try {
      const colState = this.gridApi.getColumnState();
      if (!colState) { 
          const col = this.columnDefs.find(c => c.field === field);
          return col ? !col.hide : false;
      }
      const col = colState.find(c => c.colId === field);
      return col ? !col.hide : false;
    } catch (error) {
      return true; 
    }
  }

  actionsRenderer(params: any) {
    return `
      <div class="d-flex gap-2 justify-content-center align-items-center w-100 h-100">
        <span class="tooltip-wrapper" data-tooltip="Visualizar Credencial">
          <i class="tool-icon fas fa-eye" data-action="view" data-id="${params.data.id_enrolamiento}" title="Visualizar" style="cursor: pointer;"></i>
        </span>
        <span class="tooltip-wrapper" data-tooltip="Imprimir">
          <i class="tool-icon fas fa-print" data-action="print" data-id="${params.data.id_enrolamiento}" title="Imprimir" style="cursor: pointer;"></i>
        </span>
      </div>`;
  }

  onGridReady(params: GridReadyEvent) {
    this.gridApi = params.api;
  }
  
  loadInitialData(): void { 
    this.buscarCredenciales(); 
  }
  
  applyFilter(): void { 
    if (this.startDate && this.endDate) {
      if (new Date(this.startDate) > new Date(this.endDate)) {
        this.utils.MuestrasToast(TipoToast.Warning, 'La fecha de inicio debe ser menor a la fecha fin');
        return;
      }
    }
    this.currentPage = 1; 
    this.buscarCredenciales(); 
  }
  
  clearFilter(): void {
    this.startDate = ''; 
    this.endDate = ''; 
    this.currentPage = 1; 
    this.buscarCredenciales();
  }
  
  buscarCredenciales(): void {
    this.isLoading = true;
    const filtros: any = {};
    
    if (this.startDate) filtros.fecha_registro_desde = this.startDate;
    if (this.endDate) filtros.fecha_registro_hasta = this.endDate;

    this.enrolamientoService.busquedaAvanzada(filtros).subscribe({
      next: (response: any) => {
        this.rowData = response || [];
        this.totalRecords = this.rowData.length;
        this.isLoading = false;
      },
      error: (error: any) => {
        this.utils.MuestraErrorInterno(error);
        this.rowData = [];
        this.isLoading = false;
      }
    });
  }

  refreshGrid(): void {
    if (this.gridApi) {
      this.isRefreshing = true;
      this.gridApi.resetColumnState();
      this.gridApi.setFilterModel(null);
      this.gridApi.onFilterChanged();
      this.loadInitialData();    
      setTimeout(() => {
        this.isRefreshing = false;
      }, 1000);
    }
  }

  generarExcel(): void {
    this.utils.MuestrasToast(TipoToast.Info, 'Generando archivo excel.');
    if (this.gridApi) {
      const date = new Date();
      const dateStr = `${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getFullYear()}`;
      
      // Obtener solo las columnas visibles actualmente
      const visibleColumns = this.gridApi.getAllDisplayedColumns();
      
      // Filtrar la columna de acciones
      const columnKeys = visibleColumns
        ?.filter((col: any) => col.getColId() !== 'actions')
        .map((col: any) => col.getColId());

      this.gridApi.exportDataAsCsv({
        fileName: `reporte_credenciales_${dateStr}.csv`,
        columnKeys: columnKeys
      });
    }
  }

  onCellClicked(event: any): void {
    const target = event.event.target;
    if (target.dataset.action) {
      this.handleAction(target.dataset.action, target.dataset.id, event.data);
    }
  }

  handleAction(action: string, id: string, rowData: any): void {
    if (action === 'view') {
      this.visualizarCredencial(rowData);
    } else if (action === 'print') {
      this.imprimirCredencial(rowData);
    }
  }

  visualizarCredencial(persona: any) {
    this.empleadoSeleccionado = { ...persona };
    this.esEditable = false;
    this.modalManager.openModal({
      title: 'Visualizar Credencial',
      template: this.modalVisualizar,
      width: '400px',
      showFooter: false
    });
  }

  esCredencialFamiliar(persona: any): boolean {
    if (!persona) return false;
    const tipo = String(persona?.tipo_credencial || '').toLowerCase();
    return tipo === 'familiar' || persona?.source_table === 'familiar' || Number(persona?.familiar || 0) === 1;
  }

  esCredencialAnam(persona: any): boolean {
    if (!persona || this.esCredencialFamiliar(persona)) return false;
    const tipo = String(persona?.tipo_credencial || '').toLowerCase();
    if (tipo === 'anam') return true;
    if (tipo === 'provisional' || tipo === 'nuevolaredo') return false;
    return persona?.source_table === 'enrolamiento' && Number(persona?.provisional || 0) === 1 && Number(persona?.nuevo_laredo || 0) !== 1;
  }

  private obtenerPlantillaModalActiva(): any {
    if (this.esCredencialFamiliar(this.empleadoSeleccionado)) return this.plantillaModalFamiliar;
    if (this.esCredencialAnam(this.empleadoSeleccionado)) return this.plantillaModalAnam;
    return this.plantillaModalNuevoLaredo;
  }

  private obtenerPlantillaImpresionActiva(persona: any): any {
    if (this.esCredencialFamiliar(persona)) return this.plantillaImprimirFamiliar;
    if (this.esCredencialAnam(persona)) return this.plantillaImprimirAnam;
    return this.plantillaImprimirNuevoLaredo;
  }

  guardarCambios() {
    const plantillaActiva = this.obtenerPlantillaModalActiva();
    if (plantillaActiva) {
      plantillaActiva.guardarEnrolamiento();
    }
  }

  onEnrolamientoCompletado() {
    this.modalManager.closeModal();
    this.buscarCredenciales();
  }

  async imprimirCredencial(persona: any) {
    if (!persona.num_empleado) {
      this.utils.MuestrasToast(TipoToast.Warning, 'No se puede imprimir: Falta número de empleado.');
      return;
    }

    this.utils.MuestrasToast(TipoToast.Info, 'Generando PDF');
    this.empleadoImprimir = { ...persona };
    
    setTimeout(async () => {
        try {
            const pdfWidth = 54.0;
            const pdfHeight = 86.0;
            const pdf = new jsPDF('p', 'mm', [pdfWidth, pdfHeight]); 

            const imgWidth = pdfWidth;
            const imgHeight = 86.0;
            
            const xOffset = (pdfWidth - imgWidth) / 2;
            const yOffset = (pdfHeight - imgHeight) / 2;

            const options = { 
              scale: 2,
              useCORS: true,      
              logging: false,
              backgroundColor: '#ffffff',
              removeContainer: false
            };

            const plantillaActiva = this.obtenerPlantillaImpresionActiva(persona);

            if (plantillaActiva) {
              plantillaActiva.vistaCredencial = 'frente';
                await new Promise(resolve => setTimeout(resolve, 400));
                
                const element = this.printContainer.nativeElement.querySelector('.credencial-frente');
                const canvasFront = await html2canvas(element, options);
                const imgDataFront = canvasFront.toDataURL('image/png', 1.0); 
                
                pdf.addImage(imgDataFront, 'PNG', xOffset, yOffset, imgWidth, imgHeight, '', 'FAST');
            }

            if (plantillaActiva) {
              plantillaActiva.vistaCredencial = 'reverso';
                await new Promise(resolve => setTimeout(resolve, 400));

                const elementReverso = this.printContainer.nativeElement.querySelector('.credencial-reverso');
                const canvasBack = await html2canvas(elementReverso, options);
                const imgDataBack = canvasBack.toDataURL('image/png', 1.0);
                
                pdf.addPage();
                pdf.addImage(imgDataBack, 'PNG', xOffset, yOffset, imgWidth, imgHeight, '', 'FAST');
            }

            pdf.save(`Credencial_${persona.num_empleado}.pdf`);
            this.utils.MuestrasToast(TipoToast.Success, 'PDF generado correctamente');

            if (persona.id_enrolamiento) {
              const marcar$ = this.esCredencialFamiliar(persona)
                ? this.enrolamientoService.marcarComoImpresoFamiliar(persona.id_enrolamiento, persona.fecha_expedicion)
                : this.enrolamientoService.marcarComoImpreso(persona.id_enrolamiento, persona.fecha_expedicion);

              marcar$.subscribe({
                next: () => {
                  this.buscarCredenciales();
                },
                error: (err) => {
                  console.error('Error al marcar como impreso:', err);
                }
              });
            }

        } catch (error) {
            console.error('Error:', error);
            this.utils.MuestrasToast(TipoToast.Error, 'Error al generar PDF');
        } finally {
            this.empleadoImprimir = null;
        }
    }, 800);
  }
}