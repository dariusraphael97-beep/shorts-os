// src/lib/lab/drafts-view.ts
//
// Pure mapping from a your_videos row (+ its review verdict) to a drafts-table
// row view-model. No JSX, no IO.

export type DraftStatus =
  | "draft"
  | "rendering"
  | "rendered"
  | "scheduled"
  | "uploading"
  | "posted"
  | "failed";

export type ReviewVerdict = "ship" | "revise" | "block";
export type DraftAction = "render" | "review" | "upload";

const STATUS_LABEL: Record<DraftStatus, string> = {
  draft: "Draft",
  rendering: "Rendering",
  rendered: "Rendered",
  scheduled: "Scheduled",
  uploading: "Uploading",
  posted: "Posted",
  failed: "Failed",
};

export interface DraftRowVM {
  id: string;
  title: string;
  status: DraftStatus;
  statusLabel: string;
  verdict: ReviewVerdict | null;
  thumbnailUrl: string | null;
  actions: DraftAction[];
}

export function toDraftRow(input: {
  id: string;
  title: string;
  status: DraftStatus;
  review_verdict: ReviewVerdict | null;
  thumbnail_url: string | null;
}): DraftRowVM {
  const actions: DraftAction[] = [];

  if (input.status === "draft") {
    actions.push("render");
  }
  if (input.status === "rendered" || input.status === "scheduled") {
    actions.push("review", "upload");
  }

  return {
    id: input.id,
    title: input.title,
    status: input.status,
    statusLabel: STATUS_LABEL[input.status],
    verdict: input.review_verdict ?? null,
    thumbnailUrl: input.thumbnail_url,
    actions,
  };
}
