const { Client } = require('pg');
const client = new Client({
  host: 'admin.activa.education',
  user: 'n8n',
  password: '6K1eRJs2Dmq6C73wqkn0mUQI9siW',
  database: 'ActivaSystem',
  port: 5432,
  ssl: { rejectUnauthorized: false }
});
client.connect().then(() => {
  return client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`);
}).then(r => {
  console.log('TABLES:\n' + r.rows.map(x => x.table_name).join('\n'));
  return client.end();
}).catch(e => { console.error('ERROR:', e.message); client.end(); });
