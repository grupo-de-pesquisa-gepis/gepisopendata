export interface GithubConfig {
  username: string;
  token: string;
  owner: string;
  repo: string;
  pr_target_branch?: string;
}
