import {
  Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild,
} from '@angular/core';
import { ColDef, GridApi, GridReadyEvent, RowClickedEvent } from 'ag-grid-community';
import * as fabric from 'fabric';

import { TipoToast } from '../../../api/entidades/enumeraciones';
import { UtilsService } from '../../services/utils.service';
import { CredencialRenderService } from '../../services/credencial-render.service';
import {
  EmpleadoSig, PlantillaCredencial, PlantillaCredencialService,
} from '../../services/plantilla-credencial.service';
import { CaraCredencial } from '../plantilla-editor/plantilla-editor.const';
import { COLUMNAS_SIG, sigAEmpleadoCredencial } from './imprimir-credenciales.const';

/**
 * Pantalla "Imprimir credenciales".
 *
 * Izquierda: roster SIG completo (~16k filas) en ag-Grid, con filtro por
 * columna y buscador global, todo client-side -- el dataset se descarga una
 * sola vez y a partir de ahi el filtrado es inmediato, sin round-trips.
 *
 * Derecha: previsualizacion de la credencial con la plantilla por defecto,
 * poblada con los datos del empleado seleccionado y su foto/firma de
 * MEDIA_ROOT. La preview se genera con el MISMO servicio que produce el PDF
 * (CredencialRenderService), asi que lo que se ve es exactamente lo que se
 * imprime.
 *
 * Edicion rapida: al dar "Editar" se construye un canvas Fabric INTERACTIVO
 * (copia temporal en memoria, ver CredencialRenderService.construirCanvasEditable)
 * poblado con los datos del empleado actual, con el mismo panel de
 * propiedades que el editor de plantillas. Los ajustes viven solo en esa
 * instancia de canvas -- nunca tocan la PlantillaCredencial guardada -- y se
 * pierden al elegir otro empleado, recargar la pagina, o salir de esta
 * pantalla. Si el usuario los quiere permanentes, debe ir al editor real.
 */
@Component({
  standalone: false,
  selector: 'app-imprimir-credenciales',
  templateUrl: './imprimir-credenciales.component.html',
  styleUrls: ['./imprimir-credenciales.component.scss'],
})
export class ImprimirCredencialesComponent implements OnInit, OnDestroy {

  // ---- Grid ----
  private gridApi!: GridApi;
  columnDefs: ColDef[] = [];
  rowData: EmpleadoSig[] = [];
  busquedaGlobal = '';
  totalFiltrados = 0;

  readonly defaultColDef: ColDef = {
    sortable: true,
    filter: 'agTextColumnFilter',
    floatingFilter: true,   // caja de busqueda bajo cada encabezado
    resizable: true,
    minWidth: 110,
    suppressHeaderMenuButton: true,
  };

  // ---- Estado general ----
  cargandoRoster = false;
  cargandoPlantilla = false;
  generandoPreview = false;
  generandoPdf = false;

  /** Fecha mas reciente de sincronizacion del roster SIG (celery, cada 30 min). */
  ultimaActualizacion: Date | null = null;

  // ---- Plantilla en uso ----
  plantilla: PlantillaCredencial | null = null;
  origenPlantilla = '';
  /**
   * Plantillas activas disponibles para elegir desde esta pantalla. La
   * seleccion vive SOLO en memoria: al recargar o volver a entrar, se
   * vuelve a la marcada como predeterminada.
   */
  plantillasDisponibles: PlantillaCredencial[] = [];
  selectorAbierto = false;
  /** true cuando el usuario eligio una plantilla distinta a la predeterminada. */
  plantillaAnulada = false;

  @ViewChild('selectorPlantilla') selectorPlantillaRef!: ElementRef<HTMLElement>;

  // ---- Seleccion / preview ----
  empleadoSeleccionado: any = null;
  filaSeleccionada: EmpleadoSig | null = null;
  cara: CaraCredencial = 'frente';
  previewFrente: string | null = null;
  previewReverso: string | null = null;

  /** Evita que una preview lenta pise a otra mas reciente (race condition). */
  private tokenPreview = 0;

  // ---- Edicion rapida (temporal, solo mientras dure esta seleccion) ----
  modoEdicion = false;
  canvasFrenteEditable: fabric.Canvas | null = null;
  canvasReversoEditable: fabric.Canvas | null = null;
  objetoSeleccionado: fabric.FabricObject | null = null;

  @ViewChild('canvasEdicionFrente') canvasEdicionFrenteRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('canvasEdicionReverso') canvasEdicionReversoRef!: ElementRef<HTMLCanvasElement>;

  constructor(
    private plantillaApi: PlantillaCredencialService,
    private render: CredencialRenderService,
    private utils: UtilsService,
  ) {
    this.columnDefs = COLUMNAS_SIG.map(col => ({
      field: col.campo,
      headerName: col.titulo,
      width: col.ancho,
      tooltipField: col.campo,
    }));
  }

  ngOnInit(): void {
    this.cargarPlantillaPorDefecto();
    this.cargarPlantillasDisponibles();
    this.cargarRoster();
  }

  ngOnDestroy(): void {
    this.destruirCanvasEditables();
  }

  /** Cierra el selector si el clic ocurrio fuera de el. */
  @HostListener('document:click', ['$event'])
  onClicDocumento(evento: MouseEvent): void {
    if (!this.selectorAbierto) return;
    const contenedor = this.selectorPlantillaRef?.nativeElement;
    if (contenedor && !contenedor.contains(evento.target as Node)) {
      this.selectorAbierto = false;
    }
  }

  // ====================================================================
  // Carga de datos
  // ====================================================================

  cargarRoster(): void {
    this.cargandoRoster = true;

    this.plantillaApi.empleadosSigTodos().subscribe({
      next: (res) => {
        this.rowData = res?.registros || [];
        this.totalFiltrados = this.rowData.length;
        this.ultimaActualizacion = this.calcularUltimaActualizacion(this.rowData);
        this.cargandoRoster = false;
      },
      error: (err) => {
        this.cargandoRoster = false;
        this.utils.MuestraErrorInterno(err);
      },
    });
  }

  /**
   * El sync de Celery escribe el mismo `fecha_actualizacion` en todas las
   * filas de un lote -- se toma el maximo por si alguna vez quedara una
   * sincronizacion parcial, para reflejar siempre el dato mas reciente.
   */
  private calcularUltimaActualizacion(filas: EmpleadoSig[]): Date | null {
    let maxima: Date | null = null;
    for (const fila of filas) {
      if (!fila.fecha_actualizacion) continue;
      const fecha = new Date(fila.fecha_actualizacion);
      if (isNaN(fecha.getTime())) continue;
      if (!maxima || fecha > maxima) maxima = fecha;
    }
    return maxima;
  }

  cargarPlantillaPorDefecto(): void {
    this.cargandoPlantilla = true;

    this.plantillaApi.obtenerPorDefecto().subscribe({
      next: (res) => {
        this.plantilla = res?.plantilla || null;
        this.origenPlantilla = res?.origen || '';
        this.cargandoPlantilla = false;

        // Si ya habia un empleado elegido, re-renderizar con esta plantilla.
        if (this.empleadoSeleccionado) {
          this.generarPreview();
        }
      },
      error: () => {
        this.cargandoPlantilla = false;
        this.plantilla = null;
      },
    });
  }

  private cargarPlantillasDisponibles(): void {
    this.plantillaApi.listar(true).subscribe({
      next: (res) => {
        // El endpoint puede venir paginado o como arreglo plano.
        this.plantillasDisponibles = Array.isArray(res) ? res : (res?.results || []);
      },
      error: () => { this.plantillasDisponibles = []; },
    });
  }

  // ====================================================================
  // Selector de plantilla (solo para esta sesion de la pantalla)
  // ====================================================================

  alternarSelector(): void {
    this.selectorAbierto = !this.selectorAbierto;
  }

  /**
   * Cambia la plantilla en uso. No persiste nada: al recargar la pagina o
   * volver a entrar a la pantalla se retoma la marcada como predeterminada.
   */
  usarPlantilla(nueva: PlantillaCredencial): void {
    this.selectorAbierto = false;

    if (nueva.id_plantilla === this.plantilla?.id_plantilla) return;

    this.plantilla = nueva;
    this.plantillaAnulada = !nueva.por_defecto;

    // Cambiar de plantilla invalida cualquier edicion rapida en curso: los
    // objetos del canvas editable pertenecen a la plantilla anterior.
    this.salirDeEdicion();

    if (this.empleadoSeleccionado) {
      this.generarPreview();
    }
  }

  /** Regresa a la plantilla marcada como predeterminada. */
  restaurarPlantillaPorDefecto(): void {
    this.selectorAbierto = false;
    this.plantillaAnulada = false;
    this.cargarPlantillaPorDefecto();
  }

  // ====================================================================
  // Grid
  // ====================================================================

  onGridReady(evento: GridReadyEvent): void {
    this.gridApi = evento.api;
  }

  /** Buscador global: ag-Grid filtra sobre todas las columnas en memoria. */
  onBusquedaGlobal(): void {
    if (!this.gridApi) return;
    this.gridApi.setGridOption('quickFilterText', this.busquedaGlobal);
    this.actualizarConteoFiltrado();
  }

  limpiarFiltros(): void {
    this.busquedaGlobal = '';
    if (!this.gridApi) return;
    this.gridApi.setGridOption('quickFilterText', '');
    this.gridApi.setFilterModel(null);
    this.actualizarConteoFiltrado();
  }

  onFiltroCambiado(): void {
    this.actualizarConteoFiltrado();
  }

  private actualizarConteoFiltrado(): void {
    if (!this.gridApi) return;
    this.totalFiltrados = this.gridApi.getDisplayedRowCount();
  }

  onFilaSeleccionada(evento: RowClickedEvent): void {
    const fila = evento.data as EmpleadoSig;
    if (!fila) return;
    this.seleccionarEmpleado(fila);
  }

  // ====================================================================
  // Seleccion y preview
  // ====================================================================

  seleccionarEmpleado(fila: EmpleadoSig): void {
    // Un empleado nuevo es una credencial distinta: cualquier edicion rapida
    // del anterior deja de tener sentido.
    this.salirDeEdicion();

    this.filaSeleccionada = fila;
    this.empleadoSeleccionado = sigAEmpleadoCredencial(fila);
    this.previewFrente = null;
    this.previewReverso = null;

    const numEmpleado = this.empleadoSeleccionado.num_empleado;
    if (!numEmpleado) {
      this.generarPreview();
      return;
    }

    // Resolver foto/firma en MEDIA_ROOT antes de renderizar, para que la
    // credencial salga completa de una sola pasada.
    this.plantillaApi.medios(numEmpleado).subscribe({
      next: (res) => {
        this.empleadoSeleccionado.foto = res?.foto || null;
        this.empleadoSeleccionado.firma = res?.firma || null;
        this.generarPreview();
      },
      error: () => this.generarPreview(),
    });
  }

  async generarPreview(): Promise<void> {
    if (!this.plantilla || !this.empleadoSeleccionado) return;

    const token = ++this.tokenPreview;
    this.generandoPreview = true;

    try {
      // Multiplicador 1: resolucion de pantalla, suficiente para previsualizar
      // y mucho mas rapido que el x3 que usa el PDF.
      const frente = await this.render.renderizarCaraComoImagen(
        this.plantilla, 'frente', this.empleadoSeleccionado, 1
      );

      let reverso: string | null = null;
      if (this.plantilla.canvas_reverso || this.plantilla.fondo_reverso) {
        reverso = await this.render.renderizarCaraComoImagen(
          this.plantilla, 'reverso', this.empleadoSeleccionado, 1
        );
      }

      // Otra seleccion llego mientras renderizabamos: descartar este resultado.
      if (token !== this.tokenPreview) return;

      this.previewFrente = frente;
      this.previewReverso = reverso;
    } catch (err) {
      if (token === this.tokenPreview) {
        this.utils.MuestrasToast(TipoToast.Error, 'No se pudo generar la vista previa.');
      }
    } finally {
      if (token === this.tokenPreview) {
        this.generandoPreview = false;
      }
    }
  }

  get previewActual(): string | null {
    return this.cara === 'frente' ? this.previewFrente : this.previewReverso;
  }

  get tieneReverso(): boolean {
    return !!(this.plantilla?.canvas_reverso || this.plantilla?.fondo_reverso);
  }

  /** Personal dado de baja: se avisa, pero no se bloquea la impresion. */
  get esBaja(): boolean {
    const hum = String(this.filaSeleccionada?.estado_hum || '').toLowerCase();
    const nom = String(this.filaSeleccionada?.estado_nom || '').toLowerCase();
    return hum === 'inactivo' || nom === 'baja';
  }

  get sinFoto(): boolean {
    return !!this.empleadoSeleccionado && !this.empleadoSeleccionado.foto;
  }

  // ====================================================================
  // Edicion rapida (temporal)
  // ====================================================================

  /**
   * Activa la edicion: construye un canvas interactivo para la cara visible
   * (poblado con los datos del empleado actual) y engancha los eventos de
   * seleccion para alimentar el panel de propiedades compartido.
   */
  async activarEdicion(): Promise<void> {
    if (!this.plantilla || !this.empleadoSeleccionado || this.modoEdicion) return;

    this.modoEdicion = true;
    await this.asegurarCanvasEditable(this.cara);
  }

  /** Construye (una sola vez por cara) el canvas editable correspondiente. */
  private async asegurarCanvasEditable(cara: CaraCredencial): Promise<void> {
    if (!this.plantilla || !this.empleadoSeleccionado) return;

    const yaExiste = cara === 'frente' ? this.canvasFrenteEditable : this.canvasReversoEditable;
    if (yaExiste) return;

    // El <canvas> vive tras un *ngIf que depende de `modoEdicion`/`cara`, asi
    // que hay que esperar a que Angular corra deteccion de cambios y lo monte
    // antes de que @ViewChild lo resuelva. Un microtask (Promise.resolve) no
    // basta: hace falta ceder al event loop.
    await new Promise(resolve => setTimeout(resolve, 0));

    const elemento = cara === 'frente'
      ? this.canvasEdicionFrenteRef?.nativeElement
      : this.canvasEdicionReversoRef?.nativeElement;

    if (!elemento) {
      this.utils.MuestrasToast(TipoToast.Error, 'No se pudo abrir el editor rapido.');
      this.modoEdicion = false;
      return;
    }

    const canvas = await this.render.construirCanvasEditable(
      this.plantilla, cara, this.empleadoSeleccionado, elemento
    );

    this.ajustarEscalaCanvas(canvas, elemento);

    canvas.on('selection:created', () => { this.objetoSeleccionado = canvas.getActiveObject() || null; });
    canvas.on('selection:updated', () => { this.objetoSeleccionado = canvas.getActiveObject() || null; });
    canvas.on('selection:cleared', () => { this.objetoSeleccionado = null; });

    if (cara === 'frente') {
      this.canvasFrenteEditable = canvas;
    } else {
      this.canvasReversoEditable = canvas;
    }
  }

  /**
   * Escala el canvas para que quepa en el panel usando SOLO el tamaño CSS
   * (`cssOnly: true`), igual que plantilla-editor: la resolución interna
   * sigue siendo la de diseño (638x1016), así que las coordenadas que se
   * exportan al PDF no dependen del tamaño de pantalla, y Fabric mapea bien
   * las coordenadas del puntero al arrastrar.
   */
  private ajustarEscalaCanvas(canvas: fabric.Canvas, elemento: HTMLCanvasElement): void {
    const contenedor = elemento.parentElement?.parentElement; // .canvas-container -> .ic-lienzo-editable
    const anchoDiseno = canvas.getWidth();
    const altoDiseno = canvas.getHeight();
    if (!contenedor || !anchoDiseno || !altoDiseno) return;

    const dispAncho = contenedor.clientWidth || anchoDiseno;
    const dispAlto = contenedor.clientHeight || altoDiseno;

    // Un margen para que no quede pegado a los bordes del panel.
    const escala = Math.min(dispAncho / anchoDiseno, dispAlto / altoDiseno) * 0.94;
    if (!isFinite(escala) || escala <= 0) return;

    canvas.setDimensions(
      { width: `${anchoDiseno * escala}px`, height: `${altoDiseno * escala}px` },
      { cssOnly: true }
    );
  }

  /** Cambia de cara. En modo edicion, construye el canvas editable de esa cara si hace falta. */
  async cambiarCara(nueva: CaraCredencial): Promise<void> {
    if (nueva === this.cara) return;
    this.cara = nueva;
    this.objetoSeleccionado = null;

    if (this.modoEdicion) {
      await this.asegurarCanvasEditable(nueva);
    }
  }

  /** Sale de edicion y descarta los canvases editables (no se guarda nada). */
  salirDeEdicion(): void {
    this.destruirCanvasEditables();
    this.modoEdicion = false;
    this.objetoSeleccionado = null;
  }

  private destruirCanvasEditables(): void {
    this.canvasFrenteEditable?.dispose();
    this.canvasReversoEditable?.dispose();
    this.canvasFrenteEditable = null;
    this.canvasReversoEditable = null;
  }

  get canvasActivo(): fabric.Canvas | null {
    return this.cara === 'frente' ? this.canvasFrenteEditable : this.canvasReversoEditable;
  }

  // ====================================================================
  // Impresion
  // ====================================================================

  async imprimir(): Promise<void> {
    if (!this.plantilla || !this.empleadoSeleccionado) return;

    this.generandoPdf = true;
    const nombreArchivo = `Credencial_${this.empleadoSeleccionado.num_empleado || 'sin_numero'}.pdf`;

    try {
      if (this.modoEdicion && this.canvasFrenteEditable) {
        // Imprime EXACTAMENTE lo que hay en los canvases editados, ediciones
        // incluidas -- no se vuelve a poblar desde la plantilla original.
        await this.render.generarPdfDesdeCanvases(
          this.canvasFrenteEditable,
          this.canvasReversoEditable,
          this.plantilla,
          this.empleadoSeleccionado,
          { nombreArchivo }
        );
      } else {
        await this.render.generarPdf(this.plantilla, this.empleadoSeleccionado, { nombreArchivo });
      }
      this.utils.MuestrasToast(TipoToast.Success, 'PDF generado');
    } catch (err) {
      this.utils.MuestraErrorInterno(err);
    } finally {
      this.generandoPdf = false;
    }
  }
}
