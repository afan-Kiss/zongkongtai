import path from 'path';
import dotenv from 'dotenv';
import { agentConfig } from './config';
import { scanRoot } from './scanner';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

async function main() {
  const agentId = 'local-scan';
  const payload = scanRoot(agentConfig.scanRoot, agentId);
  console.log(
    JSON.stringify(
      { projectCount: payload.projects.length, ports: payload.runtimePorts.length },
      null,
      2,
    ),
  );

  const res = await fetch(`${agentConfig.serverUrl}/api/ports/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  console.log('Upload status', res.status, await res.text());
}

main().catch(console.error);
