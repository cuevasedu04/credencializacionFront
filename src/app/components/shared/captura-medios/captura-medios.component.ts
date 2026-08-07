import {
  ChangeDetectorRef, Component, ElementRef, EventEmitter, OnDestroy, Output, TemplateRef, ViewChild,
} from '@angular/core';
import { Subscription } from 'rxjs';

import { TipoToast } from '../../../../api/entidades/enumeraciones';
import { UtilsService } from '../../../services/utils.service';
import { ModalManagerService } from '../modal-manager.service';
import { WacomService } from '../../../services/wacom.service';
import { motivoSinCamara, motivoSinWacom, soportaCamara } from '../../../services/soporte-navegador';

/**
 * Captura de foto y firma reutilizable.
 *
 * Encapsula los dos modales (camara y firma) que hasta ahora se copiaban en
 * cada pantalla que los necesitaba. Emite el resultado como data-URL y no
 * sabe nada de a donde se guarda: eso lo decide quien lo usa.
 *
 * Uso:
 *   <app-captura-medios #captura
 *       (fotoLista)="..." (firmaLista)="...">
 *   </app-captura-medios>
 *   captura.abrirFoto();  /  captura.abrirFirma();
 */
@Component({
  standalone: false,
  selector: 'app-captura-medios',
  templateUrl: './captura-medios.component.html',
  styleUrls: ['./captura-medios.component.scss'],
})
export class CapturaMediosComponent implements OnDestroy {

  @Output() fotoLista = new EventEmitter<string>();
  @Output() firmaLista = new EventEmitter<string>();

  @ViewChild('modalCamara') modalCamara!: TemplateRef<any>;
  @ViewChild('modalFirma') modalFirma!: TemplateRef<any>;
  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasCaptura') canvasCaptura!: ElementRef<HTMLCanvasElement>;
  @ViewChild('firmaCanvas') firmaCanvas!: ElementRef<HTMLCanvasElement>;

  // ---- Camara ----
  stream: MediaStream | null = null;
  fotoCapturada: string | null = null;
  dispositivosVideo: MediaDeviceInfo[] = [];
  camaraSeleccionadaId = '';

  // ---- Firma ----
  private cx: CanvasRenderingContext2D | null = null;
  private dibujando = false;
  private ultimoX = 0;
  private ultimoY = 0;

  // ---- Wacom ----
  private wacomSub: Subscription | null = null;
  isWacomSupported = false;
  wacomConnected = false;
  avisoWacom: string | null = null;
  avisoCamara: string | null = null;

  /** Titulo que se muestra en el modal; lo fija quien abre. */
  titulo = '';

  constructor(
    private utils: UtilsService,
    private modalManager: ModalManagerService,
    private wacomService: WacomService,
    private cdRef: ChangeDetectorRef,
  ) {
    this.isWacomSupported = this.wacomService.isBrowserSupported();
    this.avisoWacom = motivoSinWacom();
    this.avisoCamara = motivoSinCamara();
  }

  ngOnDestroy(): void {
    this.detenerCamara();
    this.wacomSub?.unsubscribe();
  }

  // ====================================================================
  // Foto
  // ====================================================================

  abrirFoto(titulo = 'Captura de fotografía'): void {
    this.titulo = titulo;
    this.fotoCapturada = null;

    const ref = this.modalManager.openModal({
      title: titulo, template: this.modalCamara, width: '600px', showFooter: false,
    });
    ref.result.finally(() => this.detenerCamara());
    this.iniciarCamara();
  }

  async iniciarCamara(deviceId?: string): Promise<void> {
    this.detenerCamara();
    if (!soportaCamara()) {
      if (this.avisoCamara) this.utils.MuestrasToast(TipoToast.Warning, this.avisoCamara);
      return;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : true, audio: false,
      });

      setTimeout(() => {
        if (this.videoElement) this.videoElement.nativeElement.srcObject = this.stream;
      }, 100);

      const dispositivos = await navigator.mediaDevices.enumerateDevices();
      this.dispositivosVideo = dispositivos.filter(d => d.kind === 'videoinput');
      const settings = this.stream?.getVideoTracks()[0]?.getSettings();
      if (settings?.deviceId) this.camaraSeleccionadaId = settings.deviceId;
    } catch (err) {
      console.warn('Error al iniciar cámara:', err);
      this.utils.MuestrasToast(TipoToast.Warning, 'No se pudo acceder a la cámara. Verifique los permisos.');
    }
  }

  cambiarCamara(evento: any): void { this.iniciarCamara(evento.target.value); }

  capturarFoto(): void {
    if (!this.videoElement || !this.canvasCaptura) return;
    const video = this.videoElement.nativeElement;
    const canvas = this.canvasCaptura.nativeElement;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    // PNG y no JPEG: el backend guarda todo en PNG, y capturar en JPEG para
    // luego convertir dejaria los artefactos de compresion grabados.
    this.fotoCapturada = canvas.toDataURL('image/png');
    this.detenerCamara();
  }

  onArchivoFoto(evento: any): void {
    const archivo = evento.target.files?.[0];
    evento.target.value = '';
    if (!archivo) return;
    if (archivo.size > 5 * 1024 * 1024) {
      this.utils.MuestrasToast(TipoToast.Warning, 'La imagen es muy pesada. Máximo 5MB.');
      return;
    }
    const lector = new FileReader();
    lector.onload = () => {
      this.fotoCapturada = lector.result as string;
      this.detenerCamara();
      this.cdRef.detectChanges();
    };
    lector.readAsDataURL(archivo);
  }

  confirmarFoto(): void {
    if (!this.fotoCapturada) return;
    this.fotoLista.emit(this.fotoCapturada);
    this.modalManager.closeModal();
  }

  detenerCamara(): void {
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
  }

  // ====================================================================
  // Firma
  // ====================================================================

  abrirFirma(titulo = 'Captura de firma'): void {
    this.titulo = titulo;

    this.modalManager.openModal({
      title: titulo, template: this.modalFirma, width: '560px', showFooter: true,
      onAccept: () => this.confirmarFirma(),
    });

    // Doble requestAnimationFrame: hay que esperar a que el navegador PINTE el
    // modal antes de medir el <canvas>. Medido antes, offsetWidth sale 0, el
    // canvas queda 0x0 y el trazo es invisible aunque los eventos disparen.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this.inicializarCanvasFirma();
      if (this.wacomConnected) this.wacomService.limpiarPantalla();
    }));
  }

  private inicializarCanvasFirma(): void {
    if (!this.firmaCanvas) return;
    const el = this.firmaCanvas.nativeElement;
    const escala = 2;

    this.cx = el.getContext('2d', { desynchronized: true });
    el.width = (el.offsetWidth || 400) * escala;
    el.height = (el.offsetHeight || 200) * escala;

    if (this.cx) {
      this.cx.lineWidth = 3 * escala;
      this.cx.lineCap = 'round';
      this.cx.lineJoin = 'round';
      this.cx.strokeStyle = '#000000';
    }
  }

  private coordenadas(evento: MouseEvent | TouchEvent): { x: number; y: number } {
    const el = this.firmaCanvas.nativeElement;
    const rect = el.getBoundingClientRect();

    // Se comprueba MouseEvent, NUNCA `instanceof TouchEvent`: Firefox de
    // escritorio solo define TouchEvent en equipos tactiles, y ahi ese
    // instanceof lanza "TouchEvent is not defined" y mata el trazo.
    const esRaton = evento instanceof MouseEvent;
    const cx = esRaton ? evento.clientX : (evento as TouchEvent).touches[0].clientX;
    const cy = esRaton ? evento.clientY : (evento as TouchEvent).touches[0].clientY;

    // El canvas tiene el doble de resolucion interna que su tamano CSS.
    return {
      x: (cx - rect.left) * (el.width / rect.width),
      y: (cy - rect.top) * (el.height / rect.height),
    };
  }

  startDrawing(evento: MouseEvent | TouchEvent): void {
    if (!this.cx) return;
    this.dibujando = true;
    const { x, y } = this.coordenadas(evento);
    this.cx.beginPath();
    this.cx.moveTo(x, y);
  }

  moveDrawing(evento: MouseEvent | TouchEvent): void {
    if (!this.dibujando || !this.cx) return;
    const { x, y } = this.coordenadas(evento);
    this.cx.lineTo(x, y);
    this.cx.stroke();
    evento.preventDefault();
  }

  stopDrawing(): void {
    if (!this.dibujando) return;
    this.dibujando = false;
    this.cx?.closePath();
  }

  limpiarFirma(): void {
    if (!this.firmaCanvas || !this.cx) return;
    const el = this.firmaCanvas.nativeElement;
    this.cx.clearRect(0, 0, el.width, el.height);
    if (this.wacomConnected) this.wacomService.limpiarPantalla();
  }

  onArchivoFirma(evento: any): void {
    const archivo = evento.target.files?.[0];
    evento.target.value = '';
    if (!archivo) return;
    if (!archivo.type?.startsWith('image/')) {
      this.utils.MuestrasToast(TipoToast.Warning, 'La firma debe ser una imagen.');
      return;
    }
    const lector = new FileReader();
    lector.onload = () => this.dibujarImagen(lector.result as string);
    lector.readAsDataURL(archivo);
  }

  private dibujarImagen(dataUrl: string): void {
    const imagen = new Image();
    imagen.onload = () => {
      if (!this.cx) this.inicializarCanvasFirma();
      if (!this.cx || !this.firmaCanvas) return;
      const el = this.firmaCanvas.nativeElement;
      this.cx.clearRect(0, 0, el.width, el.height);
      const escala = Math.min(el.width / imagen.width, el.height / imagen.height);
      const w = imagen.width * escala;
      const h = imagen.height * escala;
      this.cx.drawImage(imagen, (el.width - w) / 2, (el.height - h) / 2, w, h);
    };
    imagen.src = dataUrl;
  }

  async conectarWacom(): Promise<void> {
    this.wacomConnected = await this.wacomService.conectar();
    if (!this.wacomConnected) {
      this.utils.MuestrasToast(TipoToast.Error, 'No se pudo conectar la tableta.');
      return;
    }
    this.wacomSub?.unsubscribe();
    this.wacomSub = this.wacomService.getPenData().subscribe(d => this.procesarWacom(d));
    this.utils.MuestrasToast(TipoToast.Success, 'Tableta Wacom conectada');
  }

  private procesarWacom(data: any): void {
    if (!this.cx || !data) return;
    // Calibracion fija de la STU-430: el capability report del driver reporta
    // los maximos con endianness incorrecta.
    const el = this.firmaCanvas.nativeElement;
    const x = (data.x / 9750) * el.width;
    const y = (data.y / 6100) * el.height;

    if (data.isDown) {
      if (!this.dibujando) {
        this.dibujando = true;
        this.cx.beginPath();
        this.cx.moveTo(x, y);
      } else {
        const midX = (this.ultimoX + x) / 2;
        const midY = (this.ultimoY + y) / 2;
        this.cx.quadraticCurveTo(this.ultimoX, this.ultimoY, midX, midY);
        this.cx.stroke();
      }
      this.ultimoX = x;
      this.ultimoY = y;
    } else if (this.dibujando) {
      this.dibujando = false;
      this.cx.closePath();
      // Los paquetes del lapiz llegan fuera de NgZone (a proposito, para no
      // disparar deteccion de cambios a 200 Hz).
      this.cdRef.detectChanges();
    }
  }

  private confirmarFirma(): void {
    if (!this.firmaCanvas) return;
    this.firmaLista.emit(this.firmaCanvas.nativeElement.toDataURL('image/png'));
  }
}
