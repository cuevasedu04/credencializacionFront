import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, Router, UrlTree } from '@angular/router';
import { SessionService } from './session.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {

  constructor(
	private router: Router,
	private sessionS: SessionService
  ) {}

  canActivate(route: ActivatedRouteSnapshot): boolean | UrlTree {
    const session = this.sessionS.getUsuario();

    // No hay sesión activa → al login
    if (!session) {
      return this.router.parseUrl('/login');
    }
	
    const rolesPermitidos = route.data['rolesPermitidos'] as number[] | undefined;
	
    // Si la ruta requiere roles y el usuario no tiene acceso
    if (rolesPermitidos && !rolesPermitidos.includes(session.idUsuarioRol)) {
				
		return this.router.parseUrl('/acceso-denegado'); /*  hiciste algo que no, pillin */
    }

    return true;
  }
}
