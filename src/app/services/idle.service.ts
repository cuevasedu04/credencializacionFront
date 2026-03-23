import { Injectable, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from './session.service';
import { UtilsService } from './utils.service';
import { TipoToast } from '../../api/entidades/enumeraciones';

@Injectable({ providedIn: 'root' })
export class IdleService {
  /** Tiempo máximo de inactividad (ms) — ajusta según necesidad */
  private readonly idleTimeout = 30 * 60 * 1000; // (usa 15 * 60 * 1000 en prod)

  /** Último timestamp de actividad */
  private lastActivityTime: number = Date.now();

  /** Intervalo de verificación */
  private checkInterval: any = null;

  /** Estado del servicio */
  private watching = false;

  constructor(
    private ngZone: NgZone,
    private sessionService: SessionService,
    private router: Router,
    private utils: UtilsService
  ) {}

  /**
   * Inicia el monitoreo de inactividad
   * Puede llamarse múltiples veces sin duplicar listeners
   */
  startWatching(): void {
    // Evitar reinicios innecesarios
    if (this.watching) return;

    // Limpieza preventiva
    this.stopWatching();

    this.resetTimer();
    this.watching = true;

    // Detectar cualquier tipo de actividad del usuario
    const reset = this.resetTimer.bind(this);

    window.addEventListener('mousemove', reset);
    window.addEventListener('mousedown', reset);
    window.addEventListener('keydown', reset);
    window.addEventListener('scroll', reset);
    window.addEventListener('touchstart', reset);

    // Ejecutar el chequeo de inactividad periódicamente
    this.ngZone.runOutsideAngular(() => {
      this.checkInterval = setInterval(() => {
        this.ngZone.run(() => this.checkInactivity());
      },1000); // cada 1 segundo para pruebas
    });

  }

  /**
   * Detiene el monitoreo de inactividad
   */
  stopWatching(): void {
    this.watching = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    window.removeEventListener('mousemove', this.resetTimer);
    window.removeEventListener('mousedown', this.resetTimer);
    window.removeEventListener('keydown', this.resetTimer);
    window.removeEventListener('scroll', this.resetTimer);
    window.removeEventListener('touchstart', this.resetTimer);
  }

  /**
   * Reinicia el temporizador de actividad
   */
  private resetTimer(): void {
    this.lastActivityTime = Date.now();
  }

  /**
   * Verifica si ya pasó el tiempo máximo de inactividad
   */
  private checkInactivity(): void {
    const now = Date.now();
    const elapsed = now - this.lastActivityTime;

    if (elapsed >= this.idleTimeout && this.sessionService.isLoggedIn()) {
      console.warn('⚠️ Sesión cerrada por inactividad');
      this.sessionService.logout();
      this.utils.MuestrasToast(TipoToast.Info, 'Sesión cerrada por inactividad');
      this.stopWatching();
    }
  }
}
