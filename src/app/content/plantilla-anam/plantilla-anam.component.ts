import { Component, Input, OnInit } from '@angular/core';
import { ProvisionalComponent } from '../provisional/provisional.component';
import { ModalManagerService } from '../../components/shared/modal-manager.service';
import { EnrolamientoService } from '../../services/enrolamiento.service';
import { UtilsService } from '../../services/utils.service';
import { Router } from '@angular/router';
import { WacomService } from '../../services/wacom.service';

@Component({
  selector: 'app-plantilla-anam',
  standalone: false,
  templateUrl: './plantilla-anam.component.html',
  styleUrls: ['./plantilla-anam.component.scss']
})
export class PlantillaAnamComponent extends ProvisionalComponent implements OnInit {
  @Input() override empleado: any = null;
  @Input() override editable: boolean = true;
  @Input() override isPrintMode: boolean = false;

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
      this.inicializarFechaExpedicion();
      this.generarQR();
    }
  }

  protected override obtenerImagenFrente(): string {
    return 'img/frontal_credencial.png';
  }

  protected override obtenerImagenReverso(): string {
    return 'img/reverso.jpg';
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
      nuevo_laredo: 0
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
