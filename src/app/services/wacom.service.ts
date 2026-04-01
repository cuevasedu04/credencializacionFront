import { Injectable, NgZone } from '@angular/core';
import { Subject, Observable } from 'rxjs';

declare global {
  interface Window {
    WacomSTU: any;
    wgssSigCaptX: any;
  }
}

@Injectable({
  providedIn: 'root'
})
export class WacomService {

  private wacomDevice: any = null;
  private penDataSubject = new Subject<any>();
  private disconnectSubject = new Subject<void>();
  private isConnected = false;
  private hidDisconnectListener: ((e: any) => void) | null = null;

  constructor(private ngZone: NgZone) { }

  /**
   * Inicializa la conexión con la tableta Wacom STU.
   * IMPORTANTE: Debe ser invocado por una acción directa del usuario (clic) la primera vez,
   * ya que los navegadores bloquean solicitudes USB no solicitadas.
   */
  async conectar(): Promise<boolean> {
    
    // Check if script loaded
    if (typeof window.WacomSTU === 'undefined') {
        console.error('Driver Wacom WebHID (WacomSTU) no definido. Revise assets/js/wacom-webhid.js');
        return false;
    }

    try {
      // Si ya tenemos instancia, reusamos o reconectamos
      if (!this.wacomDevice) {
        this.wacomDevice = new window.WacomSTU();
      }
      
      if (!this.wacomDevice.isSupported) {
          console.error("WacomSTU reporta que WebHID no está soportado/habilitado.");
          return false;
      }

      // Configurar listening de datos
      if (this.wacomDevice.onPenData) {
        this.wacomDevice.onPenData((packet: any) => {
            // ELIMINADO NgZone: Para mejorar el rendimiento y evitar "ticks" de Angular por cada paquete (200Hz).
            // Esto evita que el trazo se vea poligonal o con lag (sierra) causado por el Change Detection.
            // this.ngZone.run(() => {
                this.penDataSubject.next(packet);
            // });
        });
      }

      // Intentar conectar
      // Esto disparará el popup del navegador si el dispositivo no tiene permisos aún
      this.isConnected = await this.wacomDevice.connect();
      
      if (this.isConnected) {
        console.log("Wacom conectada. Info:", this.wacomDevice.getTabletInfo());
        await this.limpiarPantalla();
        await this.wacomDevice.setInking(true);

        // Registrar listener de desconexión física
        if (this.hidDisconnectListener) {
          (navigator as any).hid.removeEventListener('disconnect', this.hidDisconnectListener);
        }
        this.hidDisconnectListener = (event: any) => {
          if (this.wacomDevice && this.wacomDevice.device === event.device) {
            this.isConnected = false;
            this.ngZone.run(() => this.disconnectSubject.next());
          }
        };
        (navigator as any).hid.addEventListener('disconnect', this.hidDisconnectListener);
      }

      return this.isConnected;

    } catch (e) {
      console.error("Error conectando Wacom:", e);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Observable que emite cada evento del lápiz (coordenadas, presión, etc)
   */
  getPenData(): Observable<any> {
    return this.penDataSubject.asObservable();
  }

  /**
   * Observable que emite cuando la tableta se desconecta físicamente
   */
  getDisconnectEvent(): Observable<void> {
    return this.disconnectSubject.asObservable();
  }

  /**
   * Limpia la pantalla LCD de la tableta
   */
  async limpiarPantalla() {
    if (this.wacomDevice && this.isConnected) {
      await this.wacomDevice.clearScreen();
    }
  }

  getTabletInfo() {
      return this.wacomDevice ? this.wacomDevice.getTabletInfo() : null;
  }

  /**
   * Verifica si el navegador soporta WebHID (Chrome, Edge, Opera)
   */
  isBrowserSupported(): boolean {
    return !!(navigator as any).hid;
  }
}