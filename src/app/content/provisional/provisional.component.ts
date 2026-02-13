import { Component, Input, ViewChild, ElementRef, TemplateRef, AfterViewInit, OnInit, OnDestroy } from '@angular/core';
import { NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ModalManagerService } from '../../components/shared/modal-manager.service';
import { EnrolamientoService } from '../../services/enrolamiento.service';
import { UtilsService } from '../../services/utils.service';
import { TipoToast } from '../../../api/entidades/enumeraciones';
import { Router } from '@angular/router';
import { WacomService } from '../../services/wacom.service';
import { Subscription } from 'rxjs';
import * as QRCode from 'qrcode';

@Component({
  standalone: false,
  selector: 'app-provisional',
  templateUrl: './provisional.component.html',
  styleUrls: ['./provisional.component.scss']
})
export class ProvisionalComponent implements OnInit, AfterViewInit, OnDestroy {

  // En provisional, el empleado se inicializa vacío
  empleado: any = null;
  
  // Siempre es editable en provisional
  editable: boolean = true;
  isPrintMode: boolean = false;

  // Modales y Elementos
  @ViewChild('modalCamara', { static: true }) modalCamara!: TemplateRef<any>;
  @ViewChild('modalFirma', { static: true }) modalFirma!: TemplateRef<any>;
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
  protected tipoCredencialLabel = 'provisional';
  protected qrPrefix = 'PROVISIONAL';

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
  
  // Suavizado
  private lastX = 0;
  private lastY = 0;

  constructor(
    private modalManager: ModalManagerService,
    private enrolamientoApi: EnrolamientoService,
    private utils: UtilsService,
    private router: Router,
    private wacomService: WacomService
  ) {
    this.isWacomSupported = this.wacomService.isBrowserSupported();
  }

  ngOnInit(): void {
    this.inicializarEmpleado();
  }

  ngOnDestroy(): void {
      if(this.wacomSub) this.wacomSub.unsubscribe();
  }

  inicializarEmpleado() {
    this.empleado = {
        nombre: '',
        paterno: '',
        materno: '',
        num_empleado: '',
        adscripcion: '',
        puesto: '',
        fin_vig: '',
        curp: '',
        fecha_expedicion: '', // Se llenará con la fecha actual
        folio: '',    // Se llenará con el servicio
        foto: '',
        firma: '',
        rfc: '',
        inicio_vig: '',
        eladia: '',
        fecha_registro: ''
    };
    
    this.inicializarFechaExpedicion();
    this.asignarFolioSiguiente();
  }

  private asignarFolioSiguiente() {
    // Obtener siguiente folio desde el backend
    this.enrolamientoApi.obtenerFolioMaximo().subscribe({
      next: (res: any) => {
        if (res && res.status === 'success' && res.siguiente_folio) {
          if (this.empleado) {
              this.empleado.folio = res.siguiente_folio;
          }
        }
      },
      error: (err) => {
        console.error('Error al obtener folio:', err);
        this.utils.MuestrasToast(TipoToast.Warning, `No se pudo obtener el folio de ${this.tipoCredencialLabel}`);
      }
    });
  }

  inicializarFechaExpedicion() {
    if (!this.empleado) return;
    
    // Establecer fecha_expedicion como el día de hoy
    const hoy = new Date();
    this.empleado.fecha_expedicion = hoy.toISOString().split('T')[0];
  }

  // Generamos el QR justo antes de guardar (o dinámicamente)
  async generarQR() {
    if (!this.empleado) {
      this.qrCodeDataUrl = null;
      return;
    }

    // Construir el texto del QR
    const datosQR = [
      this.qrPrefix,
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
      new Date().toISOString()
    ].join('|');

    try {
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

  ngAfterViewInit(): void {
    // Canvas se inicializa en modal
  }

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
  // LÓGICA DE FOTO
  // ==========================================
  abrirCamara() {
    this.fotoCapturada = null;
    this.modalCamaraRef = this.modalManager.openModal({
      title: 'Captura de Fotografía',
      template: this.modalCamara,
      width: '600px',
      showFooter: false
    });
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

        const devices = await navigator.mediaDevices.enumerateDevices();
        this.dispositivosVideo = devices.filter(d => d.kind === 'videoinput');
        
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

  onArchivoSeleccionado(event: any) {
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

  confirmarFoto() {
    if (this.fotoCapturada && this.empleado) {
      this.empleado.foto = this.fotoCapturada;
      // No generamos QR aqui todavia, solo al guardar
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
  // LÓGICA DE FIRMA
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
    const isPenDown = data.pressure > 0;
    const tabletW = 9750;
    const tabletH = 6100; 

    const canvasEl = this.firmaCanvas.nativeElement;
    
    // Mapeo de coordenadas
    const x = (data.x / tabletW) * canvasEl.width;
    const y = (data.y / tabletH) * canvasEl.height;

    if (data.isDown) {
       if (!this.isDrawing) {
           this.isDrawing = true;
           this.cx.beginPath();
           this.cx.moveTo(x, y);
           this.lastX = x;
           this.lastY = y;
       } else {
           const midX = (this.lastX + x) / 2;
           const midY = (this.lastY + y) / 2;
           this.cx.quadraticCurveTo(this.lastX, this.lastY, midX, midY);
           this.cx.stroke();
           this.lastX = x;
           this.lastY = y;
       }
    } else {
       if (this.isDrawing) {
           this.cx.lineTo(this.lastX, this.lastY); 
           this.cx.stroke();
           this.isDrawing = false;
           this.cx.closePath();
       }
    }
  }

  abrirFirma() {
    this.modalFirmaRef = this.modalManager.openModal({
      title: 'Captura de Firma',
      template: this.modalFirma,
      width: '500px',
      showFooter: true,
      onAccept: () => this.confirmarFirma()
    });

    setTimeout(() => {
      this.inicializarCanvasFirma();
      if (this.wacomConnected) {
          this.wacomService.limpiarPantalla();
      }
    }, 200);
  }

  inicializarCanvasFirma() {
    const canvasEl = this.firmaCanvas.nativeElement;
    const scale = 2; 
    
    this.cx = canvasEl.getContext('2d', { desynchronized: true });
    canvasEl.width = canvasEl.offsetWidth * scale;
    canvasEl.height = canvasEl.offsetHeight * scale;

    if (this.cx) {
      this.cx.lineWidth = 3 * scale; 
      this.cx.lineCap = 'round';
      this.cx.lineJoin = 'round';
      this.cx.strokeStyle = '#000000';
    }
  }
  
  startDrawing(event: MouseEvent | TouchEvent): void {
    if(this.wacomConnected && this.isDrawing) return; 
    this.isDrawing = true;
    const { x, y } = this.getCoordinates(event);
    this.draw(x, y);
  }

  moveDrawing(event: MouseEvent | TouchEvent): void {
    if(this.wacomConnected) return; 
    if (!this.isDrawing) return;
    const { x, y } = this.getCoordinates(event);
    this.draw(x, y);
    event.preventDefault(); 
  }

  stopDrawing(): void {
    if(this.wacomConnected) return; 
    if (!this.isDrawing) return;
    this.isDrawing = false;
    this.cx?.beginPath(); 
  }

  draw(x: number, y: number): void {
    if (!this.cx) return;
    this.cx.lineTo(x, y);
    this.cx.stroke();
    this.cx.beginPath();
    this.cx.moveTo(x, y);
  }

  private getCoordinates(event: MouseEvent | TouchEvent): { x: number, y: number } {
    const canvasEl = this.firmaCanvas.nativeElement;
    const rect = canvasEl.getBoundingClientRect();
    
    let clientX, clientY;
    if (event instanceof TouchEvent) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else {
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
    this.wacomService.limpiarPantalla();
  }

  confirmarFirma() {
    const canvasEl = this.firmaCanvas.nativeElement;
    const dataUrl = canvasEl.toDataURL('image/png');
    if (this.empleado) {
      this.empleado.firma = dataUrl;
      if (this.modalFirmaRef) {
        this.modalFirmaRef.close();
      } else {
        this.modalManager.closeModal();
      }
    }
  }

  async guardarEnrolamiento() {
    if (!this.empleado) return;
    
    if(!this.empleado.foto || !this.empleado.firma) {
      this.utils.MuestrasToast(TipoToast.Warning, 'Falta capturar foto o firma');
      return;
    }

    this.guardando = true;

    // 1. PRIMERO Generar QR con los datos actuales
    await this.generarQR();

    // Formatear fecha para envio
    let fechaExpedicionFormateada = this.empleado.fecha_expedicion;
    // ... lógica de formateo ...
    if (fechaExpedicionFormateada instanceof Date) {
        fechaExpedicionFormateada = fechaExpedicionFormateada.toISOString().split('T')[0];
    } else if (typeof fechaExpedicionFormateada === 'string' && fechaExpedicionFormateada.includes('T')) {
        fechaExpedicionFormateada = fechaExpedicionFormateada.split('T')[0];
    }

    const fechaEnrolamientoActual = new Date().toISOString();

    // Construir campo apellidos (concatenación de paterno y materno) y asegurar RFC
    const apellidosConcatenados = `${this.empleado.paterno || ''} ${this.empleado.materno || ''}`.trim();
    
    // Regla de Negocio: Si no hay RFC, usar CURP
    let rfcFinal = this.empleado.rfc;
    if ((!rfcFinal || rfcFinal.trim() === '') && this.empleado.curp) {
        rfcFinal = this.empleado.curp;
    }

    const payload: any = {
        // Datos Personales
        nombre: this.empleado.nombre,
        paterno: this.empleado.paterno,
        materno: this.empleado.materno,
        apellidos: apellidosConcatenados, // Campo faltante en el modelo

        // Datos Laborales
        num_empleado: this.empleado.num_empleado,
        adscripcion: this.empleado.adscripcion,
        puesto: this.empleado.puesto,
        
        // Identificadores
        curp: this.empleado.curp,
        rfc: rfcFinal, 
        folio: this.empleado.folio,
        
        // Fechas
        fin_vig: this.empleado.fin_vig || null,
        inicio_vig: this.empleado.inicio_vig || null,
        eladia: this.empleado.eladia || null,
        fecha_expedicion: fechaExpedicionFormateada,
        fecha_enrolamiento: fechaEnrolamientoActual,
        
        // Imagenes
        foto: this.empleado.foto,
        firma: this.empleado.firma,

        // Metadatos y Flags
        activo: 1,
        provisional: 1,
        impreso: 0 // Inicializar como no impreso
    };
    
    // Limpieza final de campos opcionales
    if (!payload.rfc) delete payload.rfc;
    if (!payload.curp) delete payload.curp;
    if (!payload.materno) payload.materno = '';   

    console.log(`Enviando payload ${this.tipoCredencialLabel}:`, payload);

    // endpoint 'crearExpediente' apunta a /api/expedientes/ que es el correcto para crear registros
    this.enrolamientoApi.crearExpediente(payload).subscribe({
        next: (resp) => {
            this.guardando = false;
          this.utils.MuestrasToast(TipoToast.Success, `Credencial ${this.tipoCredencialLabel} guardada exitosamente`);
            // Podríamos navegar a otra página o limpiar el formulario
            this.empleado = null; 
            // Reinicializar para capturar otro
            setTimeout(() => {
                this.inicializarEmpleado();
            }, 1000);
        },
        error: (err) => {
          console.error(`Error al guardar ${this.tipoCredencialLabel}:`, err);
            this.guardando = false;
            
            // Intento de mostrar el error detallado si viene en formato JSON
            let msg = 'Error interno';
            if (err.error) {
                if (typeof err.error === 'string') msg = err.error;
                else if (typeof err.error === 'object') msg = JSON.stringify(err.error);
            }
            this.utils.MuestrasToast(TipoToast.Error, 'Error al guardar: ' + msg);
        }
    });
  }
}
