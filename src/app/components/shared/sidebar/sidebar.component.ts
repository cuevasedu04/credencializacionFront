import { AfterViewInit, Component, inject, OnInit } from '@angular/core';
import { SidebarService } from '../../../services/sidebar-service.service';
import { Router } from '@angular/router';
import { UtilsService } from '../../../services/utils.service';
import { SessionService } from '../../../services/session.service';

@Component({
  selector: 'app-sidebar',
  standalone: false,
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent implements OnInit {
  usuario:any = null;
  constructor(
    private router: Router,
    public sidebarService: SidebarService,
    private utils: UtilsService,
	private sessionS: SessionService
  ){}
  menuItems = [
    {
      id: 'Carga masiva',
      label: 'Carga masiva',      
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
    {
      id: 'credencializacion',
      label: 'Impresión',      
      icon: 'fas fa-id-card',
      link: '/credencializacion',
      rol: [1,2,3,9999],
    },
    {
      id: 'provisional',
      label: 'Carga manual',      
      icon: 'fa-solid fa-id-badge',
      link: '/provisional',
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
	this.menuUsuario = this.menuItems.filter(item => item.rol.includes(this.usuario.idUsuarioRol));
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