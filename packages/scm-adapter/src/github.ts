import { appendFileSync } from "node:fs";
import type {
  Annotation,
  AnnotationLevel,
  CheckConclusion,
  InlineComment,
  ScmAdapter,
} from "./types.js";

const LEVEL_COMMAND: Record<AnnotationLevel, string> = {
  notice: "notice",
  warning: "warning",
  failure: "error",
};

function escapeData(s: string): string {
  return s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function escapeProp(s: string): string {
  return escapeData(s).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

/**
 * GitHub Actions implementation of the SCM adapter. Uses workflow commands on
 * stdout for annotations and the step-summary file for the summary. Inline PR
 * comments require the REST API and arrive in a later phase; for now they are
 * downgraded to annotations so nothing is silently dropped.
 */
export class GitHubActionsAdapter implements ScmAdapter {
  constructor(
    private readonly out: (line: string) => void = (l) => process.stdout.write(l + "\n"),
    private readonly summaryPath: string | undefined = process.env["GITHUB_STEP_SUMMARY"],
  ) {}

  emitAnnotation(a: Annotation): void {
    const cmd = LEVEL_COMMAND[a.level];
    const props: string[] = [`title=${escapeProp(a.title)}`];
    if (a.path) props.push(`file=${escapeProp(a.path)}`);
    if (a.line !== undefined) props.push(`line=${a.line}`);
    this.out(`::${cmd} ${props.join(",")}::${escapeData(a.message)}`);
  }

  postSummary(markdown: string): void {
    if (this.summaryPath) {
      appendFileSync(this.summaryPath, markdown + "\n", "utf8");
    } else {
      this.out(markdown);
    }
  }

  postInlineComments(comments: InlineComment[]): void {
    for (const c of comments) {
      this.emitAnnotation({
        level: "warning",
        path: c.path,
        line: c.line,
        title: "SpecGate",
        message: c.body,
      });
    }
  }

  setConclusion(conclusion: CheckConclusion, summary: string): void {
    this.postSummary(`\n**SpecGate conclusion: ${conclusion.toUpperCase()}** — ${summary}`);
  }
}

export const GITHUB_ANNOTATION_PREFIX = "::";
