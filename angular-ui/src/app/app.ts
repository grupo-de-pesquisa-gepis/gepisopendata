import { Component, ViewChild, HostListener, inject, OnInit, signal, OnDestroy, computed, isDevMode } from '@angular/core';
import { RouterOutlet, RouterLink, Router } from '@angular/router';
import { FixedHead } from './components/layout/fixed-head/fixed-head';
import { FixedStatusbar } from './components/layout/fixed-statusbar/fixed-statusbar';

import { MatSidenavModule, MatDrawer } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ConfigService } from './services/config.service';
import { TauriConfigService } from './services/tauri-config.service';
import { DatasetStateService } from './services/dataset-state.service';
import { isTauri } from './services/environment';
import { JsonPipe, CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { FixedSearch } from './components/layout/fixed-search/fixed-search';
import { SearchInPageService } from './services/search-in-page.service';

import { AutoTooltipDirective } from './directives';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    MatDividerModule,
    MatExpansionModule,
    MatTooltipModule,
    AutoTooltipDirective,
    FixedHead,
    FixedStatusbar,
    FixedSearch,
  ],
})
export class App implements OnInit, OnDestroy {
  @ViewChild('drawer') drawer!: MatDrawer;
  isSmallScreen = false;

  configService = inject(ConfigService);
  searchService = inject(SearchInPageService);
  stateService = inject(DatasetStateService);
  router = inject(Router);
  config = signal<Record<string, unknown> | null>(null);
  lastMenuEvent = signal<string | null>(null);

  private menuSub?: Subscription;

  constructor() {
    this.checkScreenSize();
  }

  ngOnInit(): void {
    this.configService.loadConfig().subscribe((config) => {
      this.config.set(config);
      if (isDevMode()) {
        console.log('App Configuration:', config);
        console.log('Environment Info:', {
          isTauri: isTauri(),
          configServiceType: this.configService instanceof TauriConfigService ? 'Tauri' : 'Web'
        });
      }
    });

    if (this.configService instanceof TauriConfigService) {
      this.menuSub = this.configService.menuNavigation$.subscribe((menuId) => {
        if (isDevMode()) {
          console.log('Received menu event in App component:', menuId);
        }
        this.lastMenuEvent.set(menuId);
        this.handleMenuNavigation(menuId);
      });
    }
  }

  ngOnDestroy(): void {
    this.menuSub?.unsubscribe();
  }

  private handleMenuNavigation(menuId: string) {
    if (isDevMode()) {
      console.log(`Handling menu navigation for ID: ${menuId}`);
    }
    let route = '';
    switch (menuId) {
      case 'obter_dados':
        route = '/desktop/datasets/get';
        break;
      case 'listar_dados':
        route = '/desktop/datasets/list';
        break;
      case 'gerenciar_dados':
        route = '/desktop/datasets/manage';
        break;
      case 'selecionar_dados':
        route = '/desktop/analysis/select';
        break;
      case 'configurar_variaveis':
        route = '/desktop/analysis/config';
        break;
      case 'analises_descritivas':
        route = '/desktop/analysis/descritiva';
        break;
      case 'config_colaboracao':
        route = '/desktop/settings/collaboration';
        break;
      case 'list_pull_requests':
        route = '/desktop/settings/pull-requests';
        break;
      default:
        console.warn(`Unrecognized menu ID: ${menuId}`);
        return;
    }

    if (route) {
      if (this.router.url === route) {
        if (isDevMode()) console.log(`Already on route: ${route}, skipping navigation.`);
        return;
      }
      if (isDevMode()) {
        console.log(`Attempting to navigate to: ${route}`);
      }
      this.router.navigate([route]).then(
        (success) => {
          if (success) {
            if (isDevMode()) {
              console.log(`Navigation to ${route} succeeded`);
            }
          } else {
            console.error(`Navigation to ${route} failed (denied or already there)`);
          }
        },
        (error) => {
          console.error(`Navigation to ${route} errored:`, error);
        }
      );
    }
  }

  @HostListener('window:resize', ['$event'])
  onResize() {
    this.checkScreenSize();
  }

  @HostListener('window:keydown.control.f', ['$event'])
  onCtrlF(event: KeyboardEvent) {
    event.preventDefault();
    this.searchService.toggle();
  }

  toggleDrawer() {
    this.drawer.toggle();
  }

  goToArtifact(analysisId: string, artifactId: string) {
    this.router.navigate(['/published', analysisId, artifactId]);
    if (this.isSmallScreen) {
      this.drawer.close();
    }
  }

  checkScreenSize() {
    this.isSmallScreen = window.innerWidth < 768;
  }
}
