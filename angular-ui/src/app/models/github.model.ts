export interface GithubConfig {
  username: string;
  token: string;
  owner: string;
  repo: string;
  pr_target_branch?: string;
}

export interface PullRequestInfo {
  id: number;
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed' | string;
  htmlUrl: string;
  userLogin: string;
  userAvatar?: string;
  createdAt: string;
  updatedAt?: string;
  closedAt?: string;
  mergedAt?: string;
  isDraft: boolean;
  headRef?: string;
  baseRef?: string;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
}
