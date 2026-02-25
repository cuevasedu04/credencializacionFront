import { Component, ViewChild, OnInit } from '@angular/core';
import { ConsultaEnrolamientoComponent } from './consulta-enrolamiento/consulta-enrolamiento.component';

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

  constructor() { }

  ngOnInit(): void {
    // Puedes comentar la siguiente línea para empezar sin empleado seleccionado
    // this.empleadoSeleccionado = null;
  }

  // Esta función se ejecuta cuando el hijo "Consulta" emite el evento
  recibirEmpleado(empleado: any) {
    this.empleadoSeleccionado = empleado;
    if (!empleado) return;
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