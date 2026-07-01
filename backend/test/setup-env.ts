import { config } from 'dotenv';

// override:true para que .env.test gane sobre cualquier .env ya cargado.
config({ path: '.env.test', override: true });
