import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const appSchema = pgSchema("app");

export const users = appSchema.table(
  "users",
  {
    id: uuid("id").primaryKey(),
    displayName: text("display_name").notNull(),
    status: text("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "users_display_name_check",
      sql`char_length(${table.displayName}) between 1 and 80 and ${table.displayName} = btrim(${table.displayName})`,
    ),
    check("users_status_check", sql`${table.status} in ('ACTIVE', 'DISABLED')`),
  ],
);

export const userRoles = appSchema.table(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.role] }),
    check("user_roles_role_check", sql`${table.role} in ('ENTERPRISE', 'BUILDER')`),
  ],
);

export const projects = appSchema.table(
  "projects",
  {
    id: uuid("id").primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    originalRequirement: text("original_requirement").notNull().default(""),
    status: text("status").notNull().default("DRAFT"),
    version: integer("version").notNull().default(1),
    // The composite foreign key to `app.spec_versions (project_id, id)` is
    // declared in the migration: it would make the two tables reference each
    // other during module initialisation, and Drizzle never creates DDL here.
    currentSpecVersionId: uuid("current_spec_version_id"),
    budgetMinMinor: bigint("budget_min_minor", { mode: "number" }),
    budgetMaxMinor: bigint("budget_max_minor", { mode: "number" }),
    currency: text("currency"),
    lockedSpecVersionId: uuid("locked_spec_version_id"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    publishedSpecSnapshot: jsonb("published_spec_snapshot"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    selectedApplicationId: uuid("selected_application_id"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // The constraint text below mirrors `supabase/migrations/*` for typing and
  // query building only: the migration files are the single source of truth for
  // the real DDL. This repo has no drizzle-kit config, so nothing here generates
  // or changes migrations.
  (table) => [
    check(
      "projects_title_check",
      sql`char_length(${table.title}) between 1 and 120 and ${table.title} = btrim(${table.title})`,
    ),
    check(
      "projects_original_requirement_check",
      sql`char_length(${table.originalRequirement}) between 0 and 10000`,
    ),
    check(
      "projects_status_check",
      sql`${table.status} in ('DRAFT', 'OPEN', 'AWAITING_BUILDER', 'IN_PROGRESS', 'FINAL_REVIEW', 'COMPLETED')`,
    ),
    check("projects_version_check", sql`${table.version} > 0`),
    index("projects_owner_created_at_idx").on(table.ownerId, table.createdAt.desc()),
  ],
);

export const aipmSessions = appSchema.table(
  "aipm_sessions",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("aipm_sessions_project_unique").on(table.projectId)],
);

export const aipmMessages = appSchema.table(
  "aipm_messages",
  {
    id: uuid("id").primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => aipmSessions.id, { onDelete: "restrict" }),
    // Server-assigned position. `now()` reports the transaction timestamp, so
    // messages written by one transaction would tie on created_at; the explicit
    // sequence keeps the transcript order stable.
    sequence: integer("sequence").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("aipm_messages_session_sequence_unique").on(table.sessionId, table.sequence),
    check("aipm_messages_role_check", sql`${table.role} in ('USER', 'ASSISTANT')`),
    check("aipm_messages_sequence_check", sql`${table.sequence} > 0`),
    check("aipm_messages_content_check", sql`char_length(${table.content}) between 1 and 8000`),
    check(
      "aipm_messages_payload_check",
      sql`${table.payload} is null or jsonb_typeof(${table.payload}) = 'object'`,
    ),
  ],
);

export const specVersions = appSchema.table(
  "spec_versions",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    versionNo: integer("version_no").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    content: jsonb("content").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    sourceMessageId: uuid("source_message_id").references(() => aipmMessages.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("spec_versions_project_version_unique").on(table.projectId, table.versionNo),
    unique("spec_versions_project_id_unique").on(table.projectId, table.id),
    unique("spec_versions_source_message_unique").on(table.sourceMessageId),
    check("spec_versions_version_no_check", sql`${table.versionNo} > 0`),
    check("spec_versions_schema_version_check", sql`${table.schemaVersion} = 1`),
    check("spec_versions_content_check", sql`jsonb_typeof(${table.content}) = 'object'`),
  ],
);

export const applications = appSchema.table(
  "applications",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    builderId: uuid("builder_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    statement: text("statement").notNull(),
    status: text("status").notNull().default("SUBMITTED"),
    specVersionId: uuid("spec_version_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("applications_project_builder_unique").on(table.projectId, table.builderId),
    unique("applications_project_id_unique").on(table.projectId, table.id),
    foreignKey({
      name: "applications_spec_version_fk",
      columns: [table.projectId, table.specVersionId],
      foreignColumns: [specVersions.projectId, specVersions.id],
    }).onDelete("restrict"),
    check(
      "applications_statement_check",
      sql`char_length(${table.statement}) between 1 and 2000 and ${table.statement} = btrim(${table.statement}) and ${table.statement} ~ '[^[:space:]]'`,
    ),
    check(
      "applications_status_check",
      sql`${table.status} in ('SUBMITTED', 'SELECTED', 'ENGAGED', 'REJECTED')`,
    ),
    uniqueIndex("applications_one_selected_per_project_unique")
      .on(table.projectId)
      .where(sql`${table.status} in ('SELECTED', 'ENGAGED')`),
  ],
);

export const payments = appSchema.table(
  "payments",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    applicationId: uuid("application_id"),
    payerId: uuid("payer_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    purpose: text("purpose").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    status: text("status").notNull().default("PENDING"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    succeededAt: timestamp("succeeded_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: "payments_project_application_fk",
      columns: [table.projectId, table.applicationId],
      foreignColumns: [applications.projectId, applications.id],
    }).onDelete("restrict"),
    uniqueIndex("payments_enterprise_project_unique")
      .on(table.projectId)
      .where(sql`${table.purpose} = 'ENTERPRISE_DEPOSIT'`),
    uniqueIndex("payments_builder_application_unique")
      .on(table.applicationId)
      .where(sql`${table.purpose} = 'BUILDER_DEPOSIT'`),
    check(
      "payments_purpose_application_check",
      sql`(${table.purpose} = 'ENTERPRISE_DEPOSIT' and ${table.applicationId} is null) or (${table.purpose} = 'BUILDER_DEPOSIT' and ${table.applicationId} is not null)`,
    ),
    check("payments_amount_check", sql`${table.amountMinor} > 0`),
    check(
      "payments_currency_check",
      sql`char_length(${table.currency}) = 3 and ${table.currency} = upper(${table.currency})`,
    ),
    check("payments_status_check", sql`${table.status} in ('PENDING', 'SUCCEEDED')`),
    check(
      "payments_succeeded_at_check",
      sql`(${table.status} = 'PENDING' and ${table.succeededAt} is null) or (${table.status} = 'SUCCEEDED' and ${table.succeededAt} is not null)`,
    ),
  ],
);

export const milestones = appSchema.table(
  "milestones",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    specVersionId: uuid("spec_version_id").notNull(),
    specMilestoneId: text("spec_milestone_id").notNull(),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    dueAfterDays: integer("due_after_days").notNull(),
    deliverableIds: jsonb("deliverable_ids").notNull(),
    deliverables: jsonb("deliverables").notNull(),
    acceptanceCriteria: jsonb("acceptance_criteria").notNull(),
    status: text("status").notNull(),
    deadline: timestamp("deadline", { withTimezone: true }).notNull(),
    // The migration declares a deferrable composite FK to submissions because
    // submissions also point back to their owning milestone.
    currentSubmissionId: uuid("current_submission_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "milestones_project_spec_fk",
      columns: [table.projectId, table.specVersionId],
      foreignColumns: [specVersions.projectId, specVersions.id],
    }).onDelete("restrict"),
    unique("milestones_project_position_unique").on(table.projectId, table.position),
    unique("milestones_project_id_unique").on(table.projectId, table.id),
    unique("milestones_project_spec_milestone_unique").on(table.projectId, table.specMilestoneId),
    check("milestones_position_check", sql`${table.position} > 0`),
    check(
      "milestones_due_after_days_check",
      sql`${table.dueAfterDays} between 1 and 3650`,
    ),
    check("milestones_deliverable_ids_check", sql`jsonb_typeof(${table.deliverableIds}) = 'array'`),
    check("milestones_deliverables_check", sql`jsonb_typeof(${table.deliverables}) = 'array'`),
    check(
      "milestones_acceptance_criteria_check",
      sql`jsonb_typeof(${table.acceptanceCriteria}) = 'array' and jsonb_array_length(${table.acceptanceCriteria}) between 1 and 20`,
    ),
    check(
      "milestones_status_check",
      sql`${table.status} in ('PENDING', 'IN_PROGRESS', 'IN_REVIEW', 'REVISION', 'APPROVED')`,
    ),
  ],
);

export const submissions = appSchema.table(
  "submissions",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id").notNull(),
    milestoneId: uuid("milestone_id").notNull(),
    builderId: uuid("builder_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    sequence: integer("sequence").notNull(),
    submissionKey: uuid("submission_key").notNull(),
    summary: text("summary").notNull(),
    links: jsonb("links").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "submissions_project_milestone_fk",
      columns: [table.projectId, table.milestoneId],
      foreignColumns: [milestones.projectId, milestones.id],
    }).onDelete("no action"),
    unique("submissions_project_id_unique").on(table.projectId, table.id),
    unique("submissions_project_milestone_id_unique").on(table.projectId, table.milestoneId, table.id),
    unique("submissions_milestone_sequence_unique").on(table.milestoneId, table.sequence),
    unique("submissions_milestone_key_unique").on(table.milestoneId, table.submissionKey),
    check("submissions_sequence_check", sql`${table.sequence} > 0`),
    check(
      "submissions_links_check",
      sql`jsonb_typeof(${table.links}) = 'array' and jsonb_array_length(${table.links}) between 1 and 10`,
    ),
  ],
);

export const submissionReviews = appSchema.table(
  "submission_reviews",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id").notNull(),
    milestoneId: uuid("milestone_id").notNull(),
    submissionId: uuid("submission_id").notNull().unique(),
    reviewerId: uuid("reviewer_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    outcome: text("outcome").notNull(),
    criteriaResults: jsonb("criteria_results").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "submission_reviews_submission_fk",
      columns: [table.projectId, table.milestoneId, table.submissionId],
      foreignColumns: [submissions.projectId, submissions.milestoneId, submissions.id],
    }).onDelete("restrict"),
    check("submission_reviews_outcome_check", sql`${table.outcome} in ('PASS', 'FAIL')`),
    check(
      "submission_reviews_criteria_check",
      sql`jsonb_typeof(${table.criteriaResults}) = 'array' and jsonb_array_length(${table.criteriaResults}) between 1 and 20`,
    ),
  ],
);

export type UserRole = "ENTERPRISE" | "BUILDER";
export type UserStatus = "ACTIVE" | "DISABLED";
export type AipmMessageRole = "USER" | "ASSISTANT";
export type PaymentStatus = "PENDING" | "SUCCEEDED";
export type PaymentPurpose = "ENTERPRISE_DEPOSIT" | "BUILDER_DEPOSIT";
export type ApplicationStatus = "SUBMITTED" | "SELECTED" | "ENGAGED" | "REJECTED";
export type MilestoneStatus = "PENDING" | "IN_PROGRESS" | "IN_REVIEW" | "REVISION" | "APPROVED";
export type ProjectStatus =
  | "DRAFT"
  | "OPEN"
  | "AWAITING_BUILDER"
  | "IN_PROGRESS"
  | "FINAL_REVIEW"
  | "COMPLETED";
export type SubmissionReviewOutcome = "PASS" | "FAIL";
