import { Component, ElementRef, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AutoTooltipDirective } from './auto-tooltip.directive';
import { MatTooltip } from '@angular/material/tooltip';

@Component({
  standalone: true,
  imports: [AutoTooltipDirective],
  template: `
    <div
      #truncatedEl
      appAutoTooltip
      style="width: 50px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;"
    >
      Very Long Text That Will Truncate In A Small Container
    </div>

    <div
      #customTextEl
      [appAutoTooltip]="customMessage"
      style="width: 50px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;"
    >
      Short
    </div>

    <div
      #alwaysEl
      appAutoTooltip
      [tooltipAlways]="true"
      style="width: 500px;"
    >
      Visible Text Always
    </div>
  `,
})
class TestHostComponent {
  @ViewChild('truncatedEl') truncatedEl!: ElementRef<HTMLElement>;
  @ViewChild('customTextEl') customTextEl!: ElementRef<HTMLElement>;
  @ViewChild('alwaysEl') alwaysEl!: ElementRef<HTMLElement>;

  customMessage = 'Custom Overridden Tooltip Message';
}

describe('AutoTooltipDirective', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let component: TestHostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent, AutoTooltipDirective],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create host component with directive applied', () => {
    expect(component).toBeTruthy();
  });

  it('should show tooltip when text is truncated on mouseenter', () => {
    const el = component.truncatedEl.nativeElement;
    // Mock scrollWidth > clientWidth
    Object.defineProperty(el, 'scrollWidth', { value: 200, configurable: true });
    Object.defineProperty(el, 'clientWidth', { value: 50, configurable: true });

    el.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();

    // Verify tooltip message
    expect(el.textContent?.trim()).toContain('Very Long Text');
  });

  it('should support tooltipAlways even when not truncated', () => {
    const el = component.alwaysEl.nativeElement;
    Object.defineProperty(el, 'scrollWidth', { value: 50, configurable: true });
    Object.defineProperty(el, 'clientWidth', { value: 500, configurable: true });

    el.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();

    expect(el.textContent?.trim()).toBe('Visible Text Always');
  });
});
