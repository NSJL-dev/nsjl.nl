import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
export function stagingOnly(){if(process.env.APP_ENV==='production')throw new Error('Dit hulpmiddel is uitsluitend voor development/staging. Productie-cutover vereist aparte expliciete toestemming.');}
