import { Component, ViewChild, OnInit } from '@angular/core';
import { ConsultaEnrolamientoComponent } from './consulta-enrolamiento/consulta-enrolamiento.component';
import { ModuleContextService } from '../../services/module-context.service';

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

  constructor(private moduleContext: ModuleContextService) { }

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
    this.empleadoSeleccionado = empleado;
    if (!empleado) return;

    if (this.modoBloqueFijo) {
      this.empleadoSeleccionado.nuevo_laredo = this.modeloCredencialSeleccionado === 'nuevoLaredo' ? 1 : 0;
      return;
    }

    this.modeloCredencialSeleccionado = Number(empleado.nuevo_laredo) === 1 ? 'nuevoLaredo' : 'anam';
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