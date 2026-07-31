import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class UsuarioService {

  /* urlBase: string = "http://safirho.site/api/login/"; */
  urlBase: string = environment.baseurl + "user";

  constructor(private http: HttpClient) { }

  logIn(data:any) {
    return this.http.post('/api/login/', data);
  }
  registrarUsuario(data:any) {
    return this.http.post(this.urlBase + "/registrarUsuario", data);
  }
  updateUsuario(data:any) {
    return this.http.post(this.urlBase + "/updateUsuario", data);
  }
  activacionUsuario(data:any) {
    return this.http.post(this.urlBase + "/activacionUsuario", data);
  }
  obtenerUsuarioAdmin(data:any) {
    return this.http.post(this.urlBase + "/getUsuariosAdmin", data);
  }
  actualizarUsuario(data:any) {
    return this.http.post(this.urlBase + "/actualizarUsuario", data);
  }
  activarUsuario(data:any) {
    return this.http.post(this.urlBase + "/activarUsuario", data);
  }
  getUserlog(data:any) {
    return this.http.post(this.urlBase + "/getUserlog", data);
  }

  

}

