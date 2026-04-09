import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const config = {
  development: {
    client: 'better-sqlite3',
    connection: {
      filename: path.resolve(process.env.DATABASE_PATH || './database.sqlite'),
    },
    useNullAsDefault: true,
    migrations: {
      directory: './migrations',
      extension: 'js',
      loadExtensions: ['.js'],
    },
    seeds: {
      directory: './seeds',
    },
  },

  production: {
    client: 'better-sqlite3',
    connection: {
      filename: path.resolve(process.env.DATABASE_PATH || './database.sqlite'),
    },
    useNullAsDefault: true,
    migrations: {
      directory: './migrations',
      extension: 'js',
      loadExtensions: ['.js'],
    },
  },
};

export default config;
