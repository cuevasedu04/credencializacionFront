import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router } from '@angular/router';
import { ModuleContextService } from './module-context.service';

@Injectable({ providedIn: 'root' })
export class BlockAccessGuard implements CanActivate {
  constructor(
    private moduleContext: ModuleContextService,
    private router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot): boolean {
    const path = route.routeConfig?.path;
    const block = this.moduleContext.selectedBlock();

    if (path === 'plantilla-anam' && block !== 'anam') {
      this.router.navigate(['/dashboard']);
      return false;
    }

    if (path === 'provisional' && block !== 'nuevo-laredo') {
      this.router.navigate(['/dashboard']);
      return false;
    }

    return true;
  }
}
