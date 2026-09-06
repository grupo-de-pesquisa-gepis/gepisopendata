import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { GithubApiService } from '../../../../services';
import { GithubConfig } from '../../../../models';

@Component({
  selector: 'app-collaboration-settings-view',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
  ],
  templateUrl: './collaboration-settings-view.html',
  styleUrl: './collaboration-settings-view.css',
})
export class CollaborationSettingsView implements OnInit {
  private fb = inject(FormBuilder);
  private githubApi = inject(GithubApiService);
  private snackBar = inject(MatSnackBar);

  isTesting = signal<boolean>(false);
  isSaving = signal<boolean>(false);
  hideToken = true;

  configForm = this.fb.group({
    username: ['', Validators.required],
    token: ['', Validators.required],
    owner: ['', Validators.required],
    repo: ['', Validators.required],
    pr_target_branch: ['production', Validators.required],
  });

  ngOnInit() {
    this.loadConfig();
  }

  async loadConfig() {
    try {
      const config = await this.githubApi.getGithubConfig();
      if (config) {
        this.configForm.patchValue({
          username: config.username,
          token: config.token,
          owner: config.owner,
          repo: config.repo,
          pr_target_branch: config.pr_target_branch || 'production',
        });
      }
    } catch (err) {
      console.error('Erro ao carregar configurações do GitHub:', err);
    }
  }

  async saveConfig() {
    if (this.configForm.invalid) return;

    this.isSaving.set(true);
    try {
      await this.githubApi.saveGithubConfig(this.configForm.value as GithubConfig);
      this.snackBar.open('Configurações salvas com sucesso!', 'OK', { duration: 4000 });
    } catch (err) {
      this.snackBar.open(`Erro ao salvar: ${err}`, 'Fechar', { duration: 6000 });
    } finally {
      this.isSaving.set(false);
    }
  }

  async testConnection() {
    if (this.configForm.invalid) return;

    this.isTesting.set(true);
    const { token, owner, repo } = this.configForm.value;

    try {
      const result = await this.githubApi.testConnection(token!, owner!, repo!);
      this.snackBar.open(result, 'OK', { duration: 5000 });
    } catch (err) {
      this.snackBar.open(err as string, 'Fechar', { duration: 8000 });
    } finally {
      this.isTesting.set(false);
    }
  }
}
