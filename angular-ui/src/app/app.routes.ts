import { Routes } from '@angular/router';
import { ViewHome } from './components/views/web/view-home/view-home';
import { ViewAbout } from './components/views/web/view-about/view-about';
import { DesktopHomeView } from './components/views/desktop/desktop-home-view/desktop-home-view';
import { isTauriGuard } from './guards/is-tauri.guard';

export const routes: Routes = [
  {
    path: '',
    component: ViewHome,
  },
  {
    path: 'about',
    component: ViewAbout,
  },
  {
    path: 'published/:analysisId/:artifactId',
    loadComponent: () =>
      import('./components/views/desktop/analysis/descritiva/published-artifact-view').then(
        (m) => m.PublishedArtifactView
      ),
  },
  {
    path: 'desktop',
    canActivate: [isTauriGuard],
    children: [
      {
        path: '',
        component: DesktopHomeView,
      },
      {
        path: 'datasets/get',
        loadComponent: () =>
          import('./components/views/desktop/datasets/get/dataset-get-view').then(
            (m) => m.DatasetGetView
          ),
      },
      {
        path: 'datasets/list',
        loadComponent: () =>
          import('./components/views/desktop/datasets/list/dataset-list-view').then(
            (m) => m.DatasetListView
          ),
      },
      {
        path: 'datasets/manage',
        loadComponent: () =>
          import('./components/views/desktop/datasets/list/dataset-list-view').then(
            (m) => m.DatasetListView
          ),
      },
      {
        path: 'analysis/select',
        loadComponent: () =>
          import('./components/views/desktop/analysis/select/dataset-select-view').then(
            (m) => m.DatasetSelectView
          ),
      },
      {
        path: 'analysis/config',
        loadComponent: () =>
          import('./components/views/desktop/analysis/config/variable-config-view').then(
            (m) => m.VariableConfigView
          ),
      },
      {
        path: 'analysis/descritiva',
        loadComponent: () =>
          import('./components/views/desktop/analysis/descritiva/descritiva-view').then(
            (m) => m.DescritivaView
          ),
      },
      {
        path: 'analysis/descritiva/barchart',
        loadComponent: () =>
          import('./components/views/desktop/analysis/descritiva/bar-chart-view').then(
            (m) => m.BarChartView
          ),
      },
      {
        path: 'settings/collaboration',
        loadComponent: () =>
          import('./components/views/desktop/settings/collaboration-settings-view').then(
            (m) => m.CollaborationSettingsView
          ),
      },
      {
        path: 'settings/pull-requests',
        loadComponent: () =>
          import('./components/views/desktop/settings/pull-requests/pull-requests-list-view').then(
            (m) => m.PullRequestsListView
          ),
      },
      {
        path: 'settings/dados-abertos/malhas-ibge',
        loadComponent: () =>
          import('./components/views/desktop/settings/dados-abertos/malhas-ibge/malhas-ibge-view').then(
            (m) => m.MalhasIbgeView
          ),
      },
    ],
  },
];
