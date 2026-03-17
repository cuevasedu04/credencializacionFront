import { Component, Input, ViewChild, ElementRef, TemplateRef, AfterViewInit, Output, EventEmitter, OnChanges, SimpleChanges, OnDestroy } from '@angular/core';
import { NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ModalManagerService } from '../../../components/shared/modal-manager.service';
import { EnrolamientoService } from '../../../services/enrolamiento.service';
import { UtilsService } from '../../../services/utils.service';
import { TipoToast } from '../../../../api/entidades/enumeraciones';
import { Router } from '@angular/router';
import { WacomService } from '../../../services/wacom.service';
import { Subscription } from 'rxjs';
import * as QRCode from 'qrcode';
import { NIVELES_CREDENCIAL, NivelCredencial, cargoANivel, getNivel, IMAGEN_FRENTE_FALLBACK, IMAGEN_REVERSO_FALLBACK } from '../../../shared/nivel-credencial.const';

@Component({
  standalone: false,
  selector: 'app-plantilla-enrolamiento',
  templateUrl: './plantilla-enrolamiento.component.html',
  styleUrls: ['./plantilla-enrolamiento.component.scss']
})
export class PlantillaEnrolamientoComponent implements AfterViewInit, OnChanges, OnDestroy {

  @Input() empleado: any = null;
  @Input() editable: boolean = false;
  @Input() isPrintMode: boolean = false;
  @Input() modeloCredencialSeleccionado: 'anam' | 'nuevoLaredo' = 'anam';
  @Output() enrolamientoCompletado = new EventEmitter<void>();

  // Modales y Elementos
  @ViewChild('modalCamara', { static: false }) modalCamara!: TemplateRef<any>;
  @ViewChild('modalFirma', { static: false }) modalFirma!: TemplateRef<any>;
  @ViewChild('videoElement') videoElement!: ElementRef;
  @ViewChild('canvasElement') canvasElement!: ElementRef;
  
  // Referencia al Canvas de Firma (dentro del modal)
  @ViewChild('firmaCanvas') firmaCanvas!: ElementRef<HTMLCanvasElement>;

  modalCamaraRef: NgbModalRef | undefined;
  modalFirmaRef: NgbModalRef | undefined;

  stream: MediaStream | null = null;
  fotoCapturada: string | null = null;
  guardando: boolean = false;
  vistaCredencial: 'frente' | 'reverso' = 'frente';
  fechaActual: Date = new Date();
  qrCodeDataUrl: string | null = null;

  // ----- NIVEL CREDENCIAL -----
  readonly niveles: NivelCredencial[] = NIVELES_CREDENCIAL;
  nivelActual: NivelCredencial = NIVELES_CREDENCIAL.find(n => n.valor === 'ENLACE')!;

  obtenerNivelActual(): NivelCredencial {
    const valor = this.empleado?.nivel_credencial || null;
    return getNivel(valor);
  }

  onNivelCambio(nuevoValor: string): void {
    if (this.empleado) {
      this.empleado.nivel_credencial = nuevoValor;
      this.nivelActual = getNivel(nuevoValor);
    }
  }

  // Variables Camara
  dispositivosVideo: MediaDeviceInfo[] = []; 
  camaraSeleccionadaId: string = '';
  
  // Variables para la Firma
  private cx!: CanvasRenderingContext2D | null;
  private isDrawing = false;
  
  // Variables Wacom
  private wacomSub: Subscription | null = null;
  public isWacomSupported = false;
  public wacomConnected = false;
  public debugInfo: string = 'Wacom: Desconectado';
  public firmaCargaMasiva: boolean = false;
  
  // Suavizado
  private lastX = 0;
  private lastY = 0;

  // ----------------------------
  // TIPO DE CREDENCIAL
  // ----------------------------
  esCredencialFamiliar(): boolean {
    if (!this.empleado) return false;

    const tipo = String(this.empleado.tipo_credencial || this.empleado.tipo || '').toLowerCase();
    const esFamiliarPorTipo = tipo.includes('familiar');
    const esFamiliarPorFlag = Number(this.empleado.familiar) === 1;

    // Compatibilidad con registros ya creados desde el módulo familiar
    // que no traen flag pero no manejan puesto.
    const puestoVacio = !this.empleado.puesto || String(this.empleado.puesto).trim() === '';
    const esFamiliarPorHeuristica = Number(this.empleado.provisional) === 1 && puestoVacio;

    return esFamiliarPorTipo || esFamiliarPorFlag || esFamiliarPorHeuristica;
  }

  obtenerImagenFrente(): string {
    if (this.esNuevoLaredo()) {
      return 'img/frontal_credencial.png';
    }
    if (this.esCredencialFamiliar()) {
      return 'img/frontalNLFamiliar.jpg';
    }
    const nivel = this.obtenerNivelActual();
    return nivel.imagenFrente;
  }

  obtenerImagenReverso(): string {
    if (this.esNuevoLaredo()) return 'img/reverso.jpg';
    const nivel = this.obtenerNivelActual();
    return nivel.imagenReverso;
  }

  esNuevoLaredo(): boolean {
    return this.modeloCredencialSeleccionado === 'nuevoLaredo';
  }

  mostrarCampoPuesto(): boolean {
    return !this.esCredencialFamiliar();
  }

  constructor(
    private modalManager: ModalManagerService,
    private enrolamientoApi: EnrolamientoService,
    private utils: UtilsService,
    private router: Router,
    private wacomService: WacomService
  ) {
    this.isWacomSupported = this.wacomService.isBrowserSupported();
  }

  ngOnDestroy(): void {
      if(this.wacomSub) this.wacomSub.unsubscribe();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['empleado'] && this.empleado) {
        this.corregirUrls();
        this.inicializarFechaExpedicion();
        this.generarQR();
        this.asignarFolioSiHaceFalta();
        this.empleado.nuevo_laredo = this.esNuevoLaredo() ? 1 : 0;
        // Auto-asignar nivel desde cargo si no viene guardado
        if (!this.empleado.nivel_credencial && this.empleado.puesto) {
          this.empleado.nivel_credencial = cargoANivel(this.empleado.puesto);
        }
        this.nivelActual = getNivel(this.empleado.nivel_credencial);
    }

    if (changes['modeloCredencialSeleccionado'] && this.empleado) {
      this.empleado.nuevo_laredo = this.esNuevoLaredo() ? 1 : 0;
      if (!this.empleado.id_enrolamiento) {
        this.empleado.folio = '';
        this.asignarFolioSiHaceFalta();
      }
    }
  }

  // ----------------------------
  // FOLIO DESDE BACKEND
  // ----------------------------
  private asignarFolioSiHaceFalta() {
    if (!this.empleado) return;
    if (this.empleado.folio && String(this.empleado.folio).trim() !== '') return;

    const nuevoLaredoFlag = this.esNuevoLaredo() ? 1 : 0;

    // Obtener siguiente folio desde el backend
    this.enrolamientoApi.obtenerFolioMaximo(nuevoLaredoFlag).subscribe({
      next: (res: any) => {
        if (res && res.status === 'success' && res.siguiente_folio) {
          this.empleado.folio = res.siguiente_folio;
        }
      },
      error: (err) => {
        console.error('Error al obtener folio:', err);
        this.utils.MuestrasToast(TipoToast.Warning, 'No se pudo obtener el folio automáticamente');
      }
    });
  }

  inicializarFechaExpedicion() {
    if (!this.empleado) return;
    
    // Establecer fecha_expedicion como el día de hoy si no existe
    if (!this.empleado.fecha_expedicion) {
      const hoy = new Date();
      this.empleado.fecha_expedicion = hoy.toISOString().split('T')[0]; // Formato: YYYY-MM-DD
    }
  }

  async generarQR() {
    if (!this.empleado) {
      this.qrCodeDataUrl = null;
      return;
    }


    // Construir el texto del QR con los datos separados por pipe |
    const datosQR = [
      this.empleado.id_enrolamiento || '',
      this.empleado.num_empleado || '',
      this.empleado.rfc || '',
      this.empleado.curp || '',
      this.empleado.nombre || '',
      this.empleado.paterno || '',
      this.empleado.materno || '',
      this.empleado.puesto || '',
      this.empleado.adscripcion || '',
      this.empleado.inicio_vig || '',
      this.empleado.fin_vig || '',
      this.empleado.eladia || '',
      this.empleado.folio || '',
      this.empleado.fecha_expedicion || '',
      this.empleado.fecha_registro || ''
    ].join('|');

    try {
      // Generar el QR como data URL con opciones optimizadas para impresión
      this.qrCodeDataUrl = await QRCode.toDataURL(datosQR, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 200,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
    } catch (error) {
      console.error('Error al generar código QR:', error);
      this.qrCodeDataUrl = null;
    }
  }

  corregirUrls() {
    const baseUrl = 'http://127.0.0.1:8000';

    // Detectar si la firma parece provenir de carga masiva (Excel/Base64 crudo o JPEG)
    this.firmaCargaMasiva = false;
    const firmaOriginal = typeof this.empleado?.firma === 'string' ? this.empleado.firma.trim().toLowerCase() : '';
    if (firmaOriginal) {
      const esData = firmaOriginal.startsWith('data:');
      const esHttp = firmaOriginal.startsWith('http');
      const esRutaArchivo = /\.(jpeg|jpg|png|gif|bmp|webp)$/i.test(firmaOriginal);
      const esDataJpeg = firmaOriginal.startsWith('data:image/jpeg') || firmaOriginal.startsWith('data:image/jpg');

      this.firmaCargaMasiva = esDataJpeg || (!esData && !esHttp && !esRutaArchivo);
    }
    
    const procesar = (str: string) => {
        if (!str) return null;
        // 1. Si ya tiene formato correcto (http o data URI), lo dejamos tal cual
        if (str.startsWith('http') || str.startsWith('data:')) return str;
        
        // 2. Si tiene extensión de imagen (.jpg, .png, etc), asumimos que es una RUTA relativa
        if (/\.(jpeg|jpg|png|gif|bmp|webp)$/i.test(str)) {
            return `${baseUrl}${str}`;
        }
        
        // 3. Si NO tiene extensión, asumimos que es contenido Base64 crudo
        return `data:image/jpeg;base64,${str}`;
    };

    this.empleado.foto = procesar(this.empleado.foto);

    const firmaProcesada = procesar(this.empleado.firma);
    if (!firmaProcesada) {
      this.empleado.firma = null;
      return;
    }

    // Normalizar firmas provenientes de carga masiva:
    // - Elimina fondo blanco
    // - Recorta márgenes vacíos
    // - Centra la firma en un lienzo transparente
    this.normalizarFirmaVisual(firmaProcesada)
      .then((firmaNormalizada) => {
        this.empleado.firma = firmaNormalizada;
      })
      .catch(() => {
        this.empleado.firma = firmaProcesada;
      });
  }

  private normalizarFirmaVisual(dataUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        try {
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;

          if (!w || !h) {
            resolve(dataUrl);
            return;
          }

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            resolve(dataUrl);
            return;
          }

          ctx.drawImage(img, 0, 0, w, h);

          // IMPORTANTE:
          // Si la firma tiene dimensiones/proporción típicas de captura manual
          // (canvas/tableta), NO aplicar normalización para conservar el comportamiento anterior.
          const ratio = w / h;
          const pareceFirmaManual = w <= 1000 && h <= 500 && ratio >= 1.5 && ratio <= 2.8;
          if (pareceFirmaManual) {
            resolve(dataUrl);
            return;
          }

          // Si la firma ya viene de tableta (normalmente PNG transparente),
          // no la normalizamos para no agrandarla ni moverla.
          const esPng = dataUrl.startsWith('data:image/png');
          if (esPng) {
            const originalData = ctx.getImageData(0, 0, w, h).data;
            let tieneTransparencia = false;
            for (let i = 3; i < originalData.length; i += 4) {
              if (originalData[i] < 250) {
                tieneTransparencia = true;
                break;
              }
            }
            if (tieneTransparencia) {
              resolve(dataUrl);
              return;
            }
          }

          const imgData = ctx.getImageData(0, 0, w, h);
          const px = imgData.data;

          // 1) Quitar fondo blanco (o casi blanco)
          for (let i = 0; i < px.length; i += 4) {
            const r = px[i];
            const g = px[i + 1];
            const b = px[i + 2];
            if (r > 240 && g > 240 && b > 240) {
              px[i + 3] = 0;
            }
          }
          ctx.putImageData(imgData, 0, 0);

          // 2) Encontrar bounding box útil (pixeles de trazo real)
          //    Usamos alpha + oscuridad para evitar tomar ruido/grises del fondo.
          const data2 = ctx.getImageData(0, 0, w, h).data;
          let minX = w;
          let minY = h;
          let maxX = -1;
          let maxY = -1;

          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const idx = (y * w + x) * 4;
              const r = data2[idx];
              const g = data2[idx + 1];
              const b = data2[idx + 2];
              const alpha = data2[idx + 3];
              const oscuridad = r + g + b;
              if (alpha > 24 && oscuridad < 690) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
              }
            }
          }

          // Si no hay trazo útil, devolvemos original
          if (maxX < 0 || maxY < 0) {
            resolve(dataUrl);
            return;
          }

          const cropW = maxX - minX + 1;
          const cropH = maxY - minY + 1;

          // 3) Redibujar firma con padding proporcional (sin forzar proporción fija)
          //    para evitar que se vea alargada.
          const padX = Math.max(20, Math.round(cropW * 0.18));
          const padY = Math.max(12, Math.round(cropH * 0.25));
          const outW = cropW + padX * 2;      // aqui ajustamos si necesitamos más grande o chica la firma, pero siempre proporcional al contenido real
          const outH = cropH + padY * 2;
          const out = document.createElement('canvas');
          out.width = outW;
          out.height = outH;
          const outCtx = out.getContext('2d');

          if (!outCtx) {
            resolve(dataUrl);
            return;
          }

          outCtx.clearRect(0, 0, outW, outH);
          outCtx.drawImage(canvas, minX, minY, cropW, cropH, padX, padY, cropW, cropH);

          resolve(out.toDataURL('image/png'));
        } catch {
          resolve(dataUrl);
        }
      };

      img.onerror = () => reject();
      img.src = dataUrl;
    });
  }

  ngAfterViewInit(): void {
    // No inicializamos el canvas aquí porque está dentro de un <ng-template> (Modal)
    // Se inicializa cuando se abre el modal.
  }

  // ==========================================
  // HELPER: Separar apellidos desde un solo input
  // ==========================================
  separarApellidos(valor: string) {
    if (!this.empleado) return;
    const partes = (valor || '').trim().split(/\s+/);
    if (partes.length >= 2) {
      this.empleado.paterno = partes[0];
      this.empleado.materno = partes.slice(1).join(' ');
    } else {
      this.empleado.paterno = valor;
      this.empleado.materno = '';
    }
  }

  // ==========================================
  // LÓGICA DE FOTO (CÁMARA EXT. O WEBCAM)
  // ==========================================
  abrirCamara() {
    if (!this.modalCamara) {
      this.utils.MuestrasToast(TipoToast.Warning, 'No se pudo abrir el modal de foto. Recargue la vista e intente de nuevo.');
      return;
    }
    this.fotoCapturada = null;
    this.modalCamaraRef = this.modalManager.openModal({
      title: 'Captura de Fotografía',
      template: this.modalCamara,
      width: '600px',
      showFooter: false
    });
    // Intentamos iniciar webcam por si acaso, pero daremos opción de subir archivo
    this.iniciarCamara();
  }

  async iniciarCamara(deviceId?: string) {
    this.detenerCamara();

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const constraints = { 
            video: deviceId ? { deviceId: { exact: deviceId } } : true 
        };

        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        setTimeout(() => {
          if(this.videoElement) this.videoElement.nativeElement.srcObject = this.stream;
        }, 100);

        // Listar dispositivos (ahora que tenemos permisos)
        const devices = await navigator.mediaDevices.enumerateDevices();
        this.dispositivosVideo = devices.filter(d => d.kind === 'videoinput');
        
        // Actualizar el ID seleccionado
        const track = this.stream?.getVideoTracks()[0];
        if (track) {
            const settings = track.getSettings();
            if (settings.deviceId) this.camaraSeleccionadaId = settings.deviceId;
        }

      } catch (err) {
        console.warn('Error al iniciar cámara:', err);
        this.utils.MuestrasToast(TipoToast.Warning, 'No se pudo acceder a la cámara. Verifique los permisos.');
      }
    }
  }

  cambiarCamara(event: any) {
     this.iniciarCamara(event.target.value);
  }

  // Opción A: Captura desde Webcam
  capturarFoto() {
    if (!this.videoElement) return;
    const video = this.videoElement.nativeElement;
    const canvas = this.canvasElement.nativeElement;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    this.fotoCapturada = canvas.toDataURL('image/jpeg');
    this.detenerCamara();
  }

  // Opción B: Subir archivo (Para Cámara Profesional Externa)
  onArchivoSeleccionado(event: any) {
    const file = event.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB límite
        this.utils.MuestrasToast(TipoToast.Warning, 'La imagen es muy pesada. Máximo 5MB.');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = () => {
        this.fotoCapturada = reader.result as string;
        this.detenerCamara(); // Ya no necesitamos el video si subieron foto
      };
      reader.readAsDataURL(file);
    }
  }

  confirmarFoto() {
    if (this.fotoCapturada && this.empleado) {
      this.empleado.foto = this.fotoCapturada;
      this.generarQR(); // Regenerar QR después de actualizar datos
      if (this.modalCamaraRef) {
        this.modalCamaraRef.close();
      } else {
        this.modalManager.closeModal();
      }
    }
  }

  detenerCamara() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
  }


  // ==========================================
  // LÓGICA DE FIRMA (CANVAS + TOUCH + WACOM)
  // ==========================================
  
  async conectarWacom() {
    this.wacomConnected = await this.wacomService.conectar();
    
    if (this.wacomConnected) {
      if (this.wacomSub) this.wacomSub.unsubscribe();
      
      this.wacomSub = this.wacomService.getPenData().subscribe((data) => {
        this.procesarTrazoWacom(data);
      });
      
      this.utils.MuestrasToast(TipoToast.Success, 'Tableta Wacom Conectada');
    } else {
       this.utils.MuestrasToast(TipoToast.Error, 'No se pudo conectar la tableta. Verifique conexión USB y permisos.');
    }
  }

  procesarTrazoWacom(data: any) {
    if (!this.cx || !data) return;
    
    // Si la presión es 0, forzamos isDown a false para evitar trazos fantasma
    const isPenDown = data.pressure > 0;

    const info = this.wacomService.getTabletInfo();
    
    // CALIBRACION WACOM STU-430
    // Ignoramos los valores reportados por getTabletInfo() si son enormes (ej 32000)
    // Usamos los máximos observados por el usuario como referencia (9727 x 6016)
    const tabletW = 9750; // Ajustado un poco arriba de 9727
    const tabletH = 6100; // Ajustado un poco arriba de 6016

    const canvasEl = this.firmaCanvas.nativeElement;
    
    // Mapeo de coordenadas
    const x = (data.x / tabletW) * canvasEl.width;
    const y = (data.y / tabletH) * canvasEl.height;

    // Logica de dibujo con Interpolación Cuadrática para suavizado
    if (data.isDown) {
       if (!this.isDrawing) {
           this.isDrawing = true;
           this.cx.beginPath();
           this.cx.moveTo(x, y);
           this.lastX = x;
           this.lastY = y;
       } else {
           // Calcular punto medio
           const midX = (this.lastX + x) / 2;
           const midY = (this.lastY + y) / 2;
           
           // Curva quadratica hacia el punto medio usando lastX/lastY como control
           // Esto suaviza los vertices agudos
           this.cx.quadraticCurveTo(this.lastX, this.lastY, midX, midY);
           this.cx.stroke();
           
           // Actualizar ultimo punto conocido
           this.lastX = x;
           this.lastY = y;
       }
    } else {
       if (this.isDrawing) {
           // Trazar el último segmento que faltó
           this.cx.lineTo(this.lastX, this.lastY); 
           this.cx.stroke();
           
           this.isDrawing = false;
           this.cx.closePath();
       }
    }
  }

  abrirFirma() {
    if (!this.modalFirma) {
      this.utils.MuestrasToast(TipoToast.Warning, 'No se pudo abrir el modal de firma. Recargue la vista e intente de nuevo.');
      return;
    }
    this.modalFirmaRef = this.modalManager.openModal({
      title: 'Captura de Firma',
      template: this.modalFirma,
      width: '500px',
      showFooter: true,
      onAccept: () => this.confirmarFirma()
    });

    // Esperamos un poco a que el modal se renderice para obtener el contexto del canvas
    setTimeout(() => {
      this.inicializarCanvasFirma();
      // Si la tableta ya estaba conectada, limpiamos el pad físico
      if (this.wacomConnected) {
          this.wacomService.limpiarPantalla();
      }
    }, 200);
  }

  inicializarCanvasFirma() {
    const canvasEl = this.firmaCanvas.nativeElement;
    
    // Configuración de Alta Resolución
    const scale = 2; // Multiplicador de densidad de píxeles (2x o 3x)
    
    // Desynchronized hint para menor latencia en Chrome
    this.cx = canvasEl.getContext('2d', { desynchronized: true });

    // Ajustamos tamaño interno del canvas al doble del visual (Retina/HiDPI support)
    // Esto aumenta la resolución de dibujo y elimina el pixelado
    canvasEl.width = canvasEl.offsetWidth * scale;
    canvasEl.height = canvasEl.offsetHeight * scale;

    if (this.cx) {
      // Escalamos el grosor del pincel proporcionalmente
      this.cx.lineWidth = 3 * scale; 
      this.cx.lineCap = 'round';
      this.cx.lineJoin = 'round'; // Uniones suavizadas
      this.cx.strokeStyle = '#000000';
    }
  }

  // --- Eventos de Dibujo (Soporte Mouse y Touch) ---
  
  startDrawing(event: MouseEvent | TouchEvent): void {
    // Si estamos recibiendo datos de Wacom, ignorar mouse para evitar conflictos
    if(this.wacomConnected && this.isDrawing) return; 

    this.isDrawing = true;
    const { x, y } = this.getCoordinates(event);
    this.draw(x, y);
  }

  moveDrawing(event: MouseEvent | TouchEvent): void {
    if(this.wacomConnected) return; // Prioridad Wacom si está conectada
    
    if (!this.isDrawing) return;
    const { x, y } = this.getCoordinates(event);
    this.draw(x, y);
    event.preventDefault(); // Evita scroll en tabletas al firmar
  }

  stopDrawing(): void {
    if(this.wacomConnected) return; // Wacom maneja su propio isDrawing via isDown

    if (!this.isDrawing) return;
    this.isDrawing = false;
    this.cx?.beginPath(); // Resetea el path para no unir líneas separadas
  }

  draw(x: number, y: number): void {
    if (!this.cx) return;
    this.cx.lineTo(x, y);
    this.cx.stroke();
    this.cx.beginPath();
    this.cx.moveTo(x, y);
  }

  // Helper para obtener coordenadas (normaliza Mouse vs Touch)
  private getCoordinates(event: MouseEvent | TouchEvent): { x: number, y: number } {
    const canvasEl = this.firmaCanvas.nativeElement;
    const rect = canvasEl.getBoundingClientRect();
    
    let clientX, clientY;

    if (event instanceof TouchEvent) {
      // Es toque
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else {
      // Es mouse
      clientX = event.clientX;
      clientY = event.clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  limpiarFirma() {
    const canvasEl = this.firmaCanvas.nativeElement;
    this.cx?.clearRect(0, 0, canvasEl.width, canvasEl.height);
    // Limpiar también tableta física
    this.wacomService.limpiarPantalla();
  }

  confirmarFirma() {
    const canvasEl = this.firmaCanvas.nativeElement;
    // Guardamos la firma en base64 (PNG para transparencia)
    const dataUrl = canvasEl.toDataURL('image/png');
    
    // Validamos que no esté vacía (un canvas vacío tiene poco peso, pero mejor validar si se dibujó algo)
    // Una validación simple es ver si dataUrl es muy corta, pero asumiremos que firmaron.
    if (this.empleado) {
      this.empleado.firma = dataUrl;
      if (this.modalFirmaRef) {
        this.modalFirmaRef.close();
      } else {
        this.modalManager.closeModal();
      }
    }
  }

guardarEnrolamiento() {
    // Validaciones básicas
    if (!this.empleado) return;
    
    if(!this.empleado.foto || !this.empleado.firma) {
      this.utils.MuestrasToast(TipoToast.Warning, 'Falta capturar foto o firma');
      return;
    }

    this.guardando = true;

    // Formatear fecha_expedicion para enviar solo la fecha (YYYY-MM-DD) sin hora
    let fechaExpedicionFormateada = this.empleado.fecha_expedicion;
    if (fechaExpedicionFormateada) {
      if (fechaExpedicionFormateada instanceof Date) {
        fechaExpedicionFormateada = fechaExpedicionFormateada.toISOString().split('T')[0];
      } else if (typeof fechaExpedicionFormateada === 'string') {
        fechaExpedicionFormateada = fechaExpedicionFormateada.split('T')[0];
      }
    }

    // Establecer fecha_enrolamiento con la fecha y hora actual en formato ISO
    const fechaEnrolamientoActual = new Date().toISOString();

    // Preparamos los datos a enviar (Payload)
    // Solo mandamos lo que queremos actualizar para ahorrar ancho de banda
    const payload = {
        num_empleado: this.empleado.num_empleado,
        rfc: this.empleado.rfc,
        curp: this.empleado.curp,
        nombre: this.empleado.nombre,
        paterno: this.empleado.paterno,
        materno: this.empleado.materno,
        puesto: this.empleado.puesto,
        adscripcion: this.empleado.adscripcion,
        inicio_vig: this.empleado.inicio_vig,
        fin_vig: this.empleado.fin_vig,
        eladia: this.empleado.eladia,
        fecha_expedicion: fechaExpedicionFormateada,
        folio: this.empleado.folio,
        fecha_enrolamiento: fechaEnrolamientoActual,
        nuevo_laredo: this.esNuevoLaredo() ? 1 : 0,
        nivel_credencial: this.empleado.nivel_credencial || cargoANivel(this.empleado.puesto),
        layout_credencial: this.esNuevoLaredo() ? null : (this.empleado.layout_credencial || 'ANAM_2025')
    };

    // Detectamos si es una CREACIÓN o una ACTUALIZACIÓN
    const id = this.empleado.id_enrolamiento;

    if (id) {
        // CASO ACTUALIZAR: primero guardar foto/firma en safirho_db, luego PATCH
        this.enrolamientoApi.guardarFotoFirma(id, this.empleado.foto, this.empleado.firma).subscribe({
            next: () => {
                this.enrolamientoApi.actualizarExpediente(id, payload).subscribe({
                    next: (resp) => {
                        this.guardando = false;
                        this.utils.MuestrasToast(TipoToast.Success, 'Enrolamiento completado exitosamente');
                        this.enrolamientoCompletado.emit();
                        this.empleado = null;
                    },
                    error: (err) => {
                        this.guardando = false;
                        this.utils.MuestraErrorInterno(err);
                    }
                });
            },
            error: (err) => {
                this.guardando = false;
                this.utils.MuestraErrorInterno(err);
            }
        });
    } else {
        this.guardando = false;
        this.utils.MuestrasToast(TipoToast.Error, 'Error: No se encontró el ID del expediente para actualizar');
    }
  }
}