import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { ProvisionalComponent } from '../provisional/provisional.component';
import { ModalManagerService } from '../../components/shared/modal-manager.service';
import { EnrolamientoService } from '../../services/enrolamiento.service';
import { UtilsService } from '../../services/utils.service';
import { Router } from '@angular/router';
import { WacomService } from '../../services/wacom.service';
import { IMAGEN_FRENTE_FALLBACK, IMAGEN_REVERSO_FALLBACK, LAYOUTS_CREDENCIAL, LayoutCredencial, NIVELES_CREDENCIAL, NivelCredencial, cargoANivel, getLayoutCredencial, getNivel } from '../../components/shared/nivel-credencial.const';

@Component({
  selector: 'app-plantilla-anam',
  standalone: false,
  templateUrl: './plantilla-anam.component.html',
  styleUrls: ['./plantilla-anam.component.scss', './plantilla-anam.layouts.scss']
})
export class PlantillaAnamComponent extends ProvisionalComponent implements OnInit, OnChanges {
  @Input() override empleado: any = null;
  @Input() override editable: boolean = true;
  @Input() override isPrintMode: boolean = false;

  // ----- NIVEL CREDENCIAL -----
  readonly niveles: NivelCredencial[] = NIVELES_CREDENCIAL;
  override readonly layouts: LayoutCredencial[] = LAYOUTS_CREDENCIAL;

  getNivelActual(): NivelCredencial {
    return getNivel(this.empleado?.nivel_credencial);
  }

  onNivelCambio(nuevoValor: string): void {
    if (this.empleado) {
      this.empleado.nivel_credencial = nuevoValor;
      if (!this.empleado.layout_credencial) {
        this.empleado.layout_credencial = 'ANAM_2025';
      }
    }
  }

  override onLayoutCambio(nuevoLayout: string): void {
    if (!this.empleado) return;
    this.empleado.nuevo_laredo = 0;
    this.empleado.familiar = 0;
    
    if (nuevoLayout === 'NUEVO_LAREDO') {
      this.empleado.nuevo_laredo = 1;
      this.empleado.layout_credencial = 'NUEVO_LAREDO';
    } else if (nuevoLayout === 'FAMILIAR') {
      this.empleado.familiar = 1;
      this.empleado.layout_credencial = 'FAMILIAR';
    } else {
      this.empleado.layout_credencial = getLayoutCredencial(nuevoLayout);
    }
  }

  override getLayoutActual(): string {
    if (this.empleado?.familiar == 1) return 'FAMILIAR';
    if (this.empleado?.nuevo_laredo == 1) return 'NUEVO_LAREDO';
    const current = String(this.empleado?.layout_credencial || '').toUpperCase();
    if (current === 'ANAM_2025' || current === 'ANAM_CLASICA' || current === 'NUEVO_LAREDO' || current === 'FAMILIAR') {
      return current;
    }
    return this.empleado?.nivel_credencial ? 'ANAM_2025' : 'ANAM_CLASICA';
  }

  obtenerClaseLayout(): string {
    if (this.getLayoutActual() === 'ANAM_CLASICA') return 'layout-roja';
    const nivel = String(this.empleado?.nivel_credencial || '').trim().toUpperCase();
    if (!nivel) return 'layout-enlace';
    return `layout-${nivel.toLowerCase().replace(/_/g, '-')}`;
  }

  constructor(
    modalManager: ModalManagerService,
    enrolamientoApi: EnrolamientoService,
    utils: UtilsService,
    router: Router,
    wacomService: WacomService
  ) {
    super(modalManager, enrolamientoApi, utils, router, wacomService);
    this.tipoCredencialLabel = 'anam';
    this.qrPrefix = 'ANAM';
  }

  override ngOnInit(): void {
    if (!this.empleado) {
      this.inicializarEmpleado();
    } else {
      if (!this.empleado.layout_credencial) {
        this.empleado.layout_credencial = this.empleado.nivel_credencial ? 'ANAM_2025' : 'ANAM_CLASICA';
      }
      if (!this.empleado.nivel_credencial && this.empleado.puesto) {
        this.empleado.nivel_credencial = cargoANivel(this.empleado.puesto);
      }
      this.inicializarFechaExpedicion();
      this.generarQR();
    }
  }

  override ngOnChanges(changes: SimpleChanges): void {
    super.ngOnChanges(changes);
    if (changes['empleado'] && this.empleado) {
      if (!this.empleado.layout_credencial) {
        this.empleado.layout_credencial = this.empleado.nivel_credencial ? 'ANAM_2025' : 'ANAM_CLASICA';
      }
      if (!this.empleado.nivel_credencial && this.empleado.puesto) {
        this.empleado.nivel_credencial = cargoANivel(this.empleado.puesto);
      }
    }
  }

  protected override obtenerImagenFrente(): string {
    if (this.getLayoutActual() === 'ANAM_CLASICA') {
      return IMAGEN_FRENTE_FALLBACK;
    }
    return this.getNivelActual().imagenFrente;
  }

  protected override obtenerImagenReverso(): string {
    if (this.getLayoutActual() === 'ANAM_CLASICA') {
      return IMAGEN_REVERSO_FALLBACK;
    }
    return this.getNivelActual().imagenReverso;
  }

  protected override obtenerFlagNuevoLaredo(): number {
    return 0;
  }

  override async guardarEnrolamiento() {
    if (!this.empleado) return;

    // Asegurarse de que el empleado tenga los valores más recientes de layout antes de llamar al super
    this.empleado.layout_credencial = this.getLayoutActual();
    this.empleado.nivel_credencial = this.empleado.nivel_credencial || cargoANivel(this.empleado.puesto);

    // Llamar al guardado y validaciones de la clase padre
    // Importante: No llamamos this.enrolamientoCompletado.emit() de inmediato, 
    // porque el request es asíncrono y lo emite el subscriber del padre.
    await super.guardarEnrolamiento();
  }
}
