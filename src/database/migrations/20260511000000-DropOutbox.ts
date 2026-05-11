import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropOutbox20260511000000 implements MigrationInterface {
  name = 'DropOutbox20260511000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "outbox" CASCADE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "outbox" (
        "id" SERIAL NOT NULL,
        "conversation_id" integer NOT NULL,
        "payload" jsonb NOT NULL,
        "webhook_url" character varying(500) NOT NULL,
        "status" "public"."outbox_status_enum" NOT NULL DEFAULT 'pending',
        "attempts" smallint NOT NULL DEFAULT '0',
        "last_error" text,
        "sent_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_outbox" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_outbox_status_created_at" ON "outbox" ("status", "created_at")`,
    );
  }
}
