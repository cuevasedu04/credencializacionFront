import { Component, OnInit, OnDestroy, ViewChild, ElementRef, TemplateRef } from '@angular/core';
import { CargaMasivaService, CargaMasivaRegistro, ProgresoLote } from '../../services/carga-masiva.service';
import { UtilsService } from '../../services/utils.service';
import { TipoToast } from '../../../api/entidades/enumeraciones';
import { ModalManagerService } from '../../components/shared/modal-manager.service';
import { WacomService } from '../../services/wacom.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-enrolamiento-masivo',
  templateUrl: './enrolamiento-masivo.component.html',
  styleUrls: ['./enrolamiento-masivo.component.scss'],
  standalone: false
})
export class EnrolamientoMasivoComponent implements OnInit, OnDestroy {
  @ViewChild('modalUnificado') modalUnificado!: TemplateRef<any>;
  @ViewChild('confirmDialog') confirmDialog!: TemplateRef<any>;
  confirmMessage: string = '';

  // Camara
  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasElement') canvasElement!: ElementRef<HTMLCanvasElement>;
  dispositivosVideo: MediaDeviceInfo[] = [];
  camaraSeleccionadaId: string = '';
  stream: MediaStream | null = null;
  fotoCapturada: string | null = null;

  // Firma
  @ViewChild('firmaCanvas') firmaCanvas!: ElementRef<HTMLCanvasElement>;
  private cx: CanvasRenderingContext2D | null = null;
  private isDrawing = false;
  firmaCapturada: string | null = null;

  // Wacom
  private wacomSub: Subscription | null = null;
  isWacomSupported = false;
  wacomConnected = false;

  // Estado y Progreso Lote
  loteActual: string = '';
  progreso: ProgresoLote = { lote: '', total_enrolados: 0, total_fotografias: 0, total_firmas: 0, registros: [] };
  
  // Paginacion Registro Actual
  registroActualIndex: number = 0;
  registroEnFormulario: CargaMasivaRegistro = this.crearRegistroVacio();

  modoEdicion: boolean = false;
  guardando: boolean = false;

  get hayRegistrosIncompletos(): boolean {
    if (!this.progreso || !this.progreso.registros) return false;
    return this.progreso.registros.some(r => !r.foto || !r.firma || r.firma === this.crearCanvasVacioBase64() || !r.rfc || r.rfc.trim().length <= 4);
  }

  constructor(
    private cargaMasivaService: CargaMasivaService,
    private utils: UtilsService,
    private modalManager: ModalManagerService,
    private wacomService: WacomService
  ) {
    this.isWacomSupported = this.wacomService.isBrowserSupported();
  }

  ngOnInit(): void {
    const savedLote = localStorage.getItem('sicre_enrolamiento_masivo_lote');
    if (savedLote) {
      this.loteActual = savedLote;
      this.cargarProgreso();
    } else {
      this.solicitarNuevoLote();
    }
  }

  solicitarNuevoLote(callback?: () => void) {
    this.cargaMasivaService.obtenerSiguienteLote().subscribe({
      next: (res) => {
        this.loteActual = res.lote;
        localStorage.setItem('sicre_enrolamiento_masivo_lote', this.loteActual);
        this.progreso = { lote: this.loteActual, total_enrolados: 0, total_fotografias: 0, total_firmas: 0, registros: [] };
        if (callback) callback();
      },
      error: () => this.utils.MuestrasToast(TipoToast.Error, 'Error al obtener nuevo número de lote')
    });
  }

  ngOnDestroy(): void {
    this.detenerCamara();
    if(this.wacomSub) this.wacomSub.unsubscribe();
  }

  crearRegistroVacio(): CargaMasivaRegistro {
    return { lote: this.loteActual || '', rfc: '', nombre: '', foto: '', firma: '' };
  }

  cargarProgreso() {
    if (!this.loteActual) return;
    this.cargaMasivaService.obtenerProgresoLote(this.loteActual).subscribe({
      next: (res) => {
        this.progreso = res;
      },
      error: () => this.utils.MuestrasToast(TipoToast.Error, 'No se pudo cargar el progreso del lote')
    });
  }

  comenzarEnrolamiento() {
    if (!this.loteActual) {
      this.solicitarNuevoLote(() => this.abrirModalEnrolamiento());
    } else {
      this.abrirModalEnrolamiento();
    }
  }

  abrirModalEnrolamiento() {
    this.modoEdicion = false;
    this.registroActualIndex = this.progreso.total_enrolados;
    this.registroEnFormulario = this.crearRegistroVacio();

    this.fotoCapturada = null;
    this.firmaCapturada = null;

    this.modalManager.openModal({
      title: 'Captura Continua',
      template: this.modalUnificado,
      showFooter: false,
      width: '95vw',
      onCancel: () => this.terminarModal()
    });

    setTimeout(() => {
      this.iniciarCamara();
      this.inicializarCanvasFirma();
    }, 500);
  }

  editarRegistro(reg: CargaMasivaRegistro, index: number) {
    this.modoEdicion = true;
    this.registroActualIndex = index;
    // deep copy
    this.registroEnFormulario = { ...reg };
    this.fotoCapturada = reg.foto || null;
    // La firma si es el placeholder vacio no la cargamos como firma
    this.firmaCapturada = (reg.firma && reg.firma !== this.crearCanvasVacioBase64()) ? reg.firma : null;

    this.modalManager.openModal({
      title: 'Editar Registro',
      template: this.modalUnificado,
      showFooter: false,
      width: '95vw',
      onCancel: () => this.terminarModal()
    });

    setTimeout(() => {
      this.iniciarCamara();
      this.inicializarCanvasFirma();
      // Dibujar la firma preexistente
      if (this.firmaCapturada && this.firmaCanvas && this.cx) {
         const img = new Image();
         img.onload = () => {
             this.cx!.drawImage(img, 0, 0);
         };
         img.src = this.firmaCapturada;
      }
    }, 500);
  }

  cancelarEnrolamiento() {
    if (!this.loteActual) return;
    this.confirmMessage = '¿Deseas cancelar el proceso? Se eliminarán los registros actuales.';
    this.modalManager.openModal({
      title: 'Confirmación',
      template: this.confirmDialog,
      onAccept: () => {
        this.cargaMasivaService.cancelarLote(this.loteActual).subscribe({
          next: () => {
            this.utils.MuestrasToast(TipoToast.Success, 'Lote cancelado');
            this.limpiarLote();
          },
          error: () => this.utils.MuestrasToast(TipoToast.Error, 'Error al cancelar')
        });
      }
    });
  }

  terminarEnrolamiento() {
    if (!this.loteActual) return;
    this.confirmMessage = '¿Estás seguro de que quieres finalizar el enrolamiento de este lote?';
    this.modalManager.openModal({
      title: 'Confirmación',
      template: this.confirmDialog,
      onAccept: () => {
        this.utils.MuestrasToast(TipoToast.Success, 'Lote finalizado correctamente.');
        this.limpiarLote();
      }
    });
  }

  limpiarLote() {
    this.loteActual = '';
    localStorage.removeItem('sicre_enrolamiento_masivo_lote');
    this.progreso = { lote: '', total_enrolados: 0, total_fotografias: 0, total_firmas: 0, registros: [] };
  }

  siguienteEmpleado() {
    if (!this.isFotoVerde() || !this.isFirmaVerde() || !this.isDatosVerde()) {
      this.utils.MuestrasToast(TipoToast.Warning, 'Falta capturar Foto, Firma o RFC');
      return;
    }

    this.guardando = true;
    this.registroEnFormulario.foto = this.fotoCapturada!;
    this.registroEnFormulario.firma = this.firmaCapturada || this.obtenerFirmaDeCanvas()!;
    this.registroEnFormulario.lote = this.loteActual;

    this.cargaMasivaService.autoGuardar(this.registroEnFormulario).subscribe({
      next: (res) => {
        this.utils.MuestrasToast(TipoToast.Success, 'Registro guardado');
        this.guardando = false;
        
        // --- LOCAL UPDATE INSTEAD OF HTTP RELOAD ---
        this.progreso.total_enrolados++;
        if (this.registroEnFormulario.foto) this.progreso.total_fotografias++;
        if (this.registroEnFormulario.firma) this.progreso.total_firmas++;
        
        // Creamos una copia local con las base64 actuales
        this.progreso.registros.push(res);
        // ------------------------------------------

        this.registroActualIndex++;
        this.registroEnFormulario = this.crearRegistroVacio();
        this.fotoCapturada = null;
        this.firmaCapturada = null;
        this.limpiarFirma();
        
        // La cámara y el canvas mantienen su state gracias a [hidden]="guardando", por lo que no es necesario reiniciarlos y apagarlos.
      },
      error: () => {
        this.guardando = false;
        this.utils.MuestrasToast(TipoToast.Error, 'Error al auto-guardar');
      }
    });
  }

  guardarEdicion() {
    this.terminarModal();
  }

  terminarModal() {
    const rfCargado = this.registroEnFormulario.rfc && this.registroEnFormulario.rfc.trim().length > 0;
    const canvasCargado = this.obtenerFirmaDeCanvas() && this.obtenerFirmaDeCanvas() !== this.crearCanvasVacioBase64();
    const isParcial = this.fotoCapturada || canvasCargado || rfCargado || this.firmaCapturada;
    
    const finalize = () => {
        this.detenerCamara();
        if (this.wacomSub) {
            this.wacomSub.unsubscribe();
            this.wacomSub = null;
        }
        this.cargarProgreso(); 
        this.modalManager.closeModal();
    };

    if (isParcial && rfCargado) {
        this.registroEnFormulario.foto = this.fotoCapturada!;
        this.registroEnFormulario.firma = this.firmaCapturada || this.obtenerFirmaDeCanvas()!;
        this.registroEnFormulario.lote = this.loteActual;
        this.cargaMasivaService.autoGuardar(this.registroEnFormulario).subscribe({
           next: () => finalize(),
           error: () => finalize()
        });
    } else {
        finalize();
    }
  }

  isFotoVerde(): boolean { return !!this.fotoCapturada; }
  isFirmaVerde(): boolean { return !!this.firmaCapturada || (this.obtenerFirmaDeCanvas() !== null && this.obtenerFirmaDeCanvas() !== this.crearCanvasVacioBase64()); }
  isDatosVerde(): boolean { return !!(this.registroEnFormulario.rfc && this.registroEnFormulario.rfc.trim().length > 4); }

  private _emptyCanvasCache: string | null = null;
  private crearCanvasVacioBase64(): string {
     if (this._emptyCanvasCache) return this._emptyCanvasCache;
     const c = document.createElement('canvas');
     c.width = 400; c.height = 250;
     this._emptyCanvasCache = c.toDataURL('image/png');
     return this._emptyCanvasCache;
  }

  async iniciarCamara(deviceId?: string) {
    this.detenerCamara();
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const constraints = {
          video: deviceId ? { deviceId: { exact: deviceId } } : true,
          audio: false
        };
        const st = await navigator.mediaDevices.getUserMedia(constraints);
        this.stream = st;
        await this.listarCamaras();
        setTimeout(() => {
          if (this.videoElement) {
            this.videoElement.nativeElement.srcObject = st;
          }
        }, 100);
      } catch (err) {
        console.error('Error cámara:', err);
      }
    }
  }

  async listarCamaras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.dispositivosVideo = devices.filter(d => d.kind === 'videoinput');
      if (!this.camaraSeleccionadaId && this.dispositivosVideo.length > 0) {
        this.camaraSeleccionadaId = this.dispositivosVideo[0].deviceId;
      }
    } catch {}
  }

  cambiarCamara(event: any) {
    this.iniciarCamara(event.target.value);
  }

  detenerCamara() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  }

  capturarFoto() {
    if (!this.videoElement || !this.canvasElement) return;
    const video = this.videoElement.nativeElement;
    const canvas = this.canvasElement.nativeElement;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      this.fotoCapturada = canvas.toDataURL('image/jpeg');
    }
  }

  repetirFoto() {
    this.fotoCapturada = null;
    // No detenemos ni reiniciamos la cámara, pues el stream sigue vivo en background.
  }

  inicializarCanvasFirma() {
    if (!this.firmaCanvas) return;
    const canvasEl = this.firmaCanvas.nativeElement;
    this.cx = canvasEl.getContext('2d');
    if (this.cx) {
      this.cx.lineWidth = 3;
      this.cx.lineCap = 'round';
      this.cx.lineJoin = 'round';
      this.cx.strokeStyle = '#000000';
    }
  }

  getCoordinates(event: MouseEvent | TouchEvent): { x: number, y: number } {
    const canvasEl = this.firmaCanvas.nativeElement;
    const rect = canvasEl.getBoundingClientRect();
    const scaleX = canvasEl.width / rect.width;
    const scaleY = canvasEl.height / rect.height;
    let clientX, clientY;
    if (event instanceof MouseEvent) {
      clientX = event.clientX;
      clientY = event.clientY;
    } else {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    }
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  draw(x: number, y: number): void {
    if (!this.cx) return;
    this.cx.lineTo(x, y);
    this.cx.stroke();
  }

  startDrawing(event: MouseEvent | TouchEvent): void {
    if (this.wacomConnected || !this.cx) return;
    this.isDrawing = true;
    const { x, y } = this.getCoordinates(event);
    this.cx.beginPath();
    this.cx.moveTo(x, y);
  }

  moveDrawing(event: MouseEvent | TouchEvent): void {
    if (this.wacomConnected || !this.isDrawing) return;
    const { x, y } = this.getCoordinates(event);
    this.draw(x, y);
    event.preventDefault();
  }

  stopDrawing(): void {
    if(this.wacomConnected || !this.isDrawing) return;
    this.isDrawing = false;
    this.cx?.closePath();
    this.guardarFirmaTemporal();
  }

  async conectarWacom() {
    this.wacomConnected = await this.wacomService.conectar();
    if (this.wacomConnected) {
      if (this.wacomSub) this.wacomSub.unsubscribe();
      this.wacomSub = this.wacomService.getPenData().subscribe((data) => {
        this.procesarTrazoWacom(data);
      });
      this.utils.MuestrasToast(TipoToast.Success, 'Tableta Wacom Conectada');
    } else {
      this.utils.MuestrasToast(TipoToast.Error, 'No se pudo conectar la tableta.');
    }
  }

  procesarTrazoWacom(data: any) {
    if (!this.cx || !data) return;
    const isPenDown = data.pressure > 0;
    const tabletW = 9750;
    const tabletH = 6100;

    const x = (data.x / tabletW) * this.firmaCanvas.nativeElement.width;
    const y = (data.y / tabletH) * this.firmaCanvas.nativeElement.width;

    if (isPenDown) {
      if (!this.isDrawing) {
        this.isDrawing = true;
        this.cx.beginPath();
        this.cx.moveTo(x, y);
      } else {
        this.cx.lineTo(x, y);
        this.cx.stroke();
      }
    } else {
      if (this.isDrawing) {
        this.isDrawing = false;
        this.cx.closePath();
        this.guardarFirmaTemporal();
      }
    }
  }

  limpiarFirma() {
    this.firmaCapturada = null;
    if(this.firmaCanvas && this.cx) {
      const canvasEl = this.firmaCanvas.nativeElement;
      this.cx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      if(this.wacomConnected) this.wacomService.limpiarPantalla();
    }
  }

  guardarFirmaTemporal() {
    if (this.firmaCanvas) {
      this.firmaCapturada = this.firmaCanvas.nativeElement.toDataURL('image/png');
    }
  }

  obtenerFirmaDeCanvas(): string | null {
    if (!this.firmaCanvas) return null;
    return this.firmaCanvas.nativeElement.toDataURL('image/png');
  }

  onArchivoFotoSeleccionado(event: any) {
    const file = event.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        this.utils.MuestrasToast(TipoToast.Warning, 'La imagen es muy pesada. Máximo 5MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        this.fotoCapturada = reader.result as string;
        this.detenerCamara();
      };
      reader.readAsDataURL(file);
    }
  }

  onArchivoFirmaSeleccionado(event: any) {
    const file = event.target?.files?.[0];
    if (!file) return;

    if (!file.type?.startsWith('image/')) {
      this.utils.MuestrasToast(TipoToast.Warning, 'El archivo de firma debe ser una imagen válida.');
      event.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.utils.MuestrasToast(TipoToast.Warning, 'La imagen de firma es muy pesada. Máximo 5MB.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrlOriginal = reader.result as string;
      let dataUrlProcesado = dataUrlOriginal;

      try {
        dataUrlProcesado = await this.normalizarFirmaDesdeArchivo(dataUrlOriginal);
      } catch {
        dataUrlProcesado = dataUrlOriginal;
      }

      this.firmaCapturada = dataUrlProcesado;

      const img = new Image();
      img.onload = () => {
        if (!this.cx) {
          this.inicializarCanvasFirma();
        }
        if (!this.cx) return;

        const canvasEl = this.firmaCanvas.nativeElement;
        this.cx.clearRect(0, 0, canvasEl.width, canvasEl.height);

        const scale = Math.min(canvasEl.width / img.width, canvasEl.height / img.height);
        const drawWidth = img.width * scale;
        const drawHeight = img.height * scale;
        const x = (canvasEl.width - drawWidth) / 2;
        const y = (canvasEl.height - drawHeight) / 2;

        this.cx.drawImage(img, x, y, drawWidth, drawHeight);
        this.guardarFirmaTemporal();
      };
      img.src = dataUrlProcesado;
      event.target.value = '';
    };
    reader.readAsDataURL(file);
  }

  private normalizarFirmaDesdeArchivo(dataUrl: string): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;

          if (!w || !h) { resolve(dataUrl); return; }

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) { resolve(dataUrl); return; }

          ctx.drawImage(img, 0, 0, w, h);
          const imgData = ctx.getImageData(0, 0, w, h);
          const px = imgData.data;

          for (let i = 0; i < px.length; i += 4) {
            if (px[i] > 240 && px[i + 1] > 240 && px[i + 2] > 240) px[i + 3] = 0;
          }
          ctx.putImageData(imgData, 0, 0);

          const data2 = ctx.getImageData(0, 0, w, h).data;
          let minX = w, minY = h, maxX = -1, maxY = -1;

          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const idx = (y * w + x) * 4;
              const alpha = data2[idx + 3];
              const oscuridad = data2[idx] + data2[idx + 1] + data2[idx + 2];
              if (alpha > 24 && oscuridad < 690) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
              }
            }
          }

          if (maxX < 0 || maxY < 0) { resolve(dataUrl); return; }

          const cropW = maxX - minX + 1;
          const cropH = maxY - minY + 1;
          const padX = Math.max(24, Math.round(cropW * 0.24));
          const padY = Math.max(16, Math.round(cropH * 0.34));
          const outW = cropW + padX * 2;
          const outH = cropH + padY * 2;

          const out = document.createElement('canvas');
          out.width = outW;
          out.height = outH;
          const outCtx = out.getContext('2d');
          if (!outCtx) { resolve(dataUrl); return; }

          outCtx.clearRect(0, 0, outW, outH);
          outCtx.drawImage(canvas, minX, minY, cropW, cropH, padX, padY, cropW, cropH);
          resolve(out.toDataURL('image/png'));
        } catch { resolve(dataUrl); }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }
}








