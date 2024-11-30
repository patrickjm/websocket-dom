import { TestServer } from './server';

const server = new TestServer();
server.start()
  .catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });