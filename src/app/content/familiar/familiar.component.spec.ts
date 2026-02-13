import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FamiliarComponent } from './familiar.component';

describe('FamiliarComponent', () => {
  let component: FamiliarComponent;
  let fixture: ComponentFixture<FamiliarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [FamiliarComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FamiliarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
