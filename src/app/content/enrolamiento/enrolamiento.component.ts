import { Component, ViewChild, OnInit } from '@angular/core';
import { ConsultaEnrolamientoComponent } from './consulta-enrolamiento/consulta-enrolamiento.component';
import { ModuleContextService } from '../../services/module-context.service';
import { EnrolamientoService } from '../../services/enrolamiento.service';

@Component({
  standalone: false,
  selector: 'app-enrolamiento',
  templateUrl: './enrolamiento.component.html',
  styleUrls: ['./enrolamiento.component.scss']
})
export class EnrolamientoComponent implements OnInit {

  @ViewChild(ConsultaEnrolamientoComponent) consultaComponent!: ConsultaEnrolamientoComponent;

  // Variable con datos de empleado (para visualización inmediata)
  empleadoSeleccionado: any = null;
  modeloCredencialSeleccionado: 'anam' | 'nuevoLaredo' = 'anam';
  modoBloqueFijo = false;

  constructor(
    private moduleContext: ModuleContextService,
    private enrolamientoApi: EnrolamientoService
  ) { }

  ngOnInit(): void {
    this.aplicarModeloDesdeBloque();
  }

  private aplicarModeloDesdeBloque(): void {
    const bloque = this.moduleContext.selectedBlock();
    if (bloque === 'nuevo-laredo') {
      this.modeloCredencialSeleccionado = 'nuevoLaredo';
      this.modoBloqueFijo = true;
      return;
    }

    this.modeloCredencialSeleccionado = 'anam';
    this.modoBloqueFijo = true;
  }

  // Esta función se ejecuta cuando el hijo "Consulta" emite el evento
  recibirEmpleado(empleado: any) {
    if (!empleado) {
      this.empleadoSeleccionado = null;
      return;
    }

    if (this.modoBloqueFijo) {
      empleado.nuevo_laredo = this.modeloCredencialSeleccionado === 'nuevoLaredo' ? 1 : 0;
    } else {
      this.modeloCredencialSeleccionado = Number(empleado.nuevo_laredo) === 1 ? 'nuevoLaredo' : 'anam';
    }

    // Si el empleado no tiene foto o firma en sicre, buscamos en NW_EMPL_FOTO_ANAM
    const numEmpleado = empleado.num_empleado;
    const faltaFoto = !empleado.foto || empleado.foto === '1';
    const faltaFirma = !empleado.firma || empleado.firma === '1';

    if (numEmpleado && (faltaFoto || faltaFirma)) {
      this.enrolamientoApi.getFotoFirmaExterna(numEmpleado).subscribe({
        next: (res: any) => {
          if (faltaFoto && res?.foto) {
            empleado.foto = res.foto;
          }
          if (faltaFirma && res?.firma) {
            empleado.firma = res.firma;
          }
          this.empleadoSeleccionado = { ...empleado };
        },
        error: () => {
          // Si no hay datos externos, usamos el empleado tal cual
          this.empleadoSeleccionado = { ...empleado };
        }
      });
    } else {
      this.empleadoSeleccionado = { ...empleado };
    }
  }

  // Cuando se completa un enrolamiento, refrescamos la lista
  onEnrolamientoCompletado() {
    this.empleadoSeleccionado = null;
    if (this.consultaComponent) {
      this.consultaComponent.cargarEmpleados();
    }
  }

  cambiarModeloCredencial(modelo: 'anam' | 'nuevoLaredo') {
    this.modeloCredencialSeleccionado = modelo;
    if (this.empleadoSeleccionado) {
      this.empleadoSeleccionado.nuevo_laredo = modelo === 'nuevoLaredo' ? 1 : 0;
    }
  }
}