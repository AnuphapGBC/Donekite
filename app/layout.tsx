import type { Metadata } from 'next';
import { ThemeProvider } from '@/components/theme-provider';
import './globals.css';
import './workspace.css';
import './account.css';
import './industry.css';
import './record-details.css';
import './enquiry-editor.css';
import './enquiry-list.css';
import './theme.css';
export const metadata: Metadata = {
  title: 'DoneKite — less admin, more business',
  description: 'A shared workspace for service businesses. Manage customer enquiries, prepare quotes, track invoices, and keep your team in sync.',
  icons:{icon:'/favicon.svg'}
};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>) {
  return <html lang="en" suppressHydrationWarning>
    <head>
      <script dangerouslySetInnerHTML={{ __html: `(function(){var t;try{t=localStorage.getItem('donekite-theme')}catch(e){}if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t})()` }} />
    </head>
    <body><ThemeProvider>{children}</ThemeProvider></body>
  </html>;
}
