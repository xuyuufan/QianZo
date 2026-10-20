import type { SubmissionReviewOutcome } from "@/platform/db/schema";

export type DeliverySubmissionDTO = {
  id: string;
  sequence: number;
  summary: string;
  links: string[];
  createdAt: string;
  review: DeliveryReviewDTO | null;
};

export type DeliveryReviewDTO = {
  outcome: SubmissionReviewOutcome;
  criteriaResults: Array<{ position: number; outcome: SubmissionReviewOutcome }>;
  reason: string | null;
  createdAt: string;
};

export type SubmittedDeliveryDTO = Omit<DeliverySubmissionDTO, "review">;

export type DeliveryMutationDTO = {
  submission: SubmittedDeliveryDTO;
  replayed: boolean;
};

export type ReviewMutationDTO = {
  submissionId: string;
  outcome: SubmissionReviewOutcome;
  replayed: boolean;
  projectStatus: "IN_PROGRESS" | "FINAL_REVIEW" | "COMPLETED";
};

export type CompletionDTO = {
  projectId: string;
  status: "COMPLETED";
  completedAt: string;
  replayed: boolean;
};
