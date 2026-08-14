import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      // Feste mm-Maße für die A5-Karte, damit Bildschirm-Vorschau und
      // PDF-Layout (siehe src/lib/pdf.ts) dieselben Proportionen nutzen.
      spacing: {
        'a5-w': '148mm',
        'a5-h': '210mm',
      },
    },
  },
  plugins: [],
};

export default config;
