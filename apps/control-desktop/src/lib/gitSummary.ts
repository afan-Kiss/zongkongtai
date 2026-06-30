export const GIT_SUMMARY_STORAGE_KEY = 'zhubo:gitSummary';

export interface GitSummary {
  checkedAt: string | null;
  unpushedCount: number | null;
  dirtyCount: number | null;
  total: number | null;
  checking: boolean;
}

export const EMPTY_GIT_SUMMARY: GitSummary = {
  checkedAt: null,
  unpushedCount: null,
  dirtyCount: null,
  total: null,
  checking: false,
};

export function loadGitSummaryFromStorage(): GitSummary | null {
  try {
    const raw = sessionStorage.getItem(GIT_SUMMARY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GitSummary;
    if (parsed && typeof parsed === 'object')
      return { ...EMPTY_GIT_SUMMARY, ...parsed, checking: false };
  } catch {
    /* ignore */
  }
  return null;
}

export function saveGitSummaryToStorage(summary: GitSummary) {
  try {
    sessionStorage.setItem(
      GIT_SUMMARY_STORAGE_KEY,
      JSON.stringify({ ...summary, checking: false }),
    );
  } catch {
    /* ignore */
  }
}
