import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rivan.app',
  appName: 'Rivan Realty',
  webDir: 'dist',
  server: {
    url: 'https://www.rivanrealty.com',
    cleartext: false,
    androidScheme: 'https',
    allowNavigation: [
      'www.rivanrealty.com',
      'rivanrealty.com',
      'rivan-auth-live.firebaseapp.com',
      'rivan-auth-live.web.app',
      '*.firebaseapp.com',
      '*.googleapis.com',
      '*.gstatic.com',
      '*.google.com',
      '*.recaptcha.net'
    ]
  },
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ['phone']
    }
  }
};

export default config;
