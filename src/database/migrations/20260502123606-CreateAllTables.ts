import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAllTables20260502123606 implements MigrationInterface {
  name = 'CreateAllTables20260502123606';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "chatwoot_accounts" (
        "id" SERIAL PRIMARY KEY,
        "account_id" INTEGER NOT NULL,
        "base_url" VARCHAR(255) NOT NULL,
        "api_token" TEXT NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "uq_chatwoot_accounts_account_id" UNIQUE ("account_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "evolution_instances" (
        "id" SERIAL PRIMARY KEY,
        "instance_name" VARCHAR(100) NOT NULL,
        "base_url" VARCHAR(255) NOT NULL,
        "api_key" TEXT NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "uq_evolution_instances_name" UNIQUE ("instance_name")
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "bots_processor_enum" AS ENUM ('n8n', 'botpress')
    `);

    await queryRunner.query(`
      CREATE TABLE "bots" (
        "id" SERIAL PRIMARY KEY,
        "code" VARCHAR(50) NOT NULL,
        "processor" "bots_processor_enum" NOT NULL,
        "webhook_url" VARCHAR(500) NOT NULL,
        "webhook_secret" VARCHAR(255),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "uq_bots_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "inbox_config_channel_type_enum" AS ENUM ('whatsapp', 'webchat', 'instagram', 'facebook', 'api')
    `);

    await queryRunner.query(`
      CREATE TABLE "inbox_config" (
        "id" SERIAL PRIMARY KEY,
        "chatwoot_inbox_id" INTEGER NOT NULL,
        "account_id" INTEGER NOT NULL,
        "evolution_instance_id" INTEGER,
        "bot_id" INTEGER NOT NULL,
        "channel_type" "inbox_config_channel_type_enum" NOT NULL,
        "active" BOOLEAN NOT NULL DEFAULT TRUE,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "uq_inbox_config_chatwoot_inbox_id" UNIQUE ("chatwoot_inbox_id"),
        CONSTRAINT "fk_inbox_config_account" FOREIGN KEY ("account_id") REFERENCES "chatwoot_accounts" ("account_id") ON DELETE RESTRICT,
        CONSTRAINT "fk_inbox_config_evolution" FOREIGN KEY ("evolution_instance_id") REFERENCES "evolution_instances" ("id") ON DELETE SET NULL,
        CONSTRAINT "fk_inbox_config_bot" FOREIGN KEY ("bot_id") REFERENCES "bots" ("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_inbox_config_account_inbox" ON "inbox_config" ("account_id", "chatwoot_inbox_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "contacts" (
        "id" SERIAL PRIMARY KEY,
        "chatwoot_account_id" INTEGER NOT NULL,
        "phone" VARCHAR(20) NOT NULL,
        "chatwoot_contact_id" INTEGER,
        "name" VARCHAR(255),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "uq_contact_account_phone" UNIQUE ("chatwoot_account_id", "phone"),
        CONSTRAINT "fk_contacts_account" FOREIGN KEY ("chatwoot_account_id") REFERENCES "chatwoot_accounts" ("account_id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_contacts_account_phone" ON "contacts" ("chatwoot_account_id", "phone")
    `);

    await queryRunner.query(`
      CREATE TYPE "conversations_status_enum" AS ENUM ('open', 'pending', 'resolved', 'snoozed')
    `);

    await queryRunner.query(`
      CREATE TABLE "conversations" (
        "id" SERIAL PRIMARY KEY,
        "chatwoot_conversation_id" INTEGER NOT NULL,
        "inbox_id" INTEGER NOT NULL,
        "contact_id" INTEGER NOT NULL,
        "bot_active" BOOLEAN NOT NULL DEFAULT TRUE,
        "status" "conversations_status_enum" NOT NULL DEFAULT 'open',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "uq_conversations_chatwoot_id" UNIQUE ("chatwoot_conversation_id"),
        CONSTRAINT "fk_conversations_inbox" FOREIGN KEY ("inbox_id") REFERENCES "inbox_config" ("chatwoot_inbox_id") ON DELETE RESTRICT,
        CONSTRAINT "fk_conversations_contact" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_conversations_chatwoot_id" ON "conversations" ("chatwoot_conversation_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_conversations_inbox_contact" ON "conversations" ("inbox_id", "contact_id")
    `);

    await queryRunner.query(`
      CREATE TYPE "handoff_log_triggered_by_enum" AS ENUM ('n8n', 'chatwoot_assignee')
    `);

    await queryRunner.query(`
      CREATE TABLE "handoff_log" (
        "id" SERIAL PRIMARY KEY,
        "conversation_id" INTEGER NOT NULL,
        "triggered_by" "handoff_log_triggered_by_enum" NOT NULL,
        "team_id" INTEGER,
        "agent_id" INTEGER,
        "reason" TEXT,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "fk_handoff_log_conversation" FOREIGN KEY ("conversation_id") REFERENCES "conversations" ("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "outbox_status_enum" AS ENUM ('pending', 'sent', 'failed')
    `);

    await queryRunner.query(`
      CREATE TABLE "outbox" (
        "id" SERIAL PRIMARY KEY,
        "conversation_id" INTEGER NOT NULL,
        "payload" JSONB NOT NULL,
        "webhook_url" VARCHAR(500) NOT NULL,
        "status" "outbox_status_enum" NOT NULL DEFAULT 'pending',
        "attempts" SMALLINT NOT NULL DEFAULT 0,
        "last_error" TEXT,
        "sent_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "fk_outbox_conversation" FOREIGN KEY ("conversation_id") REFERENCES "conversations" ("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_outbox_status_created" ON "outbox" ("status", "created_at")
    `);

    await queryRunner.query(`
      CREATE TABLE "processed_events" (
        "id" SERIAL PRIMARY KEY,
        "source" VARCHAR(50) NOT NULL,
        "external_id" VARCHAR(255) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "uq_processed_events_source_external" UNIQUE ("source", "external_id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_processed_events_created_at" ON "processed_events" ("created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "processed_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "outbox"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "outbox_status_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "handoff_log"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "handoff_log_triggered_by_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "conversations"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "conversations_status_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "contacts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "inbox_config"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "inbox_config_channel_type_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bots"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "bots_processor_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "evolution_instances"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chatwoot_accounts"`);
  }
}
