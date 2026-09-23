import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgSchema,
  primaryKey,
  text,
  timestamp,
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

export type UserRole = "ENTERPRISE" | "BUILDER";
export type UserStatus = "ACTIVE" | "DISABLED";
