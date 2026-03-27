import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EnrolamientoMasivoComponent } from './enrolamiento-masivo.component';

describe('EnrolamientoMasivoComponent', () => {
  let component: EnrolamientoMasivoComponent;
  let fixture: ComponentFixture<EnrolamientoMasivoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [EnrolamientoMasivoComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EnrolamientoMasivoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
