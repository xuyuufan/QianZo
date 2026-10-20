import type { MilestoneStatus } from "@/platform/db/schema";

export type WorkspaceMilestoneDTO = {
  id: string;
  position: number;
  title: string;
  description: string;
  deadline: string;
  status: MilestoneStatus;
  deliverables: Array<{ title: string; description: string }>;
  acceptanceCriteria: Array<{ description: string; verificationMethod: string }>;
};

export type WorkspaceDTO = {
  projectId: string;
  viewerRole: "owner" | "builder";
  title: string;
  startedAt: string;
  milestones: WorkspaceMilestoneDTO[];
};
