import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PlantillaAnamComponent } from './plantilla-anam.component';

describe('PlantillaAnamComponent', () => {
  let component: PlantillaAnamComponent;
  let fixture: ComponentFixture<PlantillaAnamComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [PlantillaAnamComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PlantillaAnamComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
