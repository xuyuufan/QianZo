import type { MilestoneStatus } from "@/platform/db/schema";
import type { DeliverySubmissionDTO } from "@/modules/delivery/dto";

export type WorkspaceMilestoneDTO = {
  id: string;
  currentSubmissionId: string | null;
  position: number;
  title: string;
  description: string;
  deadline: string;
  status: MilestoneStatus;
  submissions: DeliverySubmissionDTO[];
  deliverables: Array<{ title: string; description: string }>;
  acceptanceCriteria: Array<{ description: string; verificationMethod: string }>;
};

export type WorkspaceDTO = {
  projectId: string;
  viewerRole: "owner" | "builder";
  title: string;
  startedAt: string;
  status: "IN_PROGRESS" | "FINAL_REVIEW" | "COMPLETED";
  completedAt: string | null;
  milestones: WorkspaceMilestoneDTO[];
};
