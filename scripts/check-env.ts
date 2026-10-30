import 'dotenv/config';
import { serviceVariables } from '../src/lib/services-config.js';

let missing = 0;
for (const [group,names] of Object.entries(serviceVariables)) {
  const absent = names.filter(name => !process.env[name]); missing += absent.length;
  console.log(`${group}: ${absent.length ? `pendiente ${absent.join(', ')}` : 'variables presentes (conexión aún no acreditada)'}`);
}
process.exitCode = missing ? 1 : 0;
