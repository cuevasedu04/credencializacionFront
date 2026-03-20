import { Component, effect, EffectRef, OnDestroy, OnInit } from '@angular/core';
import { SidebarService } from '../../../services/sidebar-service.service';
import { NavigationEnd, Router } from '@angular/router';
import { UtilsService } from '../../../services/utils.service';
import { SessionService } from '../../../services/session.service';
import { ModuleContextService } from '../../../services/module-context.service';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-sidebar',
  standalone: false,
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent implements OnInit, OnDestroy {
  usuario:any = null;
  private routerSub?: Subscription;
  private blockEffect?: EffectRef;
  constructor(
    private router: Router,
    public sidebarService: SidebarService,
    private utils: UtilsService,
	private sessionS: SessionService,
    public moduleContext: ModuleContextService
  ){
    this.blockEffect = effect(() => {
      this.moduleContext.selectedBlock();
      this.rebuildMenu();
    });
  }
  menuItems = [
    {
      id: 'Carga masiva',
      label: 'Carga excel',      
      icon: 'fas fa-upload',
      link: '/carga-masiva',
      rol: [1,2,9999],
    },
    {
      id: 'enrolamiento',
      label: 'Enrolamiento',      
      icon: 'fas fa-user-plus',
      link: '/enrolamiento',
      rol: [1,2,3,4,9999],
    },
    //  {
    //    id: 'credencializacion',
    //    label: 'Impresión',      
    //    icon: 'fas fa-id-card',
    //    link: '/credencializacion',
    //    rol: [1,2,3,9999],
    //  },
    {
      id: 'provisional',
      label: 'Carga manual - NL',      
      icon: 'fa-solid fa-id-badge',
      link: '/provisional',
      rol: [1,2,3,9999],
    },
    {
      id: 'familiar',
      label: 'Familiares - NL',      
      icon: 'fa-solid fa-id-badge',
      link: '/familiar',
      rol: [1,2,3,9999],
    },
    {
      id: 'plantilla-anam',
      label: 'Carga manual - ANAM',
      icon: 'fa-solid fa-id-badge',
      link: '/plantilla-anam',
      rol: [1,2,3,9999],
    },
    {
      id: 'busquedaAvanzada',
      label: 'Búsqueda avanzada',      
      icon: 'fas fa-search',
      link: '/busqueda-avanzada',
      rol: [1,2,3,4,9999],
    },
    {
      id: 'reportes',
      label: 'Reportes',
      icon: 'fas fa-chart-pie',
      link: '/reportes',
      rol: [1,2,3,9999],
    },


  ];
  menuUsuario:any = []
  ngOnInit(): void {
    this.usuario = this.sessionS.getUsuario();
	this.rebuildMenu();

    this.routerSub = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        if (event.urlAfterRedirects.includes('/dashboard')) {
          this.moduleContext.clearBlock();
        }
        this.rebuildMenu();
      });
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
    this.blockEffect?.destroy();
  }

  private rebuildMenu(): void {
    const menuPorRol = this.menuItems.filter(item => item.rol.includes(this.usuario?.idUsuarioRol));
    const bloque = this.moduleContext.resolveBlockFromRoute(this.router.url);
    const idsPermitidos = this.moduleContext.getAllowedIds(bloque);

    if (this.router.url.includes('/dashboard') && !bloque) {
      this.menuUsuario = [];
      return;
    }

    this.menuUsuario = idsPermitidos.length
      ? menuPorRol.filter(item => idsPermitidos.includes(item.id))
      : menuPorRol;
  }

  get mostrarMensajeDashboard(): boolean {
    return this.router.url.includes('/dashboard') && this.menuUsuario.length === 0;
  }


   /**
   * Navega al enlace del ítem y colapsa si está en móvil
   */
selectItem(item: any, event: Event): void {
  event.preventDefault();
  this.router.navigate([item.link]);
  this.sidebarService.autoCloseOnMobile();
}

  /**
   * Cierra el sidebar cuando se hace click en el overlay
   */
  public onOverlayClick(): void {
    this.sidebarService.collapseSidebar();
  }
}