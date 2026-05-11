import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConversationFixes20260511000002 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Drop FK from conversations.inbox_id → inbox_config (InboxConfig no longer required)
    await queryRunner.query(`
      ALTER TABLE "conversations"
      DROP CONSTRAINT IF EXISTS "fk_conversations_inbox_config"
    `);
    await queryRunner.query(`
      ALTER TABLE "conversations"
      DROP CONSTRAINT IF EXISTS "FK_conversations_inbox_config"
    `);
    // Drop any auto-generated FK by TypeORM on inbox_id
    await queryRunner.query(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN
          SELECT conname FROM pg_constraint
          WHERE conrelid = 'conversations'::regclass
            AND contype = 'f'
            AND conname LIKE '%inbox%'
        LOOP
          EXECUTE 'ALTER TABLE conversations DROP CONSTRAINT ' || quote_ident(r.conname);
        END LOOP;
      END $$
    `);

    // Make contact_id nullable
    await queryRunner.query(`ALTER TABLE "conversations" ALTER COLUMN "contact_id" DROP NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "conversations" ALTER COLUMN "contact_id" SET NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE "conversations"
      ADD CONSTRAINT "fk_conversations_inbox_config"
      FOREIGN KEY ("inbox_id") REFERENCES "inbox_config" ("chatwoot_inbox_id") ON DELETE SET NULL
    `);
  }
}
