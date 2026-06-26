/**
 * SCM adapter interface — platform-neutral. Concrete implementations (GitHub,
 * GitLab, …) live in their own modules behind this interface so the engine and
 * the Action depend only on the abstraction.
 */

export type AnnotationLevel = "notice" | "warning" | "failure";

export interface Annotation {
  level: AnnotationLevel;
  /** Repo-relative file path the annotation concerns, if any. */
  path?: string;
  /** 1-based line number, if any. */
  line?: number;
  title: string;
  message: string;
}

export type CheckConclusion = "success" | "failure" | "neutral";

/** A finding to be posted as an inline review comment on a changed line. */
export interface InlineComment {
  path: string;
  line: number;
  body: string;
}

export interface ScmAdapter {
  /** Emit an annotation surfaced on the PR / commit. */
  emitAnnotation(a: Annotation): void | Promise<void>;
  /** Post a single summary, e.g. a PR comment or check summary. */
  postSummary(markdown: string): void | Promise<void>;
  /** Post inline review comments (Phase 2+). May be a no-op for some adapters. */
  postInlineComments(comments: InlineComment[]): void | Promise<void>;
  /** Record the overall gate conclusion. */
  setConclusion(conclusion: CheckConclusion, summary: string): void | Promise<void>;
}
