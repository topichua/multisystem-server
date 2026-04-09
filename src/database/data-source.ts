import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { getDataSourceOptions } from './typeorm-connection-options';

config();

export default new DataSource(getDataSourceOptions(process.env));
