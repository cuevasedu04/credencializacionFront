import { Component } from '@angular/core';
import { SessionService } from '../../services/session.service';
import { ModuleContextService, SidebarBlock } from '../../services/module-context.service';

@Component({
  selector: 'app-dashboard',
  standalone: false,
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  usuario:any= {};
  constructor(
    private sessionS: SessionService,
    private moduleContext: ModuleContextService
  ) {}

  ngOnInit(): void {
    //Called after the constructor, initializing input properties, and the first call to ngOnChanges.
    //Add 'implements OnInit' to the class.
    this.usuario = this.sessionS.getUsuario();
    this.moduleContext.clearBlock();
  }

  seleccionarBloque(bloque: Exclude<SidebarBlock, null>): void {
    this.moduleContext.setBlock(bloque);
  }

  esBloqueActivo(bloque: Exclude<SidebarBlock, null>): boolean {
    return this.moduleContext.selectedBlock() === bloque;
  }

  public openDocument(type: 'manual' | 'privacy' | 'regulation'): void {
    let url: string;

    switch (type) {
      case 'manual':
        url = '/docs/Manual de usuario_SCG_NV.pdf';
        break;
      case 'privacy':
        url = '/docs/Aviso de privacidad SCG.pdf';
        break;
      case 'regulation':
        url = '/docs/RIANAM_2023.pdf';
        break;
      default:
        console.error('Tipo de documento no válido');
        return;
    }

    // Abre el documento en una nueva pestaña/ventana
    window.open(url, '_blank');
  }
}
