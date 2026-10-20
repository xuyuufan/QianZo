import { z } from "zod";

export const safeDeliveryUrlSchema = z.string().min(1).max(2048).superRefine((raw, context) => {
  if (raw !== raw.trim() || /[\u0000-\u001f\u007f]/.test(raw)) {
    context.addIssue({ code: "custom", message: "链接不能包含首尾空白或控制字符。" });
    return;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    context.addIssue({ code: "custom", message: "请填写完整的 HTTP 或 HTTPS 链接。" });
    return;
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    !url.hostname ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.toString().length > 2048
  ) {
    context.addIssue({ code: "custom", message: "仅支持不含账号信息的 HTTP 或 HTTPS 链接。" });
  }
}).transform((raw) => new URL(raw).toString());

export const submitDeliveryInputSchema = z
  .object({
    projectId: z.uuid(),
    milestoneId: z.uuid(),
    submissionKey: z.uuid(),
    expectedCurrentSubmissionId: z.uuid().nullable(),
    summary: z.string().trim().min(1).max(4000),
    links: z.array(safeDeliveryUrlSchema).min(1).max(10),
  })
  .strict()
  .superRefine((input, context) => {
    if (new Set(input.links).size !== input.links.length) {
      context.addIssue({ code: "custom", path: ["links"], message: "链接不能重复。" });
    }
  });

export const reviewDeliveryInputSchema = z
  .object({
    projectId: z.uuid(),
    milestoneId: z.uuid(),
    submissionId: z.uuid(),
    criteriaResults: z
      .array(
        z
          .object({
            position: z.number().int().min(1).max(20),
            outcome: z.enum(["PASS", "FAIL"]),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    reason: z.string().trim().max(2000).optional().nullable(),
  })
  .strict();

export const completeProjectInputSchema = z.object({ projectId: z.uuid() }).strict();

export type SubmitDeliveryInput = z.infer<typeof submitDeliveryInputSchema>;
export type ReviewDeliveryInput = z.infer<typeof reviewDeliveryInputSchema>;
