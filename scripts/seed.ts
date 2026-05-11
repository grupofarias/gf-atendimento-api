/**
 * Script de seed inicial. Roda UMA VEZ no servidor com .env preenchido.
 * Uso: npx ts-node -r tsconfig-paths/register scripts/seed.ts
 *
 * Variaveis de ambiente necessarias (alem das padrao do .env):
 *   SEED_CHATWOOT_TOKEN     — api_access_token da conta Chatwoot (account_id=1)
 *   SEED_N8N_WEBHOOK_URL    — URL do workflow n8n que recebe InternalMessage
 *   SEED_INBOX_ID           — chatwoot_inbox_id do inbox existente (numero inteiro)
 *   SEED_EVOLUTION_NAME     — nome da instancia Evolution (opcional, se WhatsApp)
 *   SEED_EVOLUTION_URL      — base_url da Evolution (opcional)
 *   SEED_EVOLUTION_KEY      — api_key da Evolution (opcional)
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';

dotenv.config();

import { encrypt } from '../src/common/crypto/encrypt.util';
import { AppDataSource } from '../src/database/data-source';

async function seed() {
  const appSecret = process.env.APP_SECRET;
  const chatwootToken = process.env.SEED_CHATWOOT_TOKEN;
  const n8nWebhookUrl = process.env.SEED_N8N_WEBHOOK_URL;
  const inboxId = parseInt(process.env.SEED_INBOX_ID ?? '', 10);

  if (!appSecret || !chatwootToken || !n8nWebhookUrl || !inboxId) {
    console.error('Variaveis obrigatorias ausentes: APP_SECRET, SEED_CHATWOOT_TOKEN, SEED_N8N_WEBHOOK_URL, SEED_INBOX_ID');
    process.exit(1);
  }

  await AppDataSource.initialize();
  const qr = AppDataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();

  try {
    const encryptedToken = encrypt(chatwootToken, appSecret);

    await qr.query(
      `INSERT INTO chatwoot_accounts (account_id, base_url, api_token)
       VALUES ($1, $2, $3)
       ON CONFLICT (account_id) DO UPDATE SET api_token = EXCLUDED.api_token, base_url = EXCLUDED.base_url`,
      [1, 'https://chatwootpainel.infragf.com.br', encryptedToken],
    );

    await qr.query(
      `INSERT INTO bots (code, processor, webhook_url)
       VALUES ($1, $2, $3)
       ON CONFLICT (code) DO UPDATE SET webhook_url = EXCLUDED.webhook_url`,
      ['atendimento-geral', 'n8n', n8nWebhookUrl],
    );

    const evolutionName = process.env.SEED_EVOLUTION_NAME;
    let evolutionInstanceId: number | null = null;

    if (evolutionName) {
      const evolutionUrl = process.env.SEED_EVOLUTION_URL;
      const evolutionKey = process.env.SEED_EVOLUTION_KEY;
      if (!evolutionUrl || !evolutionKey) {
        throw new Error('SEED_EVOLUTION_URL e SEED_EVOLUTION_KEY sao obrigatorios quando SEED_EVOLUTION_NAME e fornecido');
      }
      const encryptedEvKey = encrypt(evolutionKey, appSecret);
      const evResult = (await qr.query(
        `INSERT INTO evolution_instances (instance_name, base_url, api_key)
         VALUES ($1, $2, $3)
         ON CONFLICT (instance_name) DO UPDATE SET api_key = EXCLUDED.api_key, base_url = EXCLUDED.base_url
         RETURNING id`,
        [evolutionName, evolutionUrl, encryptedEvKey],
      )) as Array<{ id: number }>;
      evolutionInstanceId = evResult[0].id;
    }

    const botResult = (await qr.query(`SELECT id FROM bots WHERE code = 'atendimento-geral'`)) as Array<{ id: number }>;
    const botId = botResult[0].id;

    const channelType = evolutionInstanceId ? 'whatsapp' : 'api';

    await qr.query(
      `INSERT INTO inbox_config (chatwoot_inbox_id, account_id, evolution_instance_id, bot_id, channel_type)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (chatwoot_inbox_id) DO NOTHING`,
      [inboxId, 1, evolutionInstanceId, botId, channelType],
    );

    await qr.commitTransaction();
    console.log('Seed concluido com sucesso.');
    console.log(`  chatwoot_accounts: account_id=1`);
    console.log(`  bots: code=atendimento-geral`);
    console.log(`  inbox_config: chatwoot_inbox_id=${inboxId}`);
    if (evolutionInstanceId) console.log(`  evolution_instances: ${evolutionName}`);
  } catch (err) {
    await qr.rollbackTransaction();
    console.error('Seed falhou:', err);
    process.exit(1);
  } finally {
    await qr.release();
    await AppDataSource.destroy();
  }
}

seed();
