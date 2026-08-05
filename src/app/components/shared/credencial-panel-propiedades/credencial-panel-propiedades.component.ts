import { Component, EventEmitter, Input, Output } from '@angular/core';
import * as fabric from 'fabric';

import { CredencialRenderService } from '../../../services/credencial-render.service';
import { ALINEACIONES, FUENTES_DISPONIBLES } from '../../../content/plantilla-editor/plantilla-editor.const';

/**
 * Panel de propiedades de un objeto Fabric seleccionado (fuente, tamaño,
 * color, alineación, capas, opacidad, rotación, duplicar/eliminar).
 *
 * Extraído de plantilla-editor.component para poder reutilizarlo tal cual en
 * imprimir-credenciales.component (edición rápida antes de imprimir) sin
 * duplicar la lógica ni arriesgar que las dos copias se desincronicen.
 *
 * El componente no es dueño del canvas ni de la seleccion: solo las recibe
 * por @Input y muta el objeto directamente (canvas.renderAll()). Cuando una
 * accion cambia CUAL objeto esta seleccionado (duplicar, eliminar), lo avisa
 * por @Output para que el padre actualice su propia referencia.
 */
@Component({
  standalone: false,
  selector: 'app-credencial-panel-propiedades',
  templateUrl: './credencial-panel-propiedades.component.html',
  styleUrls: ['./credencial-panel-propiedades.component.scss'],
})
export class CredencialPanelPropiedadesComponent {

  @Input() canvas: fabric.Canvas | null = null;
  @Input() objeto: fabric.FabricObject | null = null;

  /** Se emite cuando la seleccion activa cambia (duplicar, eliminar). */
  @Output() seleccionCambiada = new EventEmitter<fabric.FabricObject | null>();
  /** Se emite en cualquier mutacion, para que el padre marque "hay cambios". */
  @Output() cambio = new EventEmitter<void>();

  readonly fuentes = FUENTES_DISPONIBLES;
  readonly alineaciones = ALINEACIONES;

  get esTexto(): boolean {
    const tipo = this.objeto?.type;
    return tipo === 'textbox' || tipo === 'text' || tipo === 'i-text';
  }

  get datosSeleccion(): any {
    return (this.objeto as any)?.data || {};
  }

  propiedad(nombre: string): any {
    return (this.objeto as any)?.[nombre];
  }

  actualizarPropiedad(nombre: string, valor: any): void {
    if (!this.objeto || !this.canvas) return;
    this.objeto.set(nombre as any, valor);
    this.canvas.renderAll();
    this.cambio.emit();
  }

  actualizarDato(nombre: string, valor: any): void {
    if (!this.objeto || !this.canvas) return;
    const data = (this.objeto as any).data || {};
    data[nombre] = valor;
    (this.objeto as any).data = data;
    this.canvas.renderAll();
    this.cambio.emit();
  }

  alternarNegrita(): void {
    const actual = this.propiedad('fontWeight');
    this.actualizarPropiedad('fontWeight', actual === 'bold' ? 'normal' : 'bold');
  }

  alternarCursiva(): void {
    const actual = this.propiedad('fontStyle');
    this.actualizarPropiedad('fontStyle', actual === 'italic' ? 'normal' : 'italic');
  }

  // ---- Capas y posicion ----

  traerAlFrente(): void {
    if (!this.objeto || !this.canvas) return;
    this.canvas.bringObjectToFront(this.objeto);
    this.canvas.renderAll();
    this.cambio.emit();
  }

  enviarAlFondo(): void {
    if (!this.objeto || !this.canvas) return;
    this.canvas.sendObjectToBack(this.objeto);
    this.canvas.renderAll();
    this.cambio.emit();
  }

  centrarHorizontal(): void {
    if (!this.objeto || !this.canvas) return;
    this.canvas.centerObjectH(this.objeto);
    this.objeto.setCoords();
    this.canvas.renderAll();
    this.cambio.emit();
  }

  centrarVertical(): void {
    if (!this.objeto || !this.canvas) return;
    this.canvas.centerObjectV(this.objeto);
    this.objeto.setCoords();
    this.canvas.renderAll();
    this.cambio.emit();
  }

  duplicarSeleccion(): void {
    if (!this.objeto || !this.canvas) return;
    const canvas = this.canvas;
    const original = this.objeto;

    original.clone(CredencialRenderService.PROPS_EXTRA as any).then((copia: fabric.FabricObject) => {
      copia.set({
        left: (original.left || 0) + 20,
        top: (original.top || 0) + 20,
      });
      canvas.add(copia);
      canvas.setActiveObject(copia);
      canvas.renderAll();
      this.seleccionCambiada.emit(copia);
      this.cambio.emit();
    });
  }

  eliminarSeleccion(): void {
    if (!this.canvas) return;
    const activos = this.canvas.getActiveObjects();
    if (!activos.length) return;

    activos.forEach(obj => this.canvas!.remove(obj));
    this.canvas.discardActiveObject();
    this.canvas.renderAll();
    this.seleccionCambiada.emit(null);
    this.cambio.emit();
  }
}
