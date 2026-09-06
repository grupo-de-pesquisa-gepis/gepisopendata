import {
  Directive,
  ElementRef,
  HostListener,
  Input,
  inject,
  OnInit,
} from '@angular/core';
import { MatTooltip } from '@angular/material/tooltip';

@Directive({
  selector: '[appAutoTooltip]',
  standalone: true,
  hostDirectives: [
    {
      directive: MatTooltip,
      inputs: [
        'matTooltipPosition: tooltipPosition',
        'matTooltipClass: tooltipClass',
        'matTooltipShowDelay: tooltipShowDelay',
        'matTooltipHideDelay: tooltipHideDelay',
      ],
    },
  ],
})
export class AutoTooltipDirective implements OnInit {
  private elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private matTooltip = inject(MatTooltip);

  /**
   * Optional custom text to display. If omitted or empty, the element's textContent is used.
   */
  @Input('appAutoTooltip') tooltipText?: string;

  /**
   * If true, always display the tooltip on hover regardless of truncation. Default is false.
   */
  @Input() tooltipAlways = false;

  ngOnInit() {
    this.matTooltip.disabled = true;
  }

  @HostListener('mouseenter')
  onMouseEnter() {
    const el = this.elementRef.nativeElement;
    // Check if element has horizontal or vertical overflow
    const isTruncated =
      el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight;

    const text =
      this.tooltipText && this.tooltipText.trim().length > 0
        ? this.tooltipText.trim()
        : el.textContent?.trim() || '';

    if ((isTruncated || this.tooltipAlways) && text.length > 0) {
      this.matTooltip.message = text;
      this.matTooltip.disabled = false;
      this.matTooltip.show();
    } else {
      this.matTooltip.disabled = true;
      this.matTooltip.hide();
    }
  }

  @HostListener('mouseleave')
  onMouseLeave() {
    this.matTooltip.disabled = true;
  }
}
