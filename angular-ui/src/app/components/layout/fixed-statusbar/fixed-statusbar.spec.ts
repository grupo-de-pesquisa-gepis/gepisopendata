import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { FixedStatusbar } from './fixed-statusbar';
import { ConfigService } from '../../../services/config.service';
import { WebConfigService } from '../../../services/web-config.service';

describe('FixedStatusbar', () => {
  let component: FixedStatusbar;
  let fixture: ComponentFixture<FixedStatusbar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FixedStatusbar],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ConfigService, useClass: WebConfigService },
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FixedStatusbar);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
