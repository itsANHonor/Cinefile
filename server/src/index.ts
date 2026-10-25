import { startFullServer } from './index-full';

const PORT = Number(process.env.PORT) || 3000;

startFullServer({ port: PORT }).catch((err) => {
  console.error('❌ Failed to start Cinefile server:', err);
  process.exit(1);
});

