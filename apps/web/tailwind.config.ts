import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/features/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--color-primary)',
          hover: 'var(--color-primary-hover)',
          soft: 'var(--color-primary-soft)',
          foreground: 'var(--color-primary-foreground)',
        },
        canvas: 'var(--color-canvas)',
        surface: 'var(--color-surface)',
        subtle: 'var(--color-subtle)',
        border: 'var(--color-border)',
        ink: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
        },
        chart: {
          indigo: 'var(--chart-indigo)',
          emerald: 'var(--chart-emerald)',
          cyan: 'var(--chart-cyan)',
          amber: 'var(--chart-amber)',
          rose: 'var(--chart-rose)',
        },
        bulk: {
          bg: 'var(--bulk-bar-bg)',
          text: 'var(--bulk-bar-text)',
          border: 'var(--bulk-bar-border)',
        },
      },
      fontFamily: {
        sans: ['var(--font-ibm-arabic)', 'var(--font-inter)', 'system-ui', 'sans-serif'],
        latin: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        arabic: ['var(--font-ibm-arabic)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        card: 'var(--radius-card)',
        control: 'var(--radius-control)',
        pill: 'var(--radius-pill)',
      },
      spacing: {
        sidebar: 'var(--sidebar-width)',
        'sidebar-collapsed': 'var(--sidebar-collapsed-width)',
        topbar: 'var(--topbar-height)',
        'row-compact': 'var(--row-height-compact)',
        'row-comfortable': 'var(--row-height-comfortable)',
        'drawer-md': 'var(--drawer-width-md)',
        'drawer-lg': 'var(--drawer-width-lg)',
      },
      boxShadow: {
        // Enterprise Precision: 1px solid borders, zero heavy shadows
        none: 'none',
        subtle: '0 1px 2px 0 rgba(9, 9, 11, 0.04)',
      },
    },
  },
  plugins: [],
};

export default config;
