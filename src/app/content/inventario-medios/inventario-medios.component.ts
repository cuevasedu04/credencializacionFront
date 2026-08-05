import { ChangeDetectorRef, Component, OnInit, TemplateRef, ViewChild } from '@angular/core';

import { TipoToast } from '../../../api/entidades/enumeraciones';
import { UtilsService } from '../../services/utils.service';
import { ModalManagerService } from '../../components/shared/modal-manager.service';
import { PlantillaCredencialService } from '../../services/plantilla-credencial.service';

/** Empleado del roster con el que cruza una captura, si es que cruza. */
export interface CruceRoster {
  num_empleado: string;
  curp: string;
  nombre: string;
}

/** Una foto/firma en disco todavia nombrada por RFC. */
export interface MedioPendiente {
  rfc: string;
  foto: string | null;
  firma: string | null;
  fecha?: number | null;
  cruce: CruceRoster | null;
}

type FiltroInventario = 'todos' | 'cruzables' | 'sin_cruce' | 'incompletos';

/**
 * Pantalla "Inventario de medios".
 *
 * Muestra las fotos y firmas que viven en MEDIA_ROOT nombradas por RFC, es
 * decir, las que todavia NO estan ligadas a un numero de empleado. Incluye
 * tanto lo capturado en "Enrolamiento previo" como el acervo historico de
 * cargas anteriores, que ya venia nombrado asi.
 *
 * A cada archivo el backend le adjunta el empleado del roster SIG cuyo CURP
 * comparte el prefijo de 10 caracteres con ese RFC (ver
 * media_utils.resolver_por_prefijo). Con ese cruce, desde aqui se puede
 * renombrar el archivo a su num_empleado definitivo sin esperar a que alguien
 * imprima esa credencial -- que es el otro momento en que ocurre la
 * migracion, en "Imprimir credenciales".
 *
 * Los que NO cruzan son personas cuyo movimiento de ingreso todavia no se
 * aplica (apareceran solas en un sync posterior) o basura del acervo.
 */
@Component({
  standalone: false,
  selector: 'app-inventario-medios',
  templateUrl: './inventario-medios.component.html',
  styleUrls: ['./inventario-medios.component.scss'],
})
export class InventarioMediosComponent implements OnInit {

  @ViewChild('confirmDialog') confirmDialog!: TemplateRef<any>;

  registros: MedioPendiente[] = [];
  cargando = false;
  migrando = false;
  busqueda = '';
  filtro: FiltroInventario = 'todos';
  confirmMessage = '';

  constructor(
    private plantillaApi: PlantillaCredencialService,
    private utils: UtilsService,
    private modalManager: ModalManagerService,
    private cdRef: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  // ====================================================================
  // Carga y filtros
  // ====================================================================

  cargar(): void {
    this.cargando = true;
    this.plantillaApi.enrolamientosPrevios().subscribe({
      next: (res) => {
        this.registros = (res?.registros || []) as MedioPendiente[];
        this.cargando = false;
      },
      error: (err) => {
        this.cargando = false;
        this.utils.MuestraErrorInterno(err);
      },
    });
  }

  get totalCruzables(): number {
    return this.registros.filter(r => !!r.cruce).length;
  }

  get totalSinCruce(): number {
    return this.registros.filter(r => !r.cruce).length;
  }

  get totalIncompletos(): number {
    return this.registros.filter(r => !r.foto || !r.firma).length;
  }

  get registrosFiltrados(): MedioPendiente[] {
    const termino = this.busqueda.trim().toUpperCase();

    return this.registros.filter(r => {
      switch (this.filtro) {
        case 'cruzables':   if (!r.cruce) return false; break;
        case 'sin_cruce':   if (r.cruce) return false; break;
        case 'incompletos': if (r.foto && r.firma) return false; break;
      }

      if (!termino) return true;
      return r.rfc.toUpperCase().includes(termino)
        || (r.cruce?.num_empleado || '').toUpperCase().includes(termino)
        || (r.cruce?.nombre || '').toUpperCase().includes(termino);
    });
  }

  seleccionarFiltro(filtro: FiltroInventario): void {
    this.filtro = filtro;
  }

  // ====================================================================
  // Migracion (renombrar a num_empleado)
  // ====================================================================

  /** Renombra un solo archivo al num_empleado con el que cruza. */
  migrarUno(registro: MedioPendiente): void {
    if (!registro.cruce || this.migrando) return;

    this.migrando = true;
    this.plantillaApi.migrarMediosLote([registro.rfc]).subscribe({
      next: (res) => {
        this.migrando = false;
        if (res?.total_migrados) {
          // Ya no esta pendiente: sale del inventario.
          this.registros = this.registros.filter(r => r.rfc !== registro.rfc);
          this.utils.MuestrasToast(
            TipoToast.Success,
            `${registro.rfc} → ${registro.cruce!.num_empleado}`
          );
        } else {
          // El backend no migro nada: lo mas comun es que esa persona ya
          // tuviera foto/firma propias con su num_empleado, en cuyo caso el
          // archivo canonico se respeta y este queda como duplicado.
          this.utils.MuestrasToast(
            TipoToast.Warning,
            'No se renombró: ese empleado ya tiene foto/firma con su número.'
          );
        }
        this.cdRef.detectChanges();
      },
      error: (err) => {
        this.migrando = false;
        this.utils.MuestraErrorInterno(err);
      },
    });
  }

  /** Renombra de golpe todas las capturas cruzables del inventario. */
  confirmarMigrarTodos(): void {
    const total = this.totalCruzables;
    if (!total) return;

    this.confirmMessage =
      `Se renombrarán ${total} capturas para que queden con su número de empleado. `
      + 'Los empleados que ya tengan foto/firma propias no se tocan.';

    this.modalManager.openModal({
      title: 'Cruzar capturas con el roster',
      template: this.confirmDialog,
      onAccept: () => this.migrarTodos(),
    });
  }

  private migrarTodos(): void {
    this.migrando = true;
    this.plantillaApi.migrarMediosLote().subscribe({
      next: (res) => {
        this.migrando = false;
        this.utils.MuestrasToast(
          TipoToast.Success,
          `${res?.total_migrados || 0} capturas renombradas con su número de empleado.`
        );
        this.cargar();
      },
      error: (err) => {
        this.migrando = false;
        this.utils.MuestraErrorInterno(err);
      },
    });
  }

  // ====================================================================
  // Borrado
  // ====================================================================

  confirmarBorrado(registro: MedioPendiente): void {
    this.confirmMessage =
      `¿Eliminar la captura de ${registro.rfc}? Se borrarán su foto y su firma del servidor.`;

    this.modalManager.openModal({
      title: 'Confirmación',
      template: this.confirmDialog,
      onAccept: () => {
        this.plantillaApi.borrarMediosPrevio(registro.rfc).subscribe({
          next: () => {
            this.registros = this.registros.filter(r => r.rfc !== registro.rfc);
            this.utils.MuestrasToast(TipoToast.Success, 'Captura eliminada');
            this.cdRef.detectChanges();
          },
          error: (err) => this.utils.MuestraErrorInterno(err),
        });
      },
    });
  }
}
