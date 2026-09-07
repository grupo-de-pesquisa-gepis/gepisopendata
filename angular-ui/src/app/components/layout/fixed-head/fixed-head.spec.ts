import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';

import { FixedHead } from './fixed-head';

describe('FixedHead', () => {
  let component: FixedHead;
  let fixture: ComponentFixture<FixedHead>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FixedHead],
      providers: [provideZonelessChangeDetection()]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FixedHead);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
