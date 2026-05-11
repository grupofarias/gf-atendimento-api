import { MigrationInterface, QueryRunner } from 'typeorm';

export class InboxConfigBotIdNullable20260511000001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "inbox_config" DROP CONSTRAINT IF EXISTS "fk_inbox_config_bot"`);
    await queryRunner.query(`ALTER TABLE "inbox_config" ALTER COLUMN "bot_id" DROP NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE "inbox_config"
      ADD CONSTRAINT "fk_inbox_config_bot"
      FOREIGN KEY ("bot_id") REFERENCES "bots" ("id") ON DELETE SET NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "inbox_config" DROP CONSTRAINT IF EXISTS "fk_inbox_config_bot"`);
    await queryRunner.query(`ALTER TABLE "inbox_config" ALTER COLUMN "bot_id" SET NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE "inbox_config"
      ADD CONSTRAINT "fk_inbox_config_bot"
      FOREIGN KEY ("bot_id") REFERENCES "bots" ("id") ON DELETE RESTRICT
    `);
  }
}
