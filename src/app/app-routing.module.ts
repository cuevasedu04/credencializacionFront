import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { GeneralComponent } from './layouts/general/general.component';
import { DashboardComponent } from './content/dashboard/dashboard.component';
import { UxDesignComponent } from './content/ux-design/ux-design.component';
import { BusquedaAvanzadaComponent } from './content/busqueda-avanzada/busqueda-avanzada.component';
import { ReportesComponent } from './content/reportes/reportes.component';
import { UnitTestComponent } from './content/unit-test/unit-test.component';
import { AuthGuard } from './services/auth-guard';
import { AccesoDenegadoComponent } from './content/acceso-denegado/acceso-denegado.component';
import { RegistroEmpleadoComponent } from './content/registro-empleado/registro-empleado.component';
import { EnrolamientoComponent } from './content/enrolamiento/enrolamiento.component';
import { CredencializacionComponent } from './content/credencializacion/credencializacion.component';
import { CargaMasivaComponent } from './content/carga-masiva/carga-masiva.component';
import { ProvisionalComponent} from './content/provisional/provisional.component';
import { FamiliarComponent } from './content/familiar/familiar.component';
import { PlantillaAnamComponent } from './content/plantilla-anam/plantilla-anam.component';
import { BlockAccessGuard } from './services/block-access.guard';

const routes: Routes = [
  {
    path: 'auth',
    loadChildren: () =>
      import('./content/cuenta/cuenta.module').then((m) => m.CuentaModule),
  },
  {
    path: '',
    component: GeneralComponent,
    canActivate: [AuthGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' 
      },
      { path: 'dashboard', component: DashboardComponent 
      },
      {
        path: 'familiar',
        component: FamiliarComponent,
        canActivate: [AuthGuard],
        data: { rolesPermitidos: [1, 2, 3, 4, 9999] },
      },
      {
        path: 'plantilla-anam',
        component: PlantillaAnamComponent,
        canActivate: [AuthGuard, BlockAccessGuard],
        data: { rolesPermitidos: [1, 2, 3, 4, 9999] },
      },
      {
        path: 'provisional',
        component: ProvisionalComponent,
        canActivate: [AuthGuard, BlockAccessGuard],
        data: { rolesPermitidos: [1, 2, 3, 4, 9999] },
      },
      {
        path: 'busqueda-avanzada',
        component: BusquedaAvanzadaComponent,
        canActivate: [AuthGuard],
        data: { rolesPermitidos: [1, 2, 3, 4, 9999] },
      },
      {
        path: 'reportes',
        component: ReportesComponent,
        canActivate: [AuthGuard],
        data: { rolesPermitidos: [1, 2, 3, 9999] },
      },
      {
        path: 'registro-empleado',
        component: RegistroEmpleadoComponent,
        canActivate: [AuthGuard],
        data: { rolesPermitidos: [1, 9999] },
      },
      {
        path: 'enrolamiento',
        component: EnrolamientoComponent,
        canActivate: [AuthGuard, BlockAccessGuard],
        data: { rolesPermitidos: [1, 2, 3, 4, 9999] },
      },
      {
        path: 'credencializacion',
        component: CredencializacionComponent,
        canActivate: [AuthGuard],
        data: { rolesPermitidos: [1, 2, 3, 9999] },
      },
      {
        path: 'carga-masiva',
        component: CargaMasivaComponent,
        canActivate: [AuthGuard],
        data: { rolesPermitidos: [1, 2, 9999] },
      },
      {
        path: 'test',
        component: UnitTestComponent,
        canActivate: [AuthGuard],
        data: { rolesPermitidos: [9999] }, // o lo que tú consideres
      },
    ],
  },
  {
    path: 'acceso-denegado',
    component: AccesoDenegadoComponent,
  },
  { path: '**', redirectTo: 'auth/login' },
  {
    path: 'ux-design',
    component: UxDesignComponent,
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)] /*, { enableTracing: true }  */,
  exports: [RouterModule],
})
export class AppRoutingModule {}
