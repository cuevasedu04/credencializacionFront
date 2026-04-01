import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BusquedaEnrolamientoMasivosComponent } from './busqueda-enrolamiento-masivos.component';

describe('BusquedaEnrolamientoMasivosComponent', () => {
  let component: BusquedaEnrolamientoMasivosComponent;
  let fixture: ComponentFixture<BusquedaEnrolamientoMasivosComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [BusquedaEnrolamientoMasivosComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BusquedaEnrolamientoMasivosComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
