import {
  ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit, TemplateRef, ViewChild,
} from '@angular/core';
import { ColDef, GridApi, GridReadyEvent, RowClickedEvent } from 'ag-grid-community';
import { NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { Subscription, firstValueFrom } from 'rxjs';
import * as fabric from 'fabric';

import { TipoToast } from '../../../api/entidades/enumeraciones';
import { UtilsService } from '../../services/utils.service';
import { CredencialRenderService } from '../../services/credencial-render.service';
import { ModalManagerService } from '../../components/shared/modal-manager.service';
import { WacomService } from '../../services/wacom.service';
import { motivoSinCamara, motivoSinWacom, soportaCamara } from '../../services/soporte-navegador';
import {
  EmpleadoSig, PlantillaCredencial, PlantillaCredencialService,
} from '../../services/plantilla-credencial.service';
import { CANVAS_ALTO_PX, CANVAS_ANCHO_PX, CaraCredencial } from '../plantilla-editor/plantilla-editor.const';
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

  // ---- Tabs ----
  /** Pestaña activa: 'todos' muestra el roster completo; 'nuevos_hoy' filtra por fecha de hoy. */
  tabActiva: 'todos' | 'nuevos_hoy' = 'todos';

  /**
   * Caché de filas cuyo `fecha_actualizacion` es de hoy.
   * Se calcula una sola vez al terminar de cargar el roster (no en cada ciclo
   * de detección de cambios), porque recorrer 16k filas en cada render
   * sería costoso.
   */
  nuevosHoyData: EmpleadoSig[] = [];

  get contadorNuevosHoy(): number {
    return this.nuevosHoyData.length;
  }

  /**
   * Calcula y actualiza el caché de nuevos ingresos del día.
   *
   * OJO: se filtra por `fecha_primera_deteccion`, NO por
   * `fecha_actualizacion`. Esta última se reescribe en CADA sincronización
   * (cada 30 min) para TODOS los empleados del roster, así que filtrar por
   * ella marcaría al roster COMPLETO como "de hoy" en cuanto corriera el
   * primer sync del día -- no sirve para aislar altas reales.
   * `fecha_primera_deteccion` en cambio se escribe una sola vez, la primera
   * vez que Control_De_Plazas_Backend detecta a ese empleado, y ya no se
   * toca en syncs siguientes (ver ese proyecto,
   * _obtener_fechas_primera_deteccion / _leer_csv_poblado_credenciales).
   *
   * La fecha llega del backend en UTC. Comparar por PREFIJO DE STRING contra
   * la fecha local del navegador sería incorrecto: para un usuario en México
   * (UTC-6), la medianoche UTC cae ~18:00-19:00 hora local -- horario
   * laboral típico en el que sí pueden llegar altas nuevas. Por eso se
   * comparan los componentes de fecha en hora LOCAL (los getters sin "UTC"
   * de Date ya convierten automáticamente), tanto para "hoy" como para la
   * fecha parseada.
   */
  private actualizarNuevosHoy(): void {
    const hoy = new Date();
    this.nuevosHoyData = this.rowData.filter(f => {
      if (!f.fecha_primera_deteccion) return false;
      const fecha = new Date(f.fecha_primera_deteccion);
      if (isNaN(fecha.getTime())) return false;
      return fecha.getFullYear() === hoy.getFullYear()
        && fecha.getMonth() === hoy.getMonth()
        && fecha.getDate() === hoy.getDate();
    });
  }

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

  // ---- Consecutivo de folio ----
  /**
   * Proximo folio a emitir. Se lee del servidor al abrir la pantalla y avanza
   * solo cada vez que se genera un PDF. Es editable: el operador puede fijar
   * el que necesite y el consecutivo continua desde ahi.
   *
   * Ajustar el folio a mano DENTRO del modo edicion no toca este contador --
   * ese cambio vive en el canvas y solo afecta a esa impresion.
   */
  folioSiguiente = '';
  /** Copia de lo ultimo confirmado por el servidor, para revertir si falla. */
  private folioConfirmado = '';
  guardandoFolio = false;

  // ---- Edicion rapida (temporal, solo mientras dure esta seleccion) ----
  modoEdicion = false;
  canvasFrenteEditable: fabric.Canvas | null = null;
  canvasReversoEditable: fabric.Canvas | null = null;
  objetoSeleccionado: fabric.FabricObject | null = null;

  @ViewChild('canvasEdicionFrente') canvasEdicionFrenteRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('canvasEdicionReverso') canvasEdicionReversoRef!: ElementRef<HTMLCanvasElement>;

  // ---- Captura de foto (modal reutilizado de plantilla-enrolamiento) ----
  @ViewChild('modalCamara') modalCamaraRef!: TemplateRef<any>;
  @ViewChild('videoElement') videoElementRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasCaptura') canvasCapturaRef!: ElementRef<HTMLCanvasElement>;

  private modalCamaraInstancia: NgbModalRef | undefined;
  stream: MediaStream | null = null;
  fotoCapturada: string | null = null;
  dispositivosVideo: MediaDeviceInfo[] = [];
  camaraSeleccionadaId = '';

  // ---- Captura de firma (modal reutilizado de plantilla-enrolamiento, Wacom STU) ----
  @ViewChild('modalFirma') modalFirmaRef!: TemplateRef<any>;
  @ViewChild('firmaCanvas') firmaCanvasRef!: ElementRef<HTMLCanvasElement>;

  private modalFirmaInstancia: NgbModalRef | undefined;
  private cxFirma: CanvasRenderingContext2D | null = null;
  private dibujandoFirma = false;
  private ultimoXFirma = 0;
  private ultimoYFirma = 0;
  private wacomSub: Subscription | null = null;
  isWacomSupported = false;
  wacomConnected = false;
  /** Explica por que no hay tableta/camara; null si si estan disponibles. */
  avisoWacom: string | null = null;
  avisoCamara: string | null = null;

  /**
   * Foto/firma capturadas en esta sesion, pendientes de guardarse en
   * MEDIA_ROOT. A diferencia de la primera version, confirmar la captura ya
   * NO sube nada al servidor de inmediato -- eso reemplazaria el archivo
   * anterior de forma irreversible antes de que el usuario decida imprimir.
   * El guardado real ocurre en guardarMediosPendientes(), llamado desde
   * imprimir(). Mientras tanto solo viven en memoria (igual que la edicion
   * rapida) y se descartan si se cambia de empleado sin imprimir.
   */
  fotoPendiente: string | null = null;
  firmaPendiente: string | null = null;

  /**
   * True cuando la foto/firma del empleado actual se resolvieron por RFC
   * (captura de "Enrolamiento previo") y siguen nombradas asi en disco. Al
   * imprimir se renombran al num_empleado definitivo, que es el momento en
   * que el cruce queda confirmado.
   */
  mediosRequierenMigracion = false;

  get hayMediosPendientes(): boolean {
    return !!(this.fotoPendiente || this.firmaPendiente);
  }

  constructor(
    private plantillaApi: PlantillaCredencialService,
    private render: CredencialRenderService,
    private utils: UtilsService,
    private cdr: ChangeDetectorRef,
    private modalManager: ModalManagerService,
    private wacomService: WacomService,
  ) {
    this.columnDefs = COLUMNAS_SIG.map(col => ({
      field: col.campo,
      headerName: col.titulo,
      width: col.ancho,
      tooltipField: col.campo,
    }));
    this.isWacomSupported = this.wacomService.isBrowserSupported();
    this.avisoWacom = motivoSinWacom();
    this.avisoCamara = motivoSinCamara();
  }

  ngOnInit(): void {
    this.cargarPlantillaPorDefecto();
    this.cargarPlantillasDisponibles();
    this.cargarRoster();
    this.cargarFolio();
  }

  // ====================================================================
  // Consecutivo de folio
  // ====================================================================

  private cargarFolio(): void {
    this.plantillaApi.folioActual().subscribe({
      next: (res) => {
        this.folioSiguiente = res?.folio || '';
        this.folioConfirmado = this.folioSiguiente;
        this.aplicarFolioAlEmpleado();
        // Si el operador alcanzo a elegir empleado antes de que llegara el
        // folio, su vista previa se genero con el campo vacio: hay que
        // rehacerla o imprimiria una credencial sin folio.
        this.regenerarPreviewPorFolio();
      },
      error: () => { /* sin folio: la credencial sale con ese campo vacio */ },
    });
  }

  /**
   * Guarda el folio tecleado por el operador. Se dispara al salir del input
   * (blur) y no en cada tecla, para no mandar una peticion por caracter.
   */
  onFolioEditado(): void {
    const folio = (this.folioSiguiente || '').trim();
    if (!folio || folio === this.folioConfirmado) {
      this.folioSiguiente = this.folioConfirmado;
      return;
    }

    this.guardandoFolio = true;
    this.plantillaApi.folioEstablecer(folio).subscribe({
      next: (res) => {
        this.guardandoFolio = false;
        this.folioSiguiente = res?.folio || folio;
        this.folioConfirmado = this.folioSiguiente;
        this.aplicarFolioAlEmpleado();
        this.regenerarPreviewPorFolio();
      },
      error: (err) => {
        this.guardandoFolio = false;
        // Revertir a lo ultimo confirmado: dejar en pantalla un folio que el
        // servidor rechazo haria creer que ya quedo fijado.
        this.folioSiguiente = this.folioConfirmado;
        this.utils.MuestraErrorInterno(err);
      },
    });
  }

  /** Refleja el folio vigente en el empleado seleccionado. */
  private aplicarFolioAlEmpleado(): void {
    if (this.empleadoSeleccionado) {
      this.empleadoSeleccionado.folio = this.folioSiguiente;
    }
  }

  /**
   * Solo re-renderiza la vista previa (no el canvas de edicion): si el
   * operador ya movio cosas a mano, reconstruir el canvas le borraria esos
   * ajustes. En modo edicion el folio del canvas manda, por diseno.
   */
  private regenerarPreviewPorFolio(): void {
    if (this.empleadoSeleccionado && !this.modoEdicion) {
      this.generarPreview();
    }
  }

  /**
   * Avanza el consecutivo tras imprimir. El incremento real ocurre en el
   * servidor de forma atomica (bloqueo de fila), asi que dos estaciones
   * imprimiendo a la vez nunca reciben el mismo folio.
   */
  private async consumirFolio(): Promise<void> {
    if (!this.folioSiguiente) return;

    try {
      const res = await firstValueFrom(this.plantillaApi.folioConsumir());
      this.folioSiguiente = res?.folio_siguiente || this.folioSiguiente;
      this.folioConfirmado = this.folioSiguiente;
      this.aplicarFolioAlEmpleado();
    } catch {
      // La credencial ya se genero: no se bloquea nada, pero hay que avisar
      // para que el operador no reimprima con un folio repetido sin saberlo.
      this.utils.MuestrasToast(
        TipoToast.Warning,
        'El PDF se generó, pero no se pudo avanzar el consecutivo de folio. Verifícalo antes de imprimir la siguiente.'
      );
    }
  }

  ngOnDestroy(): void {
    this.destruirCanvasEditables();
    this.detenerCamara();
    this.wacomSub?.unsubscribe();
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
        this.actualizarNuevosHoy();
        this.cargandoRoster = false;
      },
      error: (err) => {
        this.cargandoRoster = false;
        this.utils.MuestraErrorInterno(err);
      },
    });
  }

  /** Vuelve a descargar el roster desde el servidor (actualiza datos y fecha de sincronización). */
  recargarRoster(): void {
    this.rowData = [];
    this.totalFiltrados = 0;
    this.ultimaActualizacion = null;
    this.cargarRoster();
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

  /** Cambia la pestaña activa y actualiza el dataset de la grid. */
  seleccionarTab(tab: 'todos' | 'nuevos_hoy'): void {
    this.tabActiva = tab;
    // Al cambiar de tab aplicamos de nuevo el quickFilter para que funcione en ambos tabs
    if (this.gridApi) {
      this.gridApi.setGridOption('quickFilterText', this.busquedaGlobal);
    }
    this.actualizarConteoFiltrado();
  }

  /** Filas que alimentan la grid según la pestaña activa. */
  get rowDataActivo(): EmpleadoSig[] {
    return this.tabActiva === 'nuevos_hoy' ? this.nuevosHoyData : this.rowData;
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
    // del anterior deja de tener sentido, cualquier modal de captura abierto
    // para el empleado anterior ya no aplica, y cualquier foto/firma
    // capturada pero no impresa se descarta (nunca se guardo en disco).
    this.salirDeEdicion();
    this.modalCamaraInstancia?.dismiss();
    this.modalFirmaInstancia?.dismiss();
    this.fotoPendiente = null;
    this.firmaPendiente = null;
    this.mediosRequierenMigracion = false;

    this.filaSeleccionada = fila;
    this.empleadoSeleccionado = sigAEmpleadoCredencial(fila);
    this.aplicarFolioAlEmpleado();
    this.previewFrente = null;
    this.previewReverso = null;

    const numEmpleado = this.empleadoSeleccionado.num_empleado;
    if (!numEmpleado) {
      this.generarPreview();
      return;
    }

    // Resolver foto/firma en MEDIA_ROOT antes de renderizar, para que la
    // credencial salga completa de una sola pasada.
    //
    // Se manda tambien el CURP: si esta persona fue capturada en
    // "Enrolamiento previo" (antes de tener numero asignado), sus archivos
    // estan nombrados con su RFC, y el backend los encuentra por el prefijo
    // de 10 caracteres comun a RFC y CURP. En ese caso responde
    // `requiere_migracion`, y al imprimir se renombran al num_empleado.
    this.plantillaApi.medios(numEmpleado, this.empleadoSeleccionado.curp).subscribe({
      next: (res) => {
        this.empleadoSeleccionado.foto = res?.foto || null;
        this.empleadoSeleccionado.firma = res?.firma || null;
        this.mediosRequierenMigracion = !!res?.requiere_migracion;
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

  /** Rectangulo (en % del contenedor) del marcador de foto -- ver rectDelCampo(). */
  get campoFotoRect(): { leftPct: number; topPct: number; widthPct: number; heightPct: number } | null {
    return this.rectDelCampo('foto');
  }

  /** Rectangulo (en % del contenedor) del marcador de firma -- ver rectDelCampo(). */
  get campoFirmaRect(): { leftPct: number; topPct: number; widthPct: number; heightPct: number } | null {
    return this.rectDelCampo('firma');
  }

  /**
   * Rectangulo (en % del contenedor) del marcador de un campo de imagen
   * (foto/firma) dentro de la plantilla, para dibujar un overlay clicable
   * sobre la imagen plana de la vista previa. Se lee directo del JSON crudo
   * de la plantilla (no del canvas ya poblado), asi que siempre refleja
   * donde el DISENO puso el campo para la cara visible, sin importar si el
   * empleado actual ya tiene ese medio o no.
   */
  private rectDelCampo(campo: string): { leftPct: number; topPct: number; widthPct: number; heightPct: number } | null {
    if (!this.plantilla) return null;

    const json: any = this.cara === 'frente' ? this.plantilla.canvas_frente : this.plantilla.canvas_reverso;
    const objetos = json?.objects;
    if (!Array.isArray(objetos)) return null;

    const marcador = objetos.find((o: any) => o?.data?.campo === campo);
    if (!marcador) return null;

    const anchoDiseno = this.plantilla.ancho_px || CANVAS_ANCHO_PX;
    const altoDiseno = this.plantilla.alto_px || CANVAS_ALTO_PX;
    const anchoCaja = (marcador.width || 0) * (marcador.scaleX || 1);
    const altoCaja = (marcador.height || 0) * (marcador.scaleY || 1);
    if (!anchoDiseno || !altoDiseno || !anchoCaja || !altoCaja) return null;

    return {
      leftPct: ((marcador.left || 0) / anchoDiseno) * 100,
      topPct: ((marcador.top || 0) / altoDiseno) * 100,
      widthPct: (anchoCaja / anchoDiseno) * 100,
      heightPct: (altoCaja / altoDiseno) * 100,
    };
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

    // El <canvas> vive dentro de un *ngIf="modoEdicion" que se acaba de
    // volver true -- hay que forzar a Angular a montarlo YA para que el
    // @ViewChild quede resuelto. Un setTimeout(0) por si solo NO garantiza
    // que la deteccion de cambios ya haya corrido en ese momento (zone.js no
    // promete que el orden entre un macrotask propio y el ciclo de
    // estabilizacion de Angular sea siempre el mismo) -- eso era la causa
    // real del "No se pudo abrir el editor rápido" intermitente: a veces el
    // timeout se disparaba antes de que Angular hubiera actualizado el DOM.
    // detectChanges() lo fuerza de forma sincrona y determinista; el bucle de
    // abajo es una red de seguridad adicional por si algún caso extremo
    // (varias directivas estructurales anidadas, animaciones, etc.) todavía
    // necesitara más de un ciclo.
    this.cdr.detectChanges();

    let elemento = cara === 'frente'
      ? this.canvasEdicionFrenteRef?.nativeElement
      : this.canvasEdicionReversoRef?.nativeElement;

    let intentos = 0;
    while (!elemento && intentos < 15) {
      await new Promise(resolve => setTimeout(resolve, 20));
      this.cdr.detectChanges();
      elemento = cara === 'frente'
        ? this.canvasEdicionFrenteRef?.nativeElement
        : this.canvasEdicionReversoRef?.nativeElement;
      intentos++;
    }

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

  /**
   * Cambia de cara.
   *
   * En modo edición, los canvases de frente y reverso son elementos <canvas>
   * que permanecen SIEMPRE en el DOM mientras dura la edición (se ocultan con
   * [style.display], nunca con *ngIf -- ver el HTML). Por eso aquí NO se
   * destruye nada: cambiar de cara solo actualiza `cara` y, si esa cara
   * todavía no tiene canvas construido, lo construye una vez. Cualquier
   * ajuste hecho en una cara sobrevive al ir y venir a la otra, tal como se
   * espera de una edición "temporal mientras estés en esta vista" -- no
   * "temporal mientras estés viendo esta cara en particular".
   *
   * En modo preview (no edición) solo se actualiza `cara` para que el getter
   * `previewActual` devuelva la imagen correcta.
   */
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
    // detectChanges() sincroniza el binding al DOM real, pero el navegador
    // solo PINTA esa actualización en su propio ciclo de rendering -- si el
    // trabajo de generarPdf/generarPdfDesdeCanvases resuelve varios pasos
    // internos sin ceder de verdad (promesas ya resueltas, canvas.toDataURL
    // síncrono y pesado con multiplier x3), el spinner podía quedar
    // actualizado en el DOM pero nunca llegar a pintarse en pantalla.
    //
    // Un solo setTimeout(0) no lo garantiza: es un macrotask genérico, sin
    // relación directa con el pipeline de rendering del navegador. El patrón
    // robusto para "espera a que el navegador realmente pinte este cambio" es
    // el doble requestAnimationFrame: el primer rAF se dispara justo ANTES
    // del próximo pintado (o sea, el cambio de generandoPdf=true todavía no
    // se pintó), y el segundo rAF, anidado dentro del primero, se dispara ya
    // DESPUÉS de que ese pintado ocurrió.
    this.cdr.detectChanges();
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    const nombreArchivo = `Credencial_${this.empleadoSeleccionado.num_empleado || 'sin_numero'}.pdf`;

    try {
      // El reemplazo real en MEDIA_ROOT de una foto/firma recien capturada
      // ocurre justo aqui -- no al aceptar el modal de captura -- para que
      // el archivo anterior solo se pierda cuando el usuario ya decidio
      // imprimir con el nuevo, no apenas lo capturo.
      await this.guardarMediosPendientes();

      if (this.modoEdicion) {
        // asegurarCanvasEditable() es perezoso: solo construye la cara que el
        // usuario visita (ver cambiarCara()). Si edito el frente y nunca le
        // dio clic a "Reverso", canvasReversoEditable seguia en null aqui y
        // generarPdfDesdeCanvases omitia esa pagina del PDF por completo. Por
        // eso antes de imprimir se garantizan AMBAS caras, sin importar cual
        // este visible en este momento.
        await this.asegurarCanvasEditable('frente');
        if (this.tieneReverso) {
          await this.asegurarCanvasEditable('reverso');
        }
      }

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

      // El folio se consume DESPUES de que el PDF salio bien: si se avanzara
      // antes y la generacion fallara, ese folio quedaria quemado sin haberse
      // impreso ninguna credencial, dejando un hueco en la serie.
      await this.consumirFolio();

      this.utils.MuestrasToast(TipoToast.Success, 'PDF generado');
    } catch (err) {
      this.utils.MuestraErrorInterno(err);
    } finally {
      this.generandoPdf = false;
      this.cdr.detectChanges();
    }
  }

  // ====================================================================
  // Guardado diferido de medios (foto/firma) capturados en esta sesion
  // ====================================================================

  /**
   * Sube a MEDIA_ROOT la foto y/o firma pendientes de esta sesion, si las
   * hay. Se llama desde imprimir(), justo antes de generar el PDF -- es el
   * unico momento en el que se reemplaza el archivo anterior en disco.
   *
   * Si el guardado falla, NO se bloquea la impresion (el usuario ya tiene
   * lo que necesitaba: el PDF con los datos capturados), pero se avisa que
   * el archivo en disco no quedo actualizado. *Pendiente no se limpia en
   * ese caso, asi que el proximo intento de impresion lo reintenta solo.
   */
  private async guardarMediosPendientes(): Promise<void> {
    const numEmpleado = this.empleadoSeleccionado?.num_empleado;
    if (!numEmpleado) return;

    // Caso 1: la foto/firma viene de "Enrolamiento previo" y sigue nombrada
    // con el RFC de la persona. Ahora que ya tiene numero asignado y se
    // confirma imprimiendo, se renombra al nombre definitivo.
    if (this.mediosRequierenMigracion) {
      try {
        const res: any = await firstValueFrom(
          this.plantillaApi.migrarMedios(numEmpleado, this.empleadoSeleccionado.curp)
        );
        this.mediosRequierenMigracion = false;
        // Las URLs cambiaron de nombre: hay que refrescarlas para que la
        // vista previa no quede apuntando a un archivo que ya no existe.
        if (res?.foto) this.empleadoSeleccionado.foto = res.foto;
        if (res?.firma) this.empleadoSeleccionado.firma = res.firma;
      } catch {
        // No se bloquea la impresion: el PDF ya se genera bien con los
        // archivos actuales, solo siguen con el nombre viejo. Al no limpiar
        // la bandera, el proximo intento lo reintenta solo.
        this.utils.MuestrasToast(
          TipoToast.Warning,
          'La credencial se generó, pero no se pudo renombrar la foto/firma al número de empleado.'
        );
      }
    }

    // Caso 2: foto/firma capturadas en esta pantalla y aun no subidas.
    if (!this.hayMediosPendientes) return;

    try {
      await firstValueFrom(this.plantillaApi.guardarMediosPorEmpleado(
        numEmpleado,
        this.fotoPendiente ?? undefined,
        this.firmaPendiente ?? undefined,
      ));
      this.fotoPendiente = null;
      this.firmaPendiente = null;
    } catch {
      this.utils.MuestrasToast(
        TipoToast.Warning,
        'La credencial se generó, pero no se pudo guardar la foto/firma de forma permanente. Se reintentará la próxima vez que imprimas.'
      );
    }
  }

  // ====================================================================
  // Captura de foto (mismo flujo que plantilla-enrolamiento: webcam o
  // subida de archivo para la camara profesional externa, que en el
  // navegador solo se detecta como una webcam mas).
  // ====================================================================

  /** Abre el modal de captura. Deshabilitado en modo edicion (ver HTML). */
  abrirCamara(): void {
    if (this.modoEdicion || !this.empleadoSeleccionado) return;
    if (!this.modalCamaraRef) {
      this.utils.MuestrasToast(TipoToast.Warning, 'No se pudo abrir el modal de foto. Recargue la vista e intente de nuevo.');
      return;
    }

    this.fotoCapturada = null;
    this.modalCamaraInstancia = this.modalManager.openModal({
      title: 'Captura de Fotografía',
      template: this.modalCamaraRef,
      width: '600px',
      showFooter: false,
    });
    this.modalCamaraInstancia.result.finally(() => this.detenerCamara());

    this.iniciarCamara();
  }

  async iniciarCamara(deviceId?: string): Promise<void> {
    this.detenerCamara();
    if (!soportaCamara()) {
      // Antes salia en silencio: el modal quedaba en negro sin explicar nada.
      if (this.avisoCamara) this.utils.MuestrasToast(TipoToast.Warning, this.avisoCamara);
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
      };
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);

      setTimeout(() => {
        if (this.videoElementRef) this.videoElementRef.nativeElement.srcObject = this.stream;
      }, 100);

      const dispositivos = await navigator.mediaDevices.enumerateDevices();
      this.dispositivosVideo = dispositivos.filter(d => d.kind === 'videoinput');

      const track = this.stream?.getVideoTracks()[0];
      const settings = track?.getSettings();
      if (settings?.deviceId) this.camaraSeleccionadaId = settings.deviceId;
    } catch (err) {
      console.warn('Error al iniciar cámara:', err);
      this.utils.MuestrasToast(TipoToast.Warning, 'No se pudo acceder a la cámara. Verifique los permisos.');
    }
  }

  cambiarCamara(evento: any): void {
    this.iniciarCamara(evento.target.value);
  }

  /** Captura desde la webcam (integrada o la profesional detectada como tal). */
  capturarFoto(): void {
    if (!this.videoElementRef) return;
    const video = this.videoElementRef.nativeElement;
    const canvas = this.canvasCapturaRef.nativeElement;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    this.fotoCapturada = canvas.toDataURL('image/jpeg');
    this.detenerCamara();
  }

  /** Subida manual, por si el software de la cámara profesional no expone webcam. */
  onArchivoSeleccionado(evento: any): void {
    const archivo = evento.target.files[0];
    if (!archivo) return;

    if (archivo.size > 5 * 1024 * 1024) {
      this.utils.MuestrasToast(TipoToast.Warning, 'La imagen es muy pesada. Máximo 5MB.');
      return;
    }

    const lector = new FileReader();
    lector.onload = () => {
      this.fotoCapturada = lector.result as string;
      this.detenerCamara();
    };
    lector.readAsDataURL(archivo);
    evento.target.value = '';
  }

  /**
   * Confirma la foto capturada: SOLO actualiza la vista previa en memoria.
   * El archivo en MEDIA_ROOT no se toca todavia -- eso reemplazaria la foto
   * anterior de forma irreversible antes de que el usuario decida imprimir
   * (ver guardarMediosPendientes(), llamado desde imprimir()).
   */
  confirmarFoto(): void {
    if (!this.fotoCapturada || !this.empleadoSeleccionado) return;

    this.empleadoSeleccionado.foto = this.fotoCapturada;
    this.fotoPendiente = this.fotoCapturada;
    this.modalCamaraInstancia?.close();
    this.utils.MuestrasToast(TipoToast.Success, 'Fotografía lista. Se guardará al imprimir la credencial.');
    this.generarPreview();
  }

  detenerCamara(): void {
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
  }

  // ====================================================================
  // Captura de firma (mismo flujo que plantilla-enrolamiento: canvas con
  // mouse/touch, o tableta digitalizadora Wacom STU por USB via WebHID).
  // ====================================================================

  /** Abre el modal de captura. Deshabilitado en modo edicion (ver HTML). */
  abrirFirma(): void {
    if (this.modoEdicion || !this.empleadoSeleccionado) return;
    if (!this.modalFirmaRef) {
      this.utils.MuestrasToast(TipoToast.Warning, 'No se pudo abrir el modal de firma. Recargue la vista e intente de nuevo.');
      return;
    }

    this.modalFirmaInstancia = this.modalManager.openModal({
      title: 'Captura de Firma',
      template: this.modalFirmaRef,
      width: '500px',
      showFooter: true,
      onAccept: () => this.confirmarFirma(),
    });

    // Un setTimeout(200) fijo no garantiza que el navegador ya haya PINTADO
    // el modal (con su transicion de apertura) antes de medir el <canvas>
    // con offsetWidth/offsetHeight -- si se mide antes de tiempo, esos salen
    // en 0 y el canvas queda con resolucion interna 0x0. En ese estado los
    // eventos de mouse SI se disparan (por eso no habia ningun error), pero
    // no hay un solo pixel donde dibujar: el trazo es completamente invisible.
    // Mismo patron ya usado en asegurarCanvasEditable()/imprimir() de este
    // componente para el problema equivalente.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this.inicializarCanvasFirma();
      if (this.wacomConnected) this.wacomService.limpiarPantalla();
    }));
  }

  inicializarCanvasFirma(): void {
    const canvasEl = this.firmaCanvasRef.nativeElement;
    const escala = 2; // Densidad de pixeles (evita que se vea pixelada).

    this.cxFirma = canvasEl.getContext('2d', { desynchronized: true });

    // Respaldo si offsetWidth/Height siguieran en 0 (ver comentario en
    // abrirFirma()): usa el tamano fijo del recuadro definido en el HTML
    // (400x200) para que el canvas nunca se quede con resolucion 0x0.
    const anchoCss = canvasEl.offsetWidth || 400;
    const altoCss = canvasEl.offsetHeight || 200;
    canvasEl.width = anchoCss * escala;
    canvasEl.height = altoCss * escala;

    if (this.cxFirma) {
      this.cxFirma.lineWidth = 3 * escala;
      this.cxFirma.lineCap = 'round';
      this.cxFirma.lineJoin = 'round';
      this.cxFirma.strokeStyle = '#000000';
    }
  }

  /** Sube una imagen de firma ya existente y la dibuja en el canvas (ajustada, sin deformar). */
  onArchivoFirmaSeleccionado(evento: any): void {
    const archivo = evento.target.files[0];
    if (!archivo) return;

    if (archivo.size > 5 * 1024 * 1024) {
      this.utils.MuestrasToast(TipoToast.Warning, 'La imagen es muy pesada. Máximo 5MB.');
      return;
    }

    const lector = new FileReader();
    lector.onload = () => this.dibujarImagenEnFirma(lector.result as string);
    lector.readAsDataURL(archivo);
    evento.target.value = '';
  }

  private dibujarImagenEnFirma(dataUrl: string): void {
    const canvasEl = this.firmaCanvasRef?.nativeElement;
    if (!canvasEl || !this.cxFirma) return;

    const imagen = new Image();
    imagen.onload = () => {
      if (!this.cxFirma) return;
      this.cxFirma.clearRect(0, 0, canvasEl.width, canvasEl.height);

      // Ajusta la imagen dentro del canvas manteniendo proporcion (contain),
      // igual que se ajustaria el marcador de firma en la credencial.
      const escala = Math.min(canvasEl.width / imagen.width, canvasEl.height / imagen.height);
      const anchoDestino = imagen.width * escala;
      const altoDestino = imagen.height * escala;
      const x = (canvasEl.width - anchoDestino) / 2;
      const y = (canvasEl.height - altoDestino) / 2;
      this.cxFirma.drawImage(imagen, x, y, anchoDestino, altoDestino);
    };
    imagen.src = dataUrl;
  }

  async conectarWacom(): Promise<void> {
    this.wacomConnected = await this.wacomService.conectar();

    if (this.wacomConnected) {
      this.wacomSub?.unsubscribe();
      this.wacomSub = this.wacomService.getPenData().subscribe((data) => this.procesarTrazoWacom(data));
      this.utils.MuestrasToast(TipoToast.Success, 'Tableta Wacom Conectada');
    } else {
      this.utils.MuestrasToast(TipoToast.Error, 'No se pudo conectar la tableta. Verifique conexión USB y permisos.');
    }
  }

  /** Interpolacion cuadratica hacia el punto medio para suavizar el trazo. */
  private procesarTrazoWacom(data: any): void {
    if (!this.cxFirma || !data) return;

    const tabletW = 9750; // Calibracion Wacom STU-430 (max observado ~9727).
    const tabletH = 6100; // (max observado ~6016).
    const canvasEl = this.firmaCanvasRef.nativeElement;
    const x = (data.x / tabletW) * canvasEl.width;
    const y = (data.y / tabletH) * canvasEl.height;

    if (data.isDown) {
      if (!this.dibujandoFirma) {
        this.dibujandoFirma = true;
        this.cxFirma.beginPath();
        this.cxFirma.moveTo(x, y);
        this.ultimoXFirma = x;
        this.ultimoYFirma = y;
      } else {
        const midX = (this.ultimoXFirma + x) / 2;
        const midY = (this.ultimoYFirma + y) / 2;
        this.cxFirma.quadraticCurveTo(this.ultimoXFirma, this.ultimoYFirma, midX, midY);
        this.cxFirma.stroke();
        this.ultimoXFirma = x;
        this.ultimoYFirma = y;
      }
    } else if (this.dibujandoFirma) {
      this.cxFirma.lineTo(this.ultimoXFirma, this.ultimoYFirma);
      this.cxFirma.stroke();
      this.dibujandoFirma = false;
      this.cxFirma.closePath();
    }
  }

  startDrawing(evento: MouseEvent | TouchEvent): void {
    if (this.wacomConnected && this.dibujandoFirma) return; // Prioridad Wacom.
    this.dibujandoFirma = true;
    const { x, y } = this.coordenadasFirma(evento);
    this.dibujarFirma(x, y);
  }

  moveDrawing(evento: MouseEvent | TouchEvent): void {
    if (this.wacomConnected) return;
    if (!this.dibujandoFirma) return;
    const { x, y } = this.coordenadasFirma(evento);
    this.dibujarFirma(x, y);
    evento.preventDefault();
  }

  stopDrawing(): void {
    if (this.wacomConnected) return;
    if (!this.dibujandoFirma) return;
    this.dibujandoFirma = false;
    this.cxFirma?.beginPath();
  }

  private dibujarFirma(x: number, y: number): void {
    if (!this.cxFirma) return;
    this.cxFirma.lineTo(x, y);
    this.cxFirma.stroke();
    this.cxFirma.beginPath();
    this.cxFirma.moveTo(x, y);
  }

  private coordenadasFirma(evento: MouseEvent | TouchEvent): { x: number; y: number } {
    const canvasEl = this.firmaCanvasRef.nativeElement;
    const rect = canvasEl.getBoundingClientRect();

    // Se comprueba MouseEvent, NUNCA `evento instanceof TouchEvent`.
    // Firefox de escritorio solo define TouchEvent en equipos con pantalla
    // tactil; en el resto la clase no existe y ese instanceof lanza
    // "TouchEvent is not defined", abortando el trazo antes de dibujar nada.
    // Se ve exactamente como si el canvas no respondiera al mouse.
    const esRaton = evento instanceof MouseEvent;
    const clientX = esRaton ? evento.clientX : (evento as TouchEvent).touches[0].clientX;
    const clientY = esRaton ? evento.clientY : (evento as TouchEvent).touches[0].clientY;

    // El canvas tiene el DOBLE de resolucion interna que su tamano CSS (ver
    // inicializarCanvasFirma). Sin convertir, el trazo se dibujaria a mitad
    // de camino del puntero, amontonado en el cuarto superior izquierdo.
    const escalaX = canvasEl.width / rect.width;
    const escalaY = canvasEl.height / rect.height;

    return {
      x: (clientX - rect.left) * escalaX,
      y: (clientY - rect.top) * escalaY,
    };
  }

  limpiarFirma(): void {
    const canvasEl = this.firmaCanvasRef.nativeElement;
    this.cxFirma?.clearRect(0, 0, canvasEl.width, canvasEl.height);
    this.wacomService.limpiarPantalla();
  }

  /**
   * Confirma la firma capturada: SOLO actualiza la vista previa en memoria,
   * igual que confirmarFoto() -- el guardado real en MEDIA_ROOT ocurre al
   * imprimir (ver guardarMediosPendientes()).
   */
  confirmarFirma(): void {
    if (!this.empleadoSeleccionado || !this.firmaCanvasRef) return;
    const dataUrl = this.firmaCanvasRef.nativeElement.toDataURL('image/png');

    this.empleadoSeleccionado.firma = dataUrl;
    this.firmaPendiente = dataUrl;
    this.modalFirmaInstancia?.close();
    this.utils.MuestrasToast(TipoToast.Success, 'Firma lista. Se guardará al imprimir la credencial.');
    this.generarPreview();
  }
}
