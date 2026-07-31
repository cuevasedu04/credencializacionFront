import { Component, OnInit, TemplateRef, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { UsuarioService } from '../../../api/usuario/usuario.service';
import { UtilsService } from '../../services/utils.service';
import { TipoToast } from '../../../api/entidades/enumeraciones';
import { SessionService } from '../../services/session.service';

@Component({
  selector: 'app-login',
  standalone: false,
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit {
  @ViewChild('olvidarContrasenaModal', { static: true })
  olvidarContrasenaModal!: TemplateRef<any>;
  @ViewChild('ayudaModal', { static: true })
  ayudaModal!: TemplateRef<any>;

  error = '';
  hiddenPassw = false;
  recordar = false;
  loading = false;
  loginForm!: FormGroup;

  constructor(
    private router: Router,
    private fb: FormBuilder,
    private usuarioApi: UsuarioService,
    private utils: UtilsService,
    private sessionService: SessionService,
    private modalService: NgbModal,
  ) {}

  ngOnInit(): void {
    this.loginForm = this.fb.group({
      usuario: ['', [Validators.required]],
      password: ['', [Validators.required]],
    });

    if (this.sessionService.getUsuario()) {
      this.router.navigate(['/dashboard']);
      return;
    }

    const remembered = this.sessionService.getUserRecordado();
    if (remembered) {
      this.loginForm.patchValue({
        usuario: remembered.usuario,
        password: remembered.password,
      });
      this.loginForm.markAllAsTouched();
    }
  }

  sethidden(): void {
    this.hiddenPassw = !this.hiddenPassw;
  }

  getValidationStatus(controlName: string): 'valid' | 'invalid' | 'none' {
    const control = this.loginForm.get(controlName);
    if (!control) return 'none';
    if (control.valid && (control.dirty || control.touched)) return 'valid';
    if (control.invalid && (control.dirty || control.touched)) return 'invalid';
    return 'none';
  }

  login(): void {
    if (this.loginForm.invalid || this.loading) return;
    this.loading = true;
    this.error = '';

    const payload = {
      email: this.loginForm.value.usuario,
      password: this.loginForm.value.password,
    };

    this.usuarioApi.logIn(payload).subscribe({
      next: (data: any) => {
        this.loading = false;
        if (data.status === 200) {
          this.sessionService.setSession(data.model);
          if (this.recordar) {
            this.sessionService.setUserRecordado({
              usuario: this.loginForm.value.usuario,
              password: this.loginForm.value.password,
            });
          }
          this.router.navigate(['/dashboard']);
        } else {
          this.utils.MuestrasToast(TipoToast.Error, data.message || 'Credenciales incorrectas');
        }
      },
      error: (ex) => {
        this.loading = false;
        this.utils.MuestraErrorInterno(ex);
      },
    });
  }

  openOlvidarContrasenaModal(): void {
    this.modalService.open(this.olvidarContrasenaModal, { centered: true });
  }

  openAyudaModal(): void {
    this.modalService.open(this.ayudaModal, { centered: true });
  }
}
