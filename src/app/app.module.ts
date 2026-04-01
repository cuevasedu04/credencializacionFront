import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { DashboardComponent } from './content/dashboard/dashboard.component';
import { UxDesignComponent } from './content/ux-design/ux-design.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SharedModule } from './components/shared/shared.module';
import { LayoutsModule } from './layouts/layouts.module';
import { BusquedaAvanzadaComponent } from './content/busqueda-avanzada/busqueda-avanzada.component';
import { ReportesComponent } from './content/reportes/reportes.component';
import { UnitTestComponent } from './content/unit-test/unit-test.component';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ToastrModule } from 'ngx-toastr';
import { HttpClientModule } from '@angular/common/http';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { LoaderInterceptor } from './components/shared/interceptors/loader.interceptor';
import { TokenInterceptor } from './components/shared/interceptors/token.interceptor';
import { DataTablesModule } from 'angular-datatables';
import { AccesoDenegadoComponent } from './content/acceso-denegado/acceso-denegado.component';
import { AgGridModule } from 'ag-grid-angular';
import { RegistroEmpleadoComponent } from './content/registro-empleado/registro-empleado.component';
import { EnrolamientoComponent } from './content/enrolamiento/enrolamiento.component';
import { ConsultaEnrolamientoComponent } from './content/enrolamiento/consulta-enrolamiento/consulta-enrolamiento.component';
import { PlantillaEnrolamientoComponent } from './content/enrolamiento/plantilla-enrolamiento/plantilla-enrolamiento.component';
import { CredencializacionComponent } from './content/credencializacion/credencializacion.component';
import { CargaMasivaComponent } from './content/carga-masiva/carga-masiva.component';
import { ProvisionalComponent } from './content/provisional/provisional.component';
import { FamiliarComponent } from './content/familiar/familiar.component';
import { PlantillaAnamComponent } from './content/plantilla-anam/plantilla-anam.component';
import { EnrolamientoMasivoComponent } from './content/enrolamiento-masivo/enrolamiento-masivo.component';
import { BusquedaEnrolamientoMasivosComponent } from './content/busqueda-enrolamiento-masivos/busqueda-enrolamiento-masivos.component';

@NgModule({
  declarations: [
    AppComponent,
    DashboardComponent,
    UxDesignComponent,
    BusquedaAvanzadaComponent,
    ReportesComponent,
    UnitTestComponent,
    AccesoDenegadoComponent,
    RegistroEmpleadoComponent,
    EnrolamientoComponent,
    ConsultaEnrolamientoComponent,
    PlantillaEnrolamientoComponent,
    CredencializacionComponent,
    CargaMasivaComponent,
    ProvisionalComponent,
    FamiliarComponent,
    PlantillaAnamComponent,
    EnrolamientoMasivoComponent,
    BusquedaEnrolamientoMasivosComponent
  ],
  imports: [
    DataTablesModule,
    LayoutsModule,
    BrowserModule,
    AppRoutingModule,
    FormsModule,
    ReactiveFormsModule,
    SharedModule,
    AppRoutingModule,
    NgbModule,  
    BrowserAnimationsModule,
    ToastrModule.forRoot({
      timeOut: 3000,
      positionClass: 'toast-top-right',
      preventDuplicates: true,
    }), 
    HttpClientModule,
    AgGridModule
  ],
  providers: [
    {
      provide: HTTP_INTERCEPTORS,
      useClass: LoaderInterceptor,
      multi: true
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: TokenInterceptor,
      multi: true
    }
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
