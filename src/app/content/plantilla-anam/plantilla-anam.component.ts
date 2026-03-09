import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { ProvisionalComponent } from '../provisional/provisional.component';
import { ModalManagerService } from '../../components/shared/modal-manager.service';
import { EnrolamientoService } from '../../services/enrolamiento.service';
import { UtilsService } from '../../services/utils.service';
import { Router } from '@angular/router';
import { WacomService } from '../../services/wacom.service';
import { IMAGEN_FRENTE_FALLBACK, IMAGEN_REVERSO_FALLBACK, LAYOUTS_CREDENCIAL, LayoutCredencial, NIVELES_CREDENCIAL, NivelCredencial, cargoANivel, getLayoutCredencial, getNivel } from '../../shared/nivel-credencial.const';

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
  readonly layouts: LayoutCredencial[] = LAYOUTS_CREDENCIAL;

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

  onLayoutCambio(nuevoLayout: string): void {
    if (!this.empleado) return;
    this.empleado.layout_credencial = getLayoutCredencial(nuevoLayout);
  }

  getLayoutActual(): string {
    const current = String(this.empleado?.layout_credencial || '').toUpperCase();
    if (current === 'ANAM_2025' || current === 'ANAM_CLASICA') {
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

    const id = this.empleado.id_enrolamiento;
    if (!id) {
      await super.guardarEnrolamiento();
      this.enrolamientoCompletado.emit();
      return;
    }

    if (!this.empleado.foto || !this.empleado.firma) {
      return;
    }

    this.guardando = true;
    await this.generarQR();

    let fechaExpedicionFormateada = this.empleado.fecha_expedicion;
    if (fechaExpedicionFormateada instanceof Date) {
      fechaExpedicionFormateada = fechaExpedicionFormateada.toISOString().split('T')[0];
    } else if (typeof fechaExpedicionFormateada === 'string' && fechaExpedicionFormateada.includes('T')) {
      fechaExpedicionFormateada = fechaExpedicionFormateada.split('T')[0];
    }

    const payload: any = {
      nombre: this.empleado.nombre,
      paterno: this.empleado.paterno,
      materno: this.empleado.materno,
      apellidos: `${this.empleado.paterno || ''} ${this.empleado.materno || ''}`.trim(),
      num_empleado: this.empleado.num_empleado,
      adscripcion: this.empleado.adscripcion,
      puesto: this.empleado.puesto,
      curp: this.empleado.curp,
      rfc: this.empleado.rfc,
      folio: this.empleado.folio,
      fin_vig: this.empleado.fin_vig || null,
      inicio_vig: this.empleado.inicio_vig || null,
      eladia: this.empleado.eladia || null,
      fecha_expedicion: fechaExpedicionFormateada,
      fecha_enrolamiento: this.empleado.fecha_enrolamiento || new Date().toISOString(),
      foto: this.empleado.foto,
      firma: this.empleado.firma,
      activo: 1,
      provisional: 1,
      impreso: this.empleado.impreso ?? 0,
      nuevo_laredo: 0,
      nivel_credencial: this.empleado.nivel_credencial || cargoANivel(this.empleado.puesto),
      layout_credencial: this.getLayoutActual(),
    };

    this.enrolamientoApi.actualizarExpediente(id, payload).subscribe({
      next: () => {
        this.guardando = false;
        this.enrolamientoCompletado.emit();
      },
      error: () => {
        this.guardando = false;
      }
    });
  }
}
