import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.qpark.app',
  appName: 'QPark',
  webDir: 'out',
  server: {
    url: 'https://q-park.vercel.app',
    cleartext: true
  }
};

export default config;
