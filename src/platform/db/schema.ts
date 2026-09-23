import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "projects_title_check",
      sql`char_length(${table.title}) between 1 and 120 and ${table.title} = btrim(${table.title})`,
    ),
    check(
      "projects_original_requirement_check",
      sql`char_length(${table.originalRequirement}) between 0 and 10000`,
    ),
    check("projects_status_check", sql`${table.status} = 'DRAFT'`),
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

export type UserRole = "ENTERPRISE" | "BUILDER";
export type UserStatus = "ACTIVE" | "DISABLED";
export type AipmMessageRole = "USER" | "ASSISTANT";
