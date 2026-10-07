import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

const RELEASE_VERSION = '1.7.6';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  publicDir: 'src/public',
  modules: ['@wxt-dev/module-react', '@wxt-dev/i18n/module'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  zip: {
    artifactTemplate: '{{name}}-{{version}}-{{browser}}-mv3.zip',
  },
  manifest: {
    name: 'Motrix Extension',
    description: 'Motrix Extension with a full IDM-style picker and media/link capture',
    version: RELEASE_VERSION,
    version_name: RELEASE_VERSION,
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAjjRLRrhJc4IJdmC2tczUCsWejGiNDyDz6qt27gga4RKtijGiTG3WjKSNjonumhECeiLmHSzAAHrDfXVvEYup9Z1GvF83gSNcxFTsRW6BOxhEguXpIlmlMrFR7cMcQYTiCZ6AnJkWHxGqB4WArGiPhdiZS1q0CIJqMJ3lvpfGFp0DYHNuxbxgOWFV3HOft+uXnnfdc/iIXT15dZdVTm3RJa+KY43FW2ci6NsTKVGd7zU1Bb1Bn3XMGkqWQCqD3e0LJh4XA55CUsugJtig52ny/0H5im+dxtu0hpV4DnsgjfREH0X55efJ7RJ1ebfNMMJWUJCjOjDHGYcXPOMCUB1hYwIDAQAB',
    browser_specific_settings: {
      gecko: {
        id: 'motrixextension@mhasanbogura',
        strict_min_version: '109.0',
      },
    },
    minimum_chrome_version: '116',
    default_locale: 'en_US',
    action: {
      default_title: 'Motrix',
      default_popup: 'popup.html',
    },
    options_ui: {
      page: 'options.html',
      open_in_tab: true,
    },
    permissions: [
      'downloads',
      'windows',
      'storage',
      'contextMenus',
      'cookies',
      'webRequest',
      'nativeMessaging',
    ],
    host_permissions: [
      'http://*/*',
      'https://*/*',
      'http://127.0.0.1:16800/*',
      'http://localhost:16800/*',
      'http://[::1]:16800/*',
    ],
  },
});
